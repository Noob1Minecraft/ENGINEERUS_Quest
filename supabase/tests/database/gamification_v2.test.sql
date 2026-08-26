begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(54);

select has_table('public', 'achievement_definitions', 'achievement definitions exist');
select has_table('public', 'user_achievements', 'user achievements exist');
select has_table('public', 'user_skill_progress', 'skill progress ledger exists');
select has_table('public', 'quest_chain_definitions', 'quest chain definitions exist');
select has_table('public', 'user_quest_chain_progress', 'quest chain progress exists');
select has_function('public', 'refresh_gamification', array['uuid', 'timestamp with time zone'], 'refresh RPC exists');
select ok(not has_function_privilege('public', 'public.refresh_gamification(uuid,timestamp with time zone)', 'execute'), 'PUBLIC cannot refresh gamification');
select ok(not has_function_privilege('anon', 'public.refresh_gamification(uuid,timestamp with time zone)', 'execute'), 'anon cannot refresh gamification');
select ok(not has_function_privilege('authenticated', 'public.refresh_gamification(uuid,timestamp with time zone)', 'execute'), 'authenticated cannot refresh gamification');
select ok(has_function_privilege('service_role', 'public.refresh_gamification(uuid,timestamp with time zone)', 'execute'), 'service role can refresh verified-user state');

select ok((select relrowsecurity from pg_class where oid = 'public.user_achievements'::regclass), 'achievement RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.user_skill_progress'::regclass), 'skill RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.user_quest_chain_progress'::regclass), 'chain RLS enabled');
select ok(not has_table_privilege('service_role', 'public.user_achievements', 'SELECT,INSERT,UPDATE,DELETE'), 'service role has no direct achievement table surface');
select ok(not has_table_privilege('service_role', 'public.user_skill_progress', 'SELECT,INSERT,UPDATE,DELETE'), 'service role has no direct skill table surface');
select ok(not has_table_privilege('anon', 'public.user_quest_chain_progress', 'SELECT,INSERT,UPDATE,DELETE'), 'anon has no chain table surface');
select ok(not has_table_privilege('authenticated', 'public.user_quest_chain_progress', 'SELECT,INSERT,UPDATE,DELETE'), 'authenticated has no chain table surface');
select ok(not has_function_privilege('authenticated', 'public.award_xp(uuid,integer,text,text,text,text,jsonb)', 'execute'), 'authenticated cannot grant XP');

select is(public.level_for_xp(0), 1, 'zero XP is level one');
select is(public.level_for_xp(99), 1, '99 XP remains level one');
select is(public.level_for_xp(100), 2, '100 XP is level two');
select is(public.level_for_xp(900), 10, '900 XP is level ten');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    'aa000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'g2-a@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"g2_alpha"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-8000-000000000000',
    'aa000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'g2-b@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"g2_beta"}'::jsonb, now(), now()
  );

update public.user_progress
set streak_days = 3, longest_streak = 4, last_activity_date = '2026-08-26'
where user_id = 'aa000000-0000-4000-8000-000000000001';

set local role service_role;
select public.refresh_gamification('aa000000-0000-4000-8000-000000000001', '2026-08-26 12:00:00+05');
reset role;

select is((select count(*)::integer from public.user_quests where user_id = 'aa000000-0000-4000-8000-000000000001' and quest_id like 'daily_%' and cycle_key = '2026-08-26'), 3, 'three daily quests are deterministically assigned');
select is((select count(*)::integer from public.user_quests where user_id = 'aa000000-0000-4000-8000-000000000001' and quest_id like 'weekly_%' and cycle_key = '2026-08-24'), 3, 'three weekly quests are deterministically assigned');
select is((select status from public.user_quests where user_id = 'aa000000-0000-4000-8000-000000000001' and quest_id = 'daily_active' and cycle_key = '2026-08-26'), 'completed', 'daily activity completes from server date state');
select is((select count(*)::integer from public.xp_ledger where user_id = 'aa000000-0000-4000-8000-000000000001' and idempotency_key = 'daily_quest:2026-08-26:daily_active'), 1, 'daily reward has one stable ledger key');

create temporary table g2_first_total as
select total_xp from public.user_progress where user_id = 'aa000000-0000-4000-8000-000000000001';
set local role service_role;
select public.refresh_gamification('aa000000-0000-4000-8000-000000000001', '2026-08-26 12:00:00+05');
reset role;
select is((select total_xp from public.user_progress where user_id = 'aa000000-0000-4000-8000-000000000001'), (select total_xp from g2_first_total), 'same-cycle refresh cannot duplicate XP');

