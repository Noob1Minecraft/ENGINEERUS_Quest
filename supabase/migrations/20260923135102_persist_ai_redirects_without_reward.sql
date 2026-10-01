create function public.complete_ai_exchange_without_reward(
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
  v_inserted boolean := false;
begin
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
    p_request_id, 0
  )
  on conflict (user_id, session_id, request_id, role)
    where request_id is not null
  do nothing
  returning * into v_assistant_message;

  v_inserted := v_assistant_message.id is not null;

  if v_inserted then
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
  end if;

  select * into strict v_progress
  from public.user_progress
  where user_id = p_user_id;

  return jsonb_build_object(
    'created', v_inserted,
    'awarded', false,
    'user_message', to_jsonb(v_user_message),
    'assistant_message', to_jsonb(v_assistant_message),
    'progress', to_jsonb(v_progress)
  );
end;
$$;

revoke all on function public.complete_ai_exchange_without_reward(uuid, uuid, text, text, text)
from public, anon, authenticated;

grant execute on function public.complete_ai_exchange_without_reward(uuid, uuid, text, text, text)
to service_role;
