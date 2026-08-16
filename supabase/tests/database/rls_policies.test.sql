begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(44);

create or replace function public._test_sql_throws(statement text)
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

create or replace function public._test_rows_affected(statement text)
returns integer
language plpgsql
as $$
declare
  affected_rows integer;
begin
  execute statement;
  get diagnostics affected_rows = row_count;
  return affected_rows;
end;
$$;

create or replace function public._test_create_auth_user(
  user_id uuid,
  user_email text,
  user_metadata jsonb
)
returns void
language plpgsql
as $$
begin
  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  values (
    '00000000-0000-0000-0000-000000000000',
    user_id,
    'authenticated',
    'authenticated',
    user_email,
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    coalesce(user_metadata, '{}'::jsonb),
    now(),
    now()
  );
end;
$$;

do $fixtures$
begin
  perform public._test_create_auth_user(
    '00000000-0000-4000-8000-000000000001',
    'user-a@example.test',
    '{"username":"  User   Alpha  ","display_name":"  Alpha   Engineer  "}'::jsonb
  );
  perform public._test_create_auth_user(
    '00000000-0000-4000-8000-000000000002',
    'user-b@example.test',
    '{"username":"user_beta","display_name":"Beta Engineer"}'::jsonb
  );
  perform public._test_create_auth_user(
    '00000000-0000-4000-8000-000000000003',
    'missing-metadata@example.test',
    null
  );
  perform public._test_create_auth_user(
    '00000000-0000-4000-8000-000000000004',
    'oversized-metadata@example.test',
    jsonb_build_object('username', repeat('u', 500), 'display_name', repeat('d', 500))
  );
  perform public._test_create_auth_user(
    '00000000-0000-4000-8000-000000000005',
    'malformed-metadata@example.test',
    '{"username":{"unexpected":"object"},"display_name":["unexpected","array"],"avatar_url":42}'::jsonb
  );
end;
$fixtures$;

insert into public.chat_sessions (id, user_id, title, module)
values
  (
    '10000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    'User A session',
    'tutor'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000002',
    'User B session',
    'material'
  );

insert into public.chat_messages (id, session_id, user_id, role, content, module)
values
  (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    'user',
    'User A message',
    'tutor'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000002',
    'user',
    'User B message',
    'material'
  );

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'xp_ledger', 'xp_ledger table exists');
select has_table('public', 'user_progress', 'user_progress table exists');
select has_table('public', 'quest_definitions', 'quest_definitions table exists');
select has_table('public', 'user_quests', 'user_quests table exists');
select has_table('public', 'chat_sessions', 'chat_sessions table exists');
select has_table('public', 'chat_messages', 'chat_messages table exists');

select is(
  (select username from public.profiles where id = '00000000-0000-4000-8000-000000000001'),
  'User Alpha',
  'valid username metadata is normalized'
);
select is(
  (select display_name from public.profiles where id = '00000000-0000-4000-8000-000000000001'),
  'Alpha Engineer',
  'valid display-name metadata is normalized'
);
select is(
  (select username from public.profiles where id = '00000000-0000-4000-8000-000000000003'),
  'engineer_000000000003',
  'missing metadata receives a deterministic username'
);
select is(
  (select display_name from public.profiles where id = '00000000-0000-4000-8000-000000000003'),
  'engineer_000000000003',
  'missing metadata receives a deterministic display name'
);
select is(
  (select char_length(username) from public.profiles where id = '00000000-0000-4000-8000-000000000004'),
  50,
  'oversized username metadata is bounded'
);
select is(
  (select char_length(display_name) from public.profiles where id = '00000000-0000-4000-8000-000000000004'),
  100,
  'oversized display-name metadata is bounded'
);
select is(
  (select username from public.profiles where id = '00000000-0000-4000-8000-000000000005'),
  'engineer_000000000005',
  'malformed username metadata receives a deterministic fallback'
);
select is(
  (select display_name from public.profiles where id = '00000000-0000-4000-8000-000000000005'),
  'engineer_000000000005',
  'malformed display-name metadata receives a deterministic fallback'
);
select is(
  (select avatar_url from public.profiles where id = '00000000-0000-4000-8000-000000000005'),
  null::text,
  'malformed avatar metadata is ignored'
);
select is(
  (select count(*)::integer from public.user_progress),
  5,
  'profile bootstrap creates progress for every auth user'
);

set local role anon;
select ok(
  public._test_sql_throws('select * from public.profiles'),
  'anonymous profile access is denied'
);
select ok(
  public._test_sql_throws('select * from public.quest_definitions'),
  'anonymous quest-definition access is denied'
);
reset role;

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local role authenticated;

