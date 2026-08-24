-- Phase E: private, project-relationship-gated user-to-user messaging.
-- This is intentionally separate from the AI tutor chat schema.

create table public.direct_conversations (
  id uuid primary key default gen_random_uuid(),
  user_low_id uuid not null references public.profiles (id) on delete cascade,
  user_high_id uuid not null references public.profiles (id) on delete cascade,
  created_from_project_id uuid references public.projects (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint direct_conversations_ordered_pair check (user_low_id < user_high_id),
  constraint direct_conversations_unique_pair unique (user_low_id, user_high_id)
);

create index direct_conversations_low_updated_idx
on public.direct_conversations (user_low_id, updated_at desc, id desc);
create index direct_conversations_high_updated_idx
on public.direct_conversations (user_high_id, updated_at desc, id desc);
create index direct_conversations_project_idx
on public.direct_conversations (created_from_project_id, id)
where created_from_project_id is not null;

create table public.direct_conversation_members (
  conversation_id uuid not null references public.direct_conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  notifications_muted boolean not null default false,
  primary key (conversation_id, user_id)
);

create index direct_conversation_members_user_idx
on public.direct_conversation_members (user_id, conversation_id);

create table public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.direct_conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  client_message_id uuid not null,
  content text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  constraint direct_messages_content_length
    check (char_length(btrim(content)) between 1 and 4000),
  constraint direct_messages_sender_client_unique unique (sender_id, client_message_id)
);

create index direct_messages_conversation_cursor_idx
on public.direct_messages (conversation_id, created_at desc, id desc);
create index direct_messages_sender_idx
on public.direct_messages (sender_id, id);

create table public.user_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_no_self check (blocker_id <> blocked_id)
);

create index user_blocks_blocked_idx on public.user_blocks (blocked_id, blocker_id);

alter table public.direct_conversations enable row level security;
alter table public.direct_conversation_members enable row level security;
alter table public.direct_messages enable row level security;
alter table public.user_blocks enable row level security;

revoke all on table public.direct_conversations from anon, authenticated, service_role;
revoke all on table public.direct_conversation_members from anon, authenticated, service_role;
revoke all on table public.direct_messages from anon, authenticated, service_role;
revoke all on table public.user_blocks from anon, authenticated, service_role;

grant select (id, user_low_id, user_high_id, created_from_project_id, created_at, updated_at)
on public.direct_conversations to authenticated;
grant select (conversation_id, user_id, joined_at, last_read_at, notifications_muted)
on public.direct_conversation_members to authenticated;
grant select (id, conversation_id, sender_id, client_message_id, content, created_at, edited_at)
on public.direct_messages to authenticated;
grant select (blocker_id, blocked_id, created_at) on public.user_blocks to authenticated;

create policy direct_conversations_participant_select
on public.direct_conversations for select to authenticated
using ((select auth.uid()) in (user_low_id, user_high_id));

create policy direct_conversation_members_participant_select
on public.direct_conversation_members for select to authenticated
using (exists (
  select 1 from public.direct_conversations c
  where c.id = conversation_id
    and (select auth.uid()) in (c.user_low_id, c.user_high_id)
));

create policy direct_messages_participant_select
on public.direct_messages for select to authenticated
using (exists (
  select 1 from public.direct_conversations c
  where c.id = conversation_id
    and (select auth.uid()) in (c.user_low_id, c.user_high_id)
));

create policy user_blocks_owner_select
on public.user_blocks for select to authenticated
using ((select auth.uid()) = blocker_id);