insert into public.chat_sessions (id, user_id, title, module, created_at, updated_at)
values ('ab000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000001', 'G2', 'tutor', '2026-08-24 08:00:00+05', '2026-08-26 08:00:00+05');
insert into public.chat_messages (id, session_id, user_id, role, content, module, request_id, created_at)
values
  ('ac000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000001', 'assistant', 'safe fixture', 'tutor', 'g2-request-1', '2026-08-24 08:00:00+05'),
  ('ac000000-0000-4000-8000-000000000002', 'ab000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000001', 'assistant', 'safe fixture', 'tutor', 'g2-request-2', '2026-08-25 08:00:00+05'),
  ('ac000000-0000-4000-8000-000000000003', 'ab000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000001', 'assistant', 'safe fixture', 'tutor', 'g2-request-3', '2026-08-26 08:00:00+05');
update public.user_progress set requests_count = 3 where user_id = 'aa000000-0000-4000-8000-000000000001';

set local role service_role;
select public.refresh_gamification('aa000000-0000-4000-8000-000000000001', '2026-08-26 12:00:00+05');
reset role;
select is((select status from public.user_quests where user_id = 'aa000000-0000-4000-8000-000000000001' and quest_id = 'daily_ai_question' and cycle_key = '2026-08-26'), 'completed', 'one accepted AI answer completes the daily AI quest');
select is((select count(*)::integer from public.user_achievements where user_id = 'aa000000-0000-4000-8000-000000000001' and achievement_slug = 'first-question'), 1, 'first question achievement unlocks once');
select is((select count(*)::integer from public.xp_ledger where user_id = 'aa000000-0000-4000-8000-000000000001' and idempotency_key = 'achievement:first-question'), 1, 'achievement XP is awarded once');

insert into public.user_quests (user_id, quest_id, cycle_key, status, completed_at)
select 'aa000000-0000-4000-8000-000000000001', id, 'once', 'completed', '2026-08-26 09:00:00+05'
from public.quest_definitions where quest_kind = 'legacy'
on conflict (user_id, quest_id, cycle_key) do update set completed_at = excluded.completed_at;

set local role service_role;
select public.refresh_gamification('aa000000-0000-4000-8000-000000000001', '2026-08-26 12:00:00+05');
reset role;
select is((select status from public.user_quests where user_id = 'aa000000-0000-4000-8000-000000000001' and quest_id = 'daily_learning_quest' and cycle_key = '2026-08-26'), 'completed', 'completed core quest satisfies daily learning');
select is((select count(*)::integer from public.user_achievements where user_id = 'aa000000-0000-4000-8000-000000000001' and achievement_slug = 'first-quest'), 1, 'first quest achievement unlocks once');
select is((select sum(xp_amount)::integer from public.user_skill_progress where user_id = 'aa000000-0000-4000-8000-000000000001' and skill_id = '20000000-0000-4000-8000-000000000005'), 15, 'only the explicitly mapped material quest grants skill XP');
select is((select status from public.user_quests where user_id = 'aa000000-0000-4000-8000-000000000001' and quest_id = 'weekly_ai_three_days' and cycle_key = '2026-08-24'), 'completed', 'three distinct AI days complete the weekly AI quest');
select is((select status from public.user_quests where user_id = 'aa000000-0000-4000-8000-000000000001' and quest_id = 'weekly_learning_five' and cycle_key = '2026-08-24'), 'completed', 'five core quests complete the weekly learning quest');

insert into public.product_events (user_id, event_name, metadata, dedupe_key, created_at)
values
  ('aa000000-0000-4000-8000-000000000001', 'project_created', '{}', 'g2-project', '2026-08-26 10:00:00+05'),
  ('aa000000-0000-4000-8000-000000000001', 'engimatch_viewed', '{}', 'g2-engimatch', '2026-08-26 10:01:00+05');
update public.profiles set display_name = 'G2 Alpha', bio = 'Safe fixture', primary_discipline_id = '10000000-0000-4000-8000-000000000001'
where id = 'aa000000-0000-4000-8000-000000000001';

set local role service_role;
select public.refresh_gamification('aa000000-0000-4000-8000-000000000001', '2026-08-26 12:00:00+05');
reset role;
select is((select status from public.user_quests where user_id = 'aa000000-0000-4000-8000-000000000001' and quest_id = 'weekly_teamwork_explorer' and cycle_key = '2026-08-24'), 'completed', 'two distinct teamwork actions complete the weekly quest');
select is((select count(*)::integer from public.user_achievements where user_id = 'aa000000-0000-4000-8000-000000000001' and achievement_slug = 'first-engimatch'), 1, 'EngiMatch achievement uses a real event');
select is((select completed_steps from public.user_quest_chain_progress where user_id = 'aa000000-0000-4000-8000-000000000001' and chain_slug = 'engineering-starter'), 4, 'quest chain advances only through ordered satisfied steps');