select is(
  (select count(*)::integer from public.profiles where id = '00000000-0000-4000-8000-000000000001'),
  1,
  'user A can read their own profile'
);
select is(
  (select count(*)::integer from public.profiles where id = '00000000-0000-4000-8000-000000000002'),
  0,
  'user A cannot read user B profile'
);
select is(
  public._test_rows_affected(
    $$update public.profiles
      set display_name = 'Updated Alpha'
      where id = '00000000-0000-4000-8000-000000000001'$$
  ),
  1,
  'user A can update an allowed field on their own profile'
);
select is(
  (select display_name from public.profiles where id = '00000000-0000-4000-8000-000000000001'),
  'Updated Alpha',
  'the permitted own-profile update is visible'
);
select is(
  public._test_rows_affected(
    $$update public.profiles
      set display_name = 'Forbidden update'
      where id = '00000000-0000-4000-8000-000000000002'$$
  ),
  0,
  'user A cannot update user B profile'
);

select ok(
  public._test_sql_throws(
    $$insert into public.xp_ledger
      (user_id, amount, balance_after, reason, source_type)
      values
      ('00000000-0000-4000-8000-000000000001', 100, 100, 'forbidden', 'test')$$
  ),
  'authenticated users cannot directly insert XP ledger entries'
);
select ok(
  public._test_sql_throws('update public.xp_ledger set amount = 999'),
  'authenticated users cannot directly update XP ledger entries'
);
select ok(
  public._test_sql_throws('delete from public.xp_ledger'),
  'authenticated users cannot directly delete XP ledger entries'
);
select ok(
  public._test_sql_throws(
    $$select * from public.award_xp(
      '00000000-0000-4000-8000-000000000001',
      100,
      'forbidden',
      'test',
      null,
      'forbidden-award',
      '{}'::jsonb
    )$$
  ),
  'authenticated users cannot call the authoritative XP function'
);
select ok(
  public._test_sql_throws(
    $$select public.complete_quest(
      '00000000-0000-4000-8000-000000000001',
      'first_contact',
      'once'
    )$$
  ),
  'authenticated users cannot directly grant quest rewards'
);

select is(
  (select count(*)::integer from public.chat_sessions where user_id = '00000000-0000-4000-8000-000000000001'),
  1,
  'user A can read their own chat session'
);
select is(
  (select count(*)::integer from public.chat_messages where user_id = '00000000-0000-4000-8000-000000000001'),
  1,
  'user A can read their own chat messages'
);
select is(
  (select count(*)::integer from public.chat_sessions where user_id = '00000000-0000-4000-8000-000000000002'),
  0,
  'user A cannot read user B chat session'
);
select is(
  (select count(*)::integer from public.chat_messages where user_id = '00000000-0000-4000-8000-000000000002'),
  0,
  'user A cannot read user B chat messages'
);
select ok(
  public._test_sql_throws(
    $$insert into public.chat_sessions (user_id, title, module)
      values ('00000000-0000-4000-8000-000000000002', 'Forbidden chat', 'tutor')$$
  ),
  'user A cannot create a chat session for user B'
);
select is(
  (select count(*)::integer from public.quest_definitions where is_active = true),
  5,
  'authenticated users can read active quest definitions'
);

reset role;
set local role service_role;

select lives_ok(
  $$select * from public.award_xp(
    '00000000-0000-4000-8000-000000000001',
    25,
    'Idempotency test',
    'test',
    'award-one',
    'idempotent-award-one',
    '{}'::jsonb
  )$$,
  'the first authoritative XP award succeeds'
);
select lives_ok(
  $$select * from public.award_xp(
    '00000000-0000-4000-8000-000000000001',
    25,
    'Idempotency test',
    'test',
    'award-one',
    'idempotent-award-one',
    '{}'::jsonb
  )$$,
  'repeating the same authoritative XP award is safe'
);

reset role;
select is(
  (
    select count(*)::integer
    from public.xp_ledger
    where user_id = '00000000-0000-4000-8000-000000000001'
      and idempotency_key = 'idempotent-award-one'
  ),
  1,
  'an idempotent XP award creates one ledger entry'
);
select is(
  (select total_xp from public.user_progress where user_id = '00000000-0000-4000-8000-000000000001'),
  25::bigint,
  'an idempotent XP award changes the balance only once'
);

set local role service_role;
select is(
  (
    select (public.complete_quest(
      '00000000-0000-4000-8000-000000000001',
      'first_contact',
      'once'
    ) ->> 'awarded')::boolean
  ),
  true,
  'the first quest completion grants its reward'
);
select is(
  (
    select (public.complete_quest(
      '00000000-0000-4000-8000-000000000001',
      'first_contact',
      'once'
    ) ->> 'awarded')::boolean
  ),
  false,
  'duplicate quest completion does not grant another reward'
);

reset role;
select is(
  (
    select count(*)::integer
    from public.user_quests
    where user_id = '00000000-0000-4000-8000-000000000001'
      and quest_id = 'first_contact'
      and cycle_key = 'once'
  ),
  1,
  'duplicate quest completion creates one completion row'
);
select is(
  (
    select count(*)::integer
    from public.xp_ledger
    where user_id = '00000000-0000-4000-8000-000000000001'
      and idempotency_key = 'quest:first_contact:once'
  ),
  1,
  'duplicate quest completion creates one reward ledger entry'
);
select is(
  (select total_xp from public.user_progress where user_id = '00000000-0000-4000-8000-000000000001'),
  45::bigint,
  'duplicate quest completion changes the balance only once'
);

select * from finish();
rollback;