create or replace function public.direct_chat_shared_project(
  p_actor_id uuid,
  p_target_id uuid,
  p_project_id uuid default null
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  -- Phase C acceptance atomically creates project_members, so membership (or
  -- project ownership) is the single authoritative relationship rule here.
  -- Rechecking request rows would duplicate that state and create drift.
  select p.id
  from public.projects p
  where (p_project_id is null or p.id = p_project_id)
    and (
      p.owner_id = p_actor_id
      or exists (select 1 from public.project_members pm where pm.project_id = p.id and pm.user_id = p_actor_id)
    )
    and (
      p.owner_id = p_target_id
      or exists (select 1 from public.project_members pm where pm.project_id = p.id and pm.user_id = p_target_id)
    )
  order by p.id
  limit 1
$$;

create or replace function public.get_or_create_direct_conversation(
  p_target_profile_id uuid,
  p_project_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_low uuid;
  v_high uuid;
  v_project uuid;
  v_conversation uuid;
  v_profile_count integer;
begin
  if v_actor is null then raise exception 'direct_chat_auth_required' using errcode = '42501'; end if;
  if p_target_profile_id is null or p_target_profile_id = v_actor then
    raise exception 'direct_chat_self_forbidden' using errcode = '42501';
  end if;

  v_low := least(v_actor, p_target_profile_id);
  v_high := greatest(v_actor, p_target_profile_id);
  perform 1 from public.profiles where id in (v_low, v_high) order by id for key share;
  get diagnostics v_profile_count = row_count;
  if v_profile_count <> 2 then raise exception 'direct_chat_profile_not_found' using errcode = 'P0002'; end if;

  if exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = v_actor and b.blocked_id = p_target_profile_id)
       or (b.blocker_id = p_target_profile_id and b.blocked_id = v_actor)
  ) then raise exception 'direct_chat_blocked' using errcode = '42501'; end if;

  if exists (
    select 1 from public.profile_private_settings s
    where s.profile_id in (v_actor, p_target_profile_id) and not s.allow_direct_messages
  ) then raise exception 'direct_messages_disabled' using errcode = '42501'; end if;

  v_project := public.direct_chat_shared_project(v_actor, p_target_profile_id, p_project_id);
  if v_project is null then raise exception 'direct_chat_relationship_required' using errcode = '42501'; end if;

  insert into public.direct_conversations (user_low_id, user_high_id, created_from_project_id)
  values (v_low, v_high, v_project)
  on conflict (user_low_id, user_high_id) do nothing
  returning id into v_conversation;

  if v_conversation is null then
    select id into v_conversation from public.direct_conversations
    where user_low_id = v_low and user_high_id = v_high;
  end if;

  insert into public.direct_conversation_members (conversation_id, user_id)
  values (v_conversation, v_low), (v_conversation, v_high)
  on conflict (conversation_id, user_id) do nothing;
  return v_conversation;
end;
$$;

create or replace function public.send_direct_message(
  p_conversation_id uuid,
  p_client_message_id uuid,
  p_content text
)
returns table (
  id uuid, conversation_id uuid, sender_id uuid, client_message_id uuid,
  content text, created_at timestamptz, edited_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_target uuid;
  v_new_id uuid;
begin
  if v_actor is null then raise exception 'direct_chat_auth_required' using errcode = '42501'; end if;
  if p_client_message_id is null or char_length(btrim(coalesce(p_content, ''))) not between 1 and 4000 then
    raise exception 'direct_message_invalid' using errcode = '22023';
  end if;

  select case when c.user_low_id = v_actor then c.user_high_id else c.user_low_id end
  into v_target
  from public.direct_conversations c
  where c.id = p_conversation_id and v_actor in (c.user_low_id, c.user_high_id)
  for update;
  if v_target is null then raise exception 'direct_conversation_not_found' using errcode = 'P0002'; end if;
  if not exists (
    select 1 from public.direct_conversation_members cm
    where cm.conversation_id = p_conversation_id and cm.user_id = v_actor
  ) then raise exception 'direct_chat_membership_required' using errcode = '42501'; end if;

  if public.direct_chat_shared_project(v_actor, v_target, null) is null then
    raise exception 'direct_chat_relationship_required' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = v_actor and b.blocked_id = v_target)
       or (b.blocker_id = v_target and b.blocked_id = v_actor)
  ) then raise exception 'direct_chat_blocked' using errcode = '42501'; end if;
  if exists (
    select 1 from public.profile_private_settings s
    where s.profile_id in (v_actor, v_target) and not s.allow_direct_messages
  ) then raise exception 'direct_messages_disabled' using errcode = '42501'; end if;

  insert into public.direct_messages (conversation_id, sender_id, client_message_id, content)
  values (p_conversation_id, v_actor, p_client_message_id, btrim(p_content))
  on conflict on constraint direct_messages_sender_client_unique do nothing
  returning direct_messages.id into v_new_id;

  if v_new_id is not null then
    update public.direct_conversations set updated_at = now() where direct_conversations.id = p_conversation_id;
  else
    select m.id into v_new_id from public.direct_messages m
    where m.sender_id = v_actor and m.client_message_id = p_client_message_id;
    if not exists (select 1 from public.direct_messages m where m.id = v_new_id and m.conversation_id = p_conversation_id) then
      raise exception 'direct_message_idempotency_conflict' using errcode = '23505';
    end if;
  end if;

  return query select m.id, m.conversation_id, m.sender_id, m.client_message_id,
    m.content, m.created_at, m.edited_at from public.direct_messages m where m.id = v_new_id;
