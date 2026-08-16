alter table public.profiles enable row level security;
alter table public.user_progress enable row level security;
alter table public.xp_ledger enable row level security;
alter table public.quest_definitions enable row level security;
alter table public.user_quests enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.user_progress from anon, authenticated;
revoke all on table public.xp_ledger from anon, authenticated;
revoke all on table public.quest_definitions from anon, authenticated;
revoke all on table public.user_quests from anon, authenticated;
revoke all on table public.chat_sessions from anon, authenticated;
revoke all on table public.chat_messages from anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (username, display_name, avatar_url, preferred_lang)
on table public.profiles to authenticated;
grant select on table public.user_progress to authenticated;
grant select on table public.xp_ledger to authenticated;
grant select on table public.quest_definitions to authenticated;
grant select on table public.user_quests to authenticated;
grant select, delete on table public.chat_sessions to authenticated;
grant insert (user_id, title, module) on table public.chat_sessions to authenticated;
grant update (title, module) on table public.chat_sessions to authenticated;
grant select, delete on table public.chat_messages to authenticated;
grant insert (session_id, user_id, role, content, module)
on table public.chat_messages to authenticated;

create policy profiles_select_own
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

create policy profiles_update_own
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy user_progress_select_own
on public.user_progress for select
to authenticated
using ((select auth.uid()) = user_id);

create policy xp_ledger_select_own
on public.xp_ledger for select
to authenticated
using ((select auth.uid()) = user_id);

create policy quest_definitions_select_active
on public.quest_definitions for select
to authenticated
using (is_active = true);

create policy user_quests_select_own
on public.user_quests for select
to authenticated
using ((select auth.uid()) = user_id);

create policy chat_sessions_select_own
on public.chat_sessions for select
to authenticated
using ((select auth.uid()) = user_id);

create policy chat_sessions_insert_own
on public.chat_sessions for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy chat_sessions_update_own
on public.chat_sessions for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy chat_sessions_delete_own
on public.chat_sessions for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy chat_messages_select_own
on public.chat_messages for select
to authenticated
using (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.chat_sessions
    where chat_sessions.id = chat_messages.session_id
      and chat_sessions.user_id = (select auth.uid())
  )
);

create policy chat_messages_insert_own
on public.chat_messages for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and role = 'user'
  and xp_awarded = 0
  and exists (
    select 1 from public.chat_sessions
    where chat_sessions.id = chat_messages.session_id
      and chat_sessions.user_id = (select auth.uid())
  )
);

create policy chat_messages_delete_own
on public.chat_messages for delete
to authenticated
using (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.chat_sessions
    where chat_sessions.id = chat_messages.session_id
      and chat_sessions.user_id = (select auth.uid())
  )
);
