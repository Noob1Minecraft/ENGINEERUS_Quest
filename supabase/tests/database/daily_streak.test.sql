begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(29);

create or replace function public._daily_streak_sql_throws(statement text)
returns boolean
language plpgsql
as $$
begin
  execute statement;
  return false;
exception when others then
  return true;
end;
$$;

select has_column('public', 'user_progress', 'longest_streak', 'longest streak column exists');
select col_not_null('public', 'user_progress', 'longest_streak', 'longest streak is required');
select col_default_is('public', 'user_progress', 'longest_streak', '0', 'longest streak defaults to zero');
select has_function('public', 'record_daily_activity', array[]::text[], 'daily activity function exists');
select ok(
  not has_function_privilege('public', 'public.record_daily_activity()', 'execute'),
  'PUBLIC cannot execute daily activity'
);
select ok(
  not has_function_privilege('anon', 'public.record_daily_activity()', 'execute'),
  'anon cannot execute daily activity'
);
select ok(
  has_function_privilege('authenticated', 'public.record_daily_activity()', 'execute'),
  'authenticated users can execute daily activity'
);
select ok(
  not has_function_privilege('service_role', 'public.record_daily_activity()', 'execute'),
  'service_role is not an application daily-activity caller'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '60000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'streak-a@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"StreakAlpha"}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '60000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'streak-b@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"StreakBeta"}'::jsonb,
    now(), now()
  );

set local request.jwt.claim.sub = '60000000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local role authenticated;

select is(
  (select current_streak from public.record_daily_activity()),
  1,
  'first authenticated activity starts at one'
);
select is(
  (select longest_streak from public.record_daily_activity()),
  1,
  'first activity establishes the longest streak'
);
select is(
  (select current_streak from public.record_daily_activity()),
  1,
  'repeated same-day activity is idempotent'
);

reset role;
update public.user_progress
set streak_days = 1,
    longest_streak = 1,
    last_activity_date = (statement_timestamp() at time zone 'Asia/Almaty')::date - 1,
    total_xp = 250,
    level = 3,
    requests_count = 7
where user_id = '60000000-0000-4000-8000-000000000001';
set local role authenticated;

select is(
  (select current_streak from public.record_daily_activity()),
  2,
  'next consecutive calendar day increments the streak'
);
select is(
  (select longest_streak from public.record_daily_activity()),
  2,
  'longest streak increases with the current record'
);
select is(
  (select current_streak from public.record_daily_activity()),
  2,
  'same-day retry after an increment remains unchanged'
);

reset role;
update public.user_progress
set streak_days = 2,
    longest_streak = 2,
    last_activity_date = (statement_timestamp() at time zone 'Asia/Almaty')::date - 1
where user_id = '60000000-0000-4000-8000-000000000001';
set local role authenticated;

select is(
  (select current_streak from public.record_daily_activity()),
  3,
  'third consecutive day increments to three'
);

reset role;
update public.user_progress
set streak_days = 3,
    longest_streak = 3,
    last_activity_date = (statement_timestamp() at time zone 'Asia/Almaty')::date - 2
where user_id = '60000000-0000-4000-8000-000000000001';
set local role authenticated;

select is(
  (select current_streak from public.record_daily_activity()),
  1,
  'a missed calendar day resets the current streak to one'
);
select is(
  (select longest_streak from public.record_daily_activity()),
  3,
  'resetting current streak preserves the longest streak'
);

reset role;
update public.user_progress
set streak_days = 3,
    longest_streak = 3,
    last_activity_date = (statement_timestamp() at time zone 'Asia/Almaty')::date - 1
where user_id = '60000000-0000-4000-8000-000000000001';
set local role authenticated;

select is(
  (select current_streak from public.record_daily_activity()),
  4,
  'a new record increments the current streak'
);
select is(
  (select longest_streak from public.record_daily_activity()),
  4,
  'a new record updates the longest streak'
);

reset role;
select is(
  (select total_xp from public.user_progress where user_id = '60000000-0000-4000-8000-000000000001'),
  250::bigint,
  'daily activity leaves XP unchanged'
);
select is(
  (select level from public.user_progress where user_id = '60000000-0000-4000-8000-000000000001'),
  3,
  'daily activity leaves level unchanged'
);
select is(
  (select requests_count from public.user_progress where user_id = '60000000-0000-4000-8000-000000000001'),
  7::bigint,
  'daily activity leaves progress counters unchanged'
);
select is(
  (select last_activity_date from public.user_progress where user_id = '60000000-0000-4000-8000-000000000001'),
  (statement_timestamp() at time zone 'Asia/Almaty')::date,
  'daily activity uses the Asia/Almaty server calendar date'
);

update public.user_progress
set last_activity_date = (statement_timestamp() at time zone 'Asia/Almaty')::date - 5
where user_id = '60000000-0000-4000-8000-000000000001';
set local role service_role;
do $$
begin
  perform public.record_user_progress(
    '60000000-0000-4000-8000-000000000001', 1, 0, 0, 'tutor'
  );
end;
$$;
reset role;
select is(
  (select requests_count from public.user_progress where user_id = '60000000-0000-4000-8000-000000000001'),
  8::bigint,
  'existing progress counters still update'
);
select is(
  (select last_activity_date from public.user_progress where user_id = '60000000-0000-4000-8000-000000000001'),
  (statement_timestamp() at time zone 'Asia/Almaty')::date - 5,
  'module progress cannot overwrite the daily activity date'
);

set local request.jwt.claim.sub = '60000000-0000-4000-8000-000000000002';
update public.user_progress
set streak_days = 0,
    longest_streak = 0,
    last_activity_date = (statement_timestamp() at time zone 'Asia/Almaty')::date
where user_id = '60000000-0000-4000-8000-000000000002';
set local role authenticated;
select is(
  (select current_streak from public.record_daily_activity()),
  1,
  'legacy same-day activity at zero normalizes to a one-day streak'
);
select is(
  (select longest_streak from public.record_daily_activity()),
  1,
  'legacy same-day normalization establishes the longest streak'
);

reset role;
select is(
  (select streak_days from public.user_progress where user_id = '60000000-0000-4000-8000-000000000001'),
  4,
  'activity by another user does not change the first user'
);

set local request.jwt.claim.sub = '';
set local request.jwt.claim.role = 'anon';
set local role anon;
select ok(
  public._daily_streak_sql_throws('select * from public.record_daily_activity()'),
  'unauthenticated callers cannot record daily activity'
);

reset role;
select * from finish();
rollback;