end;
$$;

create or replace function public.list_direct_messages(
  p_conversation_id uuid,
  p_limit integer default 50,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  id uuid, conversation_id uuid, sender_id uuid, client_message_id uuid,
  content text, created_at timestamptz, edited_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.conversation_id, m.sender_id, m.client_message_id,
    m.content, m.created_at, m.edited_at
  from public.direct_messages m
  join public.direct_conversations c on c.id = m.conversation_id
  where c.id = p_conversation_id
    and auth.uid() in (c.user_low_id, c.user_high_id)
    and (p_before_created_at is null or (m.created_at, m.id) < (p_before_created_at, p_before_id))
  order by m.created_at desc, m.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
$$;

create or replace function public.list_direct_conversations(
  p_limit integer default 25,
  p_before_updated_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  id uuid, other_user_id uuid, created_from_project_id uuid,
  created_at timestamptz, updated_at timestamptz,
  last_message_id uuid, last_message_content text,
  last_message_sender_id uuid, last_message_created_at timestamptz,
  unread_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id,
    case when c.user_low_id = auth.uid() then c.user_high_id else c.user_low_id end,
    c.created_from_project_id, c.created_at, c.updated_at,
    last_message.id, last_message.content, last_message.sender_id, last_message.created_at,
    (select count(*) from public.direct_messages unread
      where unread.conversation_id = c.id
        and unread.sender_id <> auth.uid()
        and unread.created_at > member.last_read_at)
  from public.direct_conversations c
  join public.direct_conversation_members member
    on member.conversation_id = c.id and member.user_id = auth.uid()
  left join lateral (
    select m.id, m.content, m.sender_id, m.created_at
    from public.direct_messages m where m.conversation_id = c.id
    order by m.created_at desc, m.id desc limit 1
  ) last_message on true
  where auth.uid() in (c.user_low_id, c.user_high_id)
    and (p_before_updated_at is null or (c.updated_at, c.id) < (p_before_updated_at, p_before_id))
  order by c.updated_at desc, c.id desc
  limit least(greatest(coalesce(p_limit, 25), 1), 25)
$$;

create or replace function public.mark_direct_conversation_read(p_conversation_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare v_read_at timestamptz := now();
begin
  if auth.uid() is null then raise exception 'direct_chat_auth_required' using errcode = '42501'; end if;
  update public.direct_conversation_members
  set last_read_at = v_read_at
  where conversation_id = p_conversation_id and user_id = auth.uid();
  if not found then raise exception 'direct_conversation_not_found' using errcode = 'P0002'; end if;
  return v_read_at;
end;
$$;

create or replace function public.block_direct_chat_user(p_blocked_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'direct_chat_auth_required' using errcode = '42501'; end if;
  if p_blocked_profile_id is null or p_blocked_profile_id = auth.uid() then
    raise exception 'direct_chat_self_block_forbidden' using errcode = '42501';
  end if;
  insert into public.user_blocks (blocker_id, blocked_id)
  values (auth.uid(), p_blocked_profile_id) on conflict do nothing;
end;
$$;

create or replace function public.unblock_direct_chat_user(p_blocked_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'direct_chat_auth_required' using errcode = '42501'; end if;
  delete from public.user_blocks where blocker_id = auth.uid() and blocked_id = p_blocked_profile_id;
end;
$$;

revoke all on function public.direct_chat_shared_project(uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.get_or_create_direct_conversation(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.send_direct_message(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.list_direct_messages(uuid, integer, timestamptz, uuid) from public, anon, authenticated, service_role;
revoke all on function public.list_direct_conversations(integer, timestamptz, uuid) from public, anon, authenticated, service_role;
revoke all on function public.mark_direct_conversation_read(uuid) from public, anon, authenticated, service_role;
revoke all on function public.block_direct_chat_user(uuid) from public, anon, authenticated, service_role;
revoke all on function public.unblock_direct_chat_user(uuid) from public, anon, authenticated, service_role;

grant execute on function public.get_or_create_direct_conversation(uuid, uuid) to authenticated;
grant execute on function public.send_direct_message(uuid, uuid, text) to authenticated;
grant execute on function public.list_direct_messages(uuid, integer, timestamptz, uuid) to authenticated;
grant execute on function public.list_direct_conversations(integer, timestamptz, uuid) to authenticated;
grant execute on function public.mark_direct_conversation_read(uuid) to authenticated;
grant execute on function public.block_direct_chat_user(uuid) to authenticated;
grant execute on function public.unblock_direct_chat_user(uuid) to authenticated;
