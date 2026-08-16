alter table public.chat_sessions
drop constraint chat_sessions_module_check;

alter table public.chat_sessions
add constraint chat_sessions_module_check
check (module in ('tutor', 'material', 'patent', 'engi_legal', 'engi_match'));

alter table public.chat_messages
drop constraint chat_messages_module_check;

alter table public.chat_messages
add constraint chat_messages_module_check
check (module in ('tutor', 'material', 'patent', 'engi_legal', 'engi_match'));

alter table public.chat_messages
add column request_id text
check (request_id is null or char_length(request_id) between 8 and 160);

create unique index chat_messages_request_role_unique
on public.chat_messages (user_id, session_id, request_id, role)
where request_id is not null;

create or replace function public.begin_ai_exchange(
  p_user_id uuid,
  p_session_id uuid,
  p_request_id text,
  p_content text,
  p_module text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_message public.chat_messages;
  v_assistant_message public.chat_messages;
  v_progress public.user_progress;
begin
  if p_request_id is null or char_length(p_request_id) not between 8 and 160 then
    raise exception 'Invalid AI request identifier';
  end if;

  if p_content is null or char_length(btrim(p_content)) not between 1 and 20000 then
    raise exception 'Invalid AI message content';
  end if;

  if p_module not in ('tutor', 'material', 'patent', 'engi_legal', 'engi_match') then
    raise exception 'Invalid AI module';
  end if;

  if not exists (
    select 1 from public.chat_sessions
    where id = p_session_id and user_id = p_user_id
  ) then
    raise exception 'Chat session not found';
  end if;

  insert into public.chat_messages (
    session_id, user_id, role, content, module, request_id
  )
  values (
    p_session_id, p_user_id, 'user', btrim(p_content), p_module, p_request_id
  )
  on conflict (user_id, session_id, request_id, role)
    where request_id is not null
  do nothing;

  select * into strict v_user_message
  from public.chat_messages
  where user_id = p_user_id
    and session_id = p_session_id
    and request_id = p_request_id
    and role = 'user';

  select * into v_assistant_message
  from public.chat_messages
  where user_id = p_user_id
    and session_id = p_session_id
    and request_id = p_request_id
    and role = 'assistant';

  select * into strict v_progress
  from public.user_progress
  where user_id = p_user_id;

  return jsonb_build_object(
    'user_message', to_jsonb(v_user_message),
    'assistant_message', case
      when v_assistant_message.id is null then null
      else to_jsonb(v_assistant_message)
    end,
    'progress', to_jsonb(v_progress)
  );
end;
$$;

create or replace function public.complete_ai_exchange(
  p_user_id uuid,
  p_session_id uuid,
  p_request_id text,
  p_content text,
  p_module text,
  p_xp_amount integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_message public.chat_messages;
  v_assistant_message public.chat_messages;
  v_progress public.user_progress;
  v_award record;
  v_inserted boolean := false;
begin
  if p_xp_amount not in (10, 15) then
    raise exception 'Invalid server XP award';
  end if;

  if p_content is null or char_length(btrim(p_content)) not between 1 and 20000 then
    raise exception 'Invalid AI response content';
  end if;

  select * into v_user_message
  from public.chat_messages
  where user_id = p_user_id
    and session_id = p_session_id
    and request_id = p_request_id
    and role = 'user';

  if v_user_message.id is null then
    raise exception 'AI request has not been started';
  end if;

  if v_user_message.module <> p_module then
    raise exception 'AI request module does not match';
  end if;

  insert into public.chat_messages (
    session_id, user_id, role, content, module, request_id, xp_awarded
  )
  values (
    p_session_id, p_user_id, 'assistant', btrim(p_content), p_module,
    p_request_id, p_xp_amount
  )
  on conflict (user_id, session_id, request_id, role)
    where request_id is not null
  do nothing
  returning * into v_assistant_message;

  v_inserted := v_assistant_message.id is not null;

  if v_inserted then
    select * into v_award
    from public.award_xp(
      p_user_id,
      p_xp_amount,
      'AI module used: ' || p_module,
      'ai_module',
      p_session_id::text,
      'ai:' || p_request_id,
      jsonb_build_object(
        'module', p_module,
        'session_id', p_session_id,
        'request_id', p_request_id
      )
    );

    select * into v_progress
    from public.record_user_progress(
      p_user_id,
      1,
      case when p_module = 'material' then 1 else 0 end,
      case when p_module = 'patent' then 1 else 0 end,
      p_module
    );

    update public.chat_sessions
    set updated_at = now()
    where id = p_session_id and user_id = p_user_id;
  else
    select * into strict v_assistant_message
    from public.chat_messages
    where user_id = p_user_id
      and session_id = p_session_id
      and request_id = p_request_id
      and role = 'assistant';

    select * into strict v_progress
    from public.user_progress
    where user_id = p_user_id;
  end if;

  return jsonb_build_object(
    'awarded', v_inserted,
    'user_message', to_jsonb(v_user_message),
    'assistant_message', to_jsonb(v_assistant_message),
    'progress', to_jsonb(v_progress)
  );
end;
$$;

revoke all on function public.begin_ai_exchange(uuid, uuid, text, text, text)
from public, anon, authenticated;
revoke all on function public.complete_ai_exchange(uuid, uuid, text, text, text, integer)
from public, anon, authenticated;

grant execute on function public.begin_ai_exchange(uuid, uuid, text, text, text)
to service_role;
grant execute on function public.complete_ai_exchange(uuid, uuid, text, text, text, integer)
to service_role;

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
  v_progress public.user_progress;
  v_user_quest_id uuid;
  v_award record;
  v_criteria_type text;
  v_minimum bigint;
begin
  select * into v_definition
  from public.quest_definitions
  where id = p_quest_id and is_active = true;

  if not found then
    raise exception 'Quest is not active or does not exist';
  end if;

  select * into strict v_progress
  from public.user_progress
  where user_id = p_user_id;

  v_criteria_type := v_definition.criteria ->> 'type';
  v_minimum := coalesce((v_definition.criteria ->> 'minimum')::bigint, 0);

  if (v_criteria_type = 'requests_count' and v_progress.requests_count < v_minimum)
    or (v_criteria_type = 'material_count' and v_progress.material_count < v_minimum)
    or (v_criteria_type = 'streak_days' and v_progress.streak_days < v_minimum)
    or (v_criteria_type = 'total_xp' and v_progress.total_xp < v_minimum)
    or (
      v_criteria_type = 'modules_used'
      and exists (
        select 1
        from jsonb_array_elements_text(v_definition.criteria -> 'required') required(module)
        where not (required.module = any(v_progress.modules_used))
      )
    ) then
    raise exception 'Quest criteria are not satisfied';
  end if;

  if v_criteria_type not in (
    'requests_count', 'material_count', 'streak_days', 'total_xp', 'modules_used'
  ) then
    raise exception 'Unsupported quest criteria';
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
    return jsonb_build_object(
      'awarded', false,
      'reason', 'already_completed',
      'quest_id', p_quest_id,
      'xp_awarded', 0,
      'total_xp', v_progress.total_xp,
      'level', v_progress.level
    );
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
