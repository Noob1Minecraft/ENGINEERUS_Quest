-- Extend the existing Pack 2B authoritative budget to additional costly or
-- security-sensitive backend operations. The store remains data-minimal: only
-- actor UUID, operation, fixed window, and counters are retained.

alter table public.abuse_rate_limit_windows
  drop constraint abuse_rate_limit_windows_operation_check;

alter table public.abuse_rate_limit_windows
  add constraint abuse_rate_limit_windows_operation_check check (operation in (
    'ai_request', 'ai_vision',
    'direct_chat_create', 'direct_chat_send',
    'project_application_create', 'project_application_transition',
    'project_invitation_create', 'project_invitation_transition',
    'engimatch', 'document_upload', 'image_upload',
    'beta_feedback', 'admin_mutation'
  ));

create or replace function public.consume_abuse_budget(p_actor_id uuid, p_operation text)
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
    when 'engimatch' then 30
    when 'document_upload' then 10
    when 'image_upload' then 10
    when 'beta_feedback' then 10
    when 'admin_mutation' then 30
    else null
  end;
  if v_limit is null then
    raise exception using errcode = '22023', message = 'abuse_budget_operation_invalid';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / v_window_seconds) * v_window_seconds
  );
  v_window_end := v_window_start + make_interval(secs => v_window_seconds);

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

revoke all on function public.consume_abuse_budget(uuid, text)
from public, anon, authenticated, service_role;
grant execute on function public.consume_abuse_budget(uuid, text) to service_role;

comment on function public.consume_abuse_budget(uuid, text) is
  'Authoritative fixed-window budgets for backend and trigger-enforced abuse controls; stores no request content.';
