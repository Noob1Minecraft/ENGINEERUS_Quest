create table public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  module text not null default 'tutor'
    check (module in ('tutor', 'material', 'patent', 'engi_legal')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger chat_sessions_set_updated_at
before update on public.chat_sessions
for each row execute function public.set_updated_at();

create index chat_sessions_user_updated_at
on public.chat_sessions (user_id, updated_at desc);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null check (char_length(trim(content)) between 1 and 20000),
  module text not null default 'tutor'
    check (module in ('tutor', 'material', 'patent', 'engi_legal')),
  xp_awarded integer not null default 0 check (xp_awarded >= 0),
  created_at timestamptz not null default now()
);

create index chat_messages_session_created_at
on public.chat_messages (session_id, created_at asc);

create index chat_messages_user_created_at
on public.chat_messages (user_id, created_at desc);

create or replace function public.enforce_chat_message_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.chat_sessions
    where id = new.session_id and user_id = new.user_id
  ) then
    raise exception 'Chat message owner must match the session owner';
  end if;
  return new;
end;
$$;

create trigger chat_messages_enforce_owner
before insert or update on public.chat_messages
for each row execute function public.enforce_chat_message_owner();
