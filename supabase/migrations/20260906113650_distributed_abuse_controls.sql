-- Authoritative, restart-safe abuse budgets for security-sensitive mutations.
-- Stores only actor UUID, operation, fixed window, and counters; never content,
-- IP addresses, user agents, credentials, or model prompts.

create table public.abuse_rate_limit_windows (
  actor_id uuid not null,
  operation text not null check (operation in (
    'ai_request', 'ai_vision',
    'direct_chat_create', 'direct_chat_send',
    'project_application_create', 'project_application_transition',
    'project_invitation_create', 'project_invitation_transition'
  )),
  window_started_at timestamptz not null,
  window_ends_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  primary key (actor_id, operation, window_started_at),
  check (window_ends_at > window_started_at)
);

create index abuse_rate_limit_windows_expiry_idx
on public.abuse_rate_limit_windows (window_ends_at);

create table public.ai_capacity_leases (
  lease_id uuid primary key,
  actor_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  check (expires_at > created_at)
);

create index ai_capacity_leases_actor_expiry_idx
on public.ai_capacity_leases (actor_id, expires_at);

alter table public.abuse_rate_limit_windows enable row level security;
alter table public.ai_capacity_leases enable row level security;

revoke all on table public.abuse_rate_limit_windows from public, anon, authenticated, service_role;
revoke all on table public.ai_capacity_leases from public, anon, authenticated, service_role;

create function public.consume_abuse_budget(p_actor_id uuid, p_operation text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_window_seconds integer := 900;
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_count integer;
  v_allowed boolean := false;
begin
  if p_actor_id is null then
    raise exception using errcode = '22023', message = 'abuse_budget_actor_required';
  end if;

  v_limit := case p_operation
    when 'ai_request' then 20
    when 'ai_vision' then 10
    when 'direct_chat_create' then 10
    when 'direct_chat_send' then 90
    when 'project_application_create' then 20
    when 'project_application_transition' then 60
    when 'project_invitation_create' then 30
    when 'project_invitation_transition' then 60
    else null
  end;
  if v_limit is null then
    raise exception using errcode = '22023', message = 'abuse_budget_operation_invalid';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / v_window_seconds) * v_window_seconds
  );
  v_window_end := v_window_start + make_interval(secs => v_window_seconds);

  -- Serialize one actor/operation/window across every backend process and
  -- direct authenticated RPC. The lock is transaction-scoped and hash input
  -- contains no private content.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_actor_id::text || ':' || p_operation || ':' || v_window_start::text, 0)
  );

  select request_count into v_count
  from public.abuse_rate_limit_windows
  where actor_id = p_actor_id
    and operation = p_operation
    and window_started_at = v_window_start
  for update;

  if not found then
    insert into public.abuse_rate_limit_windows (
      actor_id, operation, window_started_at, window_ends_at, request_count
    ) values (p_actor_id, p_operation, v_window_start, v_window_end, 1);
    v_count := 1;
    v_allowed := true;
  elsif v_count < v_limit then
    update public.abuse_rate_limit_windows
    set request_count = request_count + 1
    where actor_id = p_actor_id
      and operation = p_operation
      and window_started_at = v_window_start
    returning request_count into v_count;
    v_allowed := true;
  end if;

  -- Bounded opportunistic retention for this actor only.
  delete from public.abuse_rate_limit_windows
  where actor_id = p_actor_id and window_ends_at < clock_timestamp() - interval '1 day';

  return jsonb_build_object(
    'allowed', v_allowed,
    'limit', v_limit,
    'remaining', greatest(v_limit - coalesce(v_count, v_limit), 0),
    'reset_at', v_window_end
  );
end;
$$;

create function public.enforce_authenticated_abuse_budget()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_result jsonb;
begin
  -- UPDATE triggers use transition tables and only meter actual business-state
  -- changes. This excludes zero-row statements and FK-maintained metadata such
  -- as decided_by -> NULL during auth-user deletion. A real status transition
  -- still requires an authenticated actor, so NULL auth.uid() is not a general
  -- bypass for protected mutations.
  if tg_op = 'UPDATE' then
    if tg_level <> 'STATEMENT' then
      raise exception using errcode = '55000', message = 'abuse_budget_transition_trigger_invalid';
    end if;
    if not exists (
      select 1
      from old_rows old_row
      join new_rows new_row using (id)
      where old_row.status is distinct from new_row.status
    ) then
      return null;
    end if;
  end if;

  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  v_result := public.consume_abuse_budget(v_actor, tg_argv[0]);
  if not (v_result ->> 'allowed')::boolean then
    raise exception using errcode = 'P0001', message = 'abuse_rate_limit_exceeded';
  end if;
  if tg_level = 'ROW' then
    return new;
  end if;
  return null;
end;
$$;

create trigger direct_conversation_create_abuse_budget
before insert on public.direct_conversations
for each row execute function public.enforce_authenticated_abuse_budget('direct_chat_create');

create trigger direct_message_send_abuse_budget
before insert on public.direct_messages
for each row execute function public.enforce_authenticated_abuse_budget('direct_chat_send');

create trigger project_application_create_abuse_budget
before insert on public.project_applications
for each row execute function public.enforce_authenticated_abuse_budget('project_application_create');

create trigger project_application_transition_abuse_budget
after update on public.project_applications
referencing old table as old_rows new table as new_rows
for each statement execute function public.enforce_authenticated_abuse_budget('project_application_transition');

create trigger project_invitation_create_abuse_budget
before insert on public.project_invitations
for each row execute function public.enforce_authenticated_abuse_budget('project_invitation_create');

create trigger project_invitation_transition_abuse_budget
after update on public.project_invitations
referencing old table as old_rows new table as new_rows
for each statement execute function public.enforce_authenticated_abuse_budget('project_invitation_transition');

create function public.acquire_ai_capacity(
  p_actor_id uuid,
  p_lease_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  if p_actor_id is null or p_lease_id is null then
    raise exception using errcode = '22023', message = 'ai_capacity_parameters_invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('engineerus_ai_capacity_v1'));
  delete from public.ai_capacity_leases where expires_at <= v_now;

  if (select count(*) from public.ai_capacity_leases where actor_id = p_actor_id) >= 1
    or (select count(*) from public.ai_capacity_leases) >= 8 then
    return false;
  end if;

  insert into public.ai_capacity_leases (lease_id, actor_id, created_at, expires_at)
  values (p_lease_id, p_actor_id, v_now, v_now + interval '120 seconds');
  return true;
end;
$$;

create function public.release_ai_capacity(p_actor_id uuid, p_lease_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with removed as (
    delete from public.ai_capacity_leases
    where actor_id = p_actor_id and lease_id = p_lease_id
    returning 1
  )
  select exists(select 1 from removed)
$$;

revoke all on function public.consume_abuse_budget(uuid, text)
from public, anon, authenticated, service_role;
revoke all on function public.enforce_authenticated_abuse_budget()
from public, anon, authenticated, service_role;
revoke all on function public.acquire_ai_capacity(uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.release_ai_capacity(uuid, uuid)
from public, anon, authenticated, service_role;

grant execute on function public.consume_abuse_budget(uuid, text) to service_role;
grant execute on function public.acquire_ai_capacity(uuid, uuid) to service_role;
grant execute on function public.release_ai_capacity(uuid, uuid) to service_role;

comment on table public.abuse_rate_limit_windows is
  'Minimal fixed-window abuse counters. Contains no request content, IP address, or fingerprint.';
comment on table public.ai_capacity_leases is
  'Short-lived authoritative AI work leases shared across backend processes.';
