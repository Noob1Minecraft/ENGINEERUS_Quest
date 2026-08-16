create or replace function public.award_xp(
  p_user_id uuid,
  p_amount integer,
  p_reason text,
  p_source_type text,
  p_source_id text default null,
  p_idempotency_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (ledger_id uuid, total_xp bigint, level integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ledger_id uuid;
  v_total_xp bigint;
  v_level integer;
begin
  if p_amount <= 0 then
    raise exception 'XP award amount must be positive';
  end if;

  if p_idempotency_key is not null then
    select ledger.id, ledger.balance_after
    into v_ledger_id, v_total_xp
    from public.xp_ledger as ledger
    where ledger.user_id = p_user_id
      and ledger.idempotency_key = p_idempotency_key;

    if found then
      select progress.level into v_level
      from public.user_progress as progress
      where progress.user_id = p_user_id;
      return query select v_ledger_id, v_total_xp, v_level;
      return;
    end if;
  end if;

  insert into public.xp_ledger (
    user_id, amount, balance_after, reason, source_type, source_id,
    idempotency_key, metadata
  )
  values (
    p_user_id, p_amount, 0, p_reason, p_source_type, p_source_id,
    p_idempotency_key, coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (user_id, idempotency_key)
    where idempotency_key is not null
  do nothing
  returning id into v_ledger_id;

  if v_ledger_id is null then
    select ledger.id, ledger.balance_after
    into v_ledger_id, v_total_xp
    from public.xp_ledger as ledger
    where ledger.user_id = p_user_id
      and ledger.idempotency_key = p_idempotency_key;

    select progress.level into v_level
    from public.user_progress as progress
    where progress.user_id = p_user_id;
    return query select v_ledger_id, v_total_xp, v_level;
    return;
  end if;

  insert into public.user_progress (user_id, total_xp, level)
  values (p_user_id, p_amount, floor(p_amount / 100.0)::integer + 1)
  on conflict (user_id) do update
  set total_xp = public.user_progress.total_xp + excluded.total_xp,
      level = floor((public.user_progress.total_xp + excluded.total_xp) / 100.0)::integer + 1
  returning public.user_progress.total_xp, public.user_progress.level
  into v_total_xp, v_level;

  update public.xp_ledger
  set balance_after = v_total_xp
  where id = v_ledger_id;

  return query select v_ledger_id, v_total_xp, v_level;
end;
$$;

create or replace function public.record_user_progress(
  p_user_id uuid,
  p_requests integer default 0,
  p_material integer default 0,
  p_patent integer default 0,
  p_module text default null
)
returns public.user_progress
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_progress public.user_progress;
begin
  if p_requests < 0 or p_material < 0 or p_patent < 0 then
    raise exception 'Progress increments cannot be negative';
  end if;

  insert into public.user_progress (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  update public.user_progress
  set requests_count = requests_count + p_requests,
      material_count = material_count + p_material,
      patent_count = patent_count + p_patent,
      modules_used = case
        when p_module is null or p_module = any(modules_used) then modules_used
        else array_append(modules_used, p_module)
      end,
      last_activity_date = current_date
  where user_id = p_user_id
  returning * into v_progress;

  return v_progress;
end;
$$;

create or replace function public.complete_quest(
  p_user_id uuid,
  p_quest_id text,
  p_cycle_key text default 'once'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_definition public.quest_definitions;
  v_user_quest_id uuid;
  v_award record;
begin
  select * into v_definition
  from public.quest_definitions
  where id = p_quest_id and is_active = true;

  if not found then
    raise exception 'Quest is not active or does not exist';
  end if;

  insert into public.user_quests (
    user_id, quest_id, cycle_key, status, completed_at
  )
  values (
    p_user_id, p_quest_id, p_cycle_key, 'completed', now()
  )
  on conflict (user_id, quest_id, cycle_key) do nothing
  returning id into v_user_quest_id;

  if v_user_quest_id is null then
    return jsonb_build_object('awarded', false, 'reason', 'already_completed');
  end if;

  select * into v_award
  from public.award_xp(
    p_user_id,
    v_definition.xp_reward,
    'Quest completed: ' || p_quest_id,
    'quest',
    p_quest_id,
    'quest:' || p_quest_id || ':' || p_cycle_key,
    jsonb_build_object('quest_id', p_quest_id, 'cycle_key', p_cycle_key)
  );

  update public.user_quests
  set xp_ledger_id = v_award.ledger_id
  where id = v_user_quest_id;

  return jsonb_build_object(
    'awarded', true,
    'quest_id', p_quest_id,
    'xp_awarded', v_definition.xp_reward,
    'total_xp', v_award.total_xp,
    'level', v_award.level
  );
end;
$$;

revoke all on function public.award_xp(uuid, integer, text, text, text, text, jsonb)
from public, anon, authenticated;
revoke all on function public.record_user_progress(uuid, integer, integer, integer, text)
from public, anon, authenticated;
revoke all on function public.complete_quest(uuid, text, text)
from public, anon, authenticated;

grant execute on function public.award_xp(uuid, integer, text, text, text, text, jsonb)
to service_role;
grant execute on function public.record_user_progress(uuid, integer, integer, integer, text)
to service_role;
grant execute on function public.complete_quest(uuid, text, text)
to service_role;