insert into public.projects (id, owner_id, title, description, status, visibility, created_at, updated_at)
values ('ad000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000001', 'Private G2 fixture', '', 'open', 'private', '2026-08-26 11:00:00+05', '2026-08-26 11:00:00+05');
set local role service_role;
select public.refresh_gamification('aa000000-0000-4000-8000-000000000001', '2026-08-26 12:00:00+05');
reset role;
select is((select completed_steps from public.user_quest_chain_progress where user_id = 'aa000000-0000-4000-8000-000000000001' and chain_slug = 'engineering-starter'), 5, 'final real project fact completes the chain');
select is((select count(*)::integer from public.xp_ledger where user_id = 'aa000000-0000-4000-8000-000000000001' and idempotency_key = 'quest_chain:engineering-starter'), 1, 'quest chain reward is awarded once');

set local role service_role;
select public.refresh_gamification('aa000000-0000-4000-8000-000000000001', '2026-08-26 12:00:00+05');
reset role;
select is((select count(*)::integer from public.xp_ledger where user_id = 'aa000000-0000-4000-8000-000000000001' and idempotency_key = 'quest_chain:engineering-starter'), 1, 'quest chain retry remains idempotent');
select is((select count(*)::integer from public.user_skill_progress where user_id = 'aa000000-0000-4000-8000-000000000002'), 0, 'unmapped or absent actions cannot create skill progress');
select is((select total_xp from public.user_progress where user_id = 'aa000000-0000-4000-8000-000000000002'), 0::bigint, 'another user remains isolated');
select is((select streak_days from public.user_progress where user_id = 'aa000000-0000-4000-8000-000000000001'), 3, 'gamification refresh does not rewrite current streak');
select is((select longest_streak from public.user_progress where user_id = 'aa000000-0000-4000-8000-000000000001'), 4, 'gamification refresh preserves longest streak');
select is((select count(*)::integer from public.product_events where user_id = 'aa000000-0000-4000-8000-000000000001' and event_name = 'daily_quest_completed' and dedupe_key = '2026-08-26:daily_active'), 1, 'daily completion analytics is deduplicated');
select is((select count(*)::integer from public.product_events where user_id = 'aa000000-0000-4000-8000-000000000001' and event_name = 'weekly_quest_completed'), 3, 'weekly completion analytics records one event per completed quest');
select is((select count(*)::integer from public.product_events where user_id = 'aa000000-0000-4000-8000-000000000001' and event_name = 'quest_chain_completed'), 1, 'chain completion analytics is deduplicated');
select ok(not exists (
  select 1 from public.product_events where metadata ?| array['message','prompt','content','email','token','password','authorization','notes','private_profile']
), 'gamification analytics stores no sensitive-content keys');

set local role service_role;
select public.refresh_gamification('aa000000-0000-4000-8000-000000000001', '2026-08-27 12:00:00+05');
reset role;
select is((select count(*)::integer from public.user_quests where user_id = 'aa000000-0000-4000-8000-000000000001' and quest_id like 'daily_%' and cycle_key = '2026-08-27'), 3, 'next Asia/Almaty day receives a new bounded assignment');
select is((select status from public.user_quests where user_id = 'aa000000-0000-4000-8000-000000000001' and quest_id = 'daily_active' and cycle_key = '2026-08-27'), 'in_progress', 'prior-day activity does not complete the next daily quest');
select is((select count(*)::integer from public.xp_ledger where user_id = 'aa000000-0000-4000-8000-000000000001' and idempotency_key like 'daily_quest:2026-08-27:%'), 0, 'daily reset creates no retroactive payout');

set local role service_role;
select public.refresh_gamification('aa000000-0000-4000-8000-000000000001', '2026-08-31 12:00:00+05');
reset role;
select is((select count(*)::integer from public.user_quests where user_id = 'aa000000-0000-4000-8000-000000000001' and quest_id like 'weekly_%' and cycle_key = '2026-08-31'), 3, 'next Monday receives a new bounded weekly assignment');
select is((select count(*)::integer from public.user_quests where user_id = 'aa000000-0000-4000-8000-000000000001' and quest_id like 'weekly_%' and cycle_key = '2026-08-31' and status = 'completed'), 0, 'prior-week facts do not complete the new week');

select * from finish();
rollback;
