begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(24);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '51000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'atomic-a@example.test', '', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"username":"AtomicA"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '51000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'atomic-b@example.test', '', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"username":"AtomicB"}'::jsonb, now(), now());

select has_function(
  'public', 'replace_my_profile_relations', array['jsonb', 'jsonb', 'jsonb', 'jsonb'],
  'atomic profile-relation RPC exists'
);
select is(
  (select prosecdef from pg_proc where oid = 'public.replace_my_profile_relations(jsonb,jsonb,jsonb,jsonb)'::regprocedure),
  true,
  'atomic profile-relation RPC is SECURITY DEFINER'
);
select is(
  (select proconfig from pg_proc where oid = 'public.replace_my_profile_relations(jsonb,jsonb,jsonb,jsonb)'::regprocedure),
  array['search_path=""'],
  'atomic RPC fixes an empty search_path'
);
select ok(not has_function_privilege('public', 'public.replace_my_profile_relations(jsonb,jsonb,jsonb,jsonb)', 'execute'), 'PUBLIC cannot execute atomic RPC');
select ok(not has_function_privilege('anon', 'public.replace_my_profile_relations(jsonb,jsonb,jsonb,jsonb)', 'execute'), 'anon cannot execute atomic RPC');
select ok(has_function_privilege('authenticated', 'public.replace_my_profile_relations(jsonb,jsonb,jsonb,jsonb)', 'execute'), 'authenticated can execute atomic RPC');
select ok(not has_function_privilege('service_role', 'public.replace_my_profile_relations(jsonb,jsonb,jsonb,jsonb)', 'execute'), 'service_role receives no atomic RPC execute grant');

select ok(not has_table_privilege('authenticated', 'public.profile_skills', 'insert'), 'authenticated direct skill inserts are revoked');
select ok(not has_table_privilege('authenticated', 'public.profile_tools', 'delete'), 'authenticated direct tool deletes are revoked');
select ok(not has_table_privilege('authenticated', 'public.profile_interests', 'insert'), 'authenticated direct interest inserts are revoked');
select ok(not has_table_privilege('authenticated', 'public.profile_languages', 'update'), 'authenticated direct language updates are revoked');

set local request.jwt.claim.sub = '51000000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local role authenticated;

select lives_ok(
  $$select public.replace_my_profile_relations(
    '[{"id":"20000000-0000-4000-8000-000000000001","proficiency":4}]'::jsonb,
    '[{"id":"30000000-0000-4000-8000-000000000001","proficiency":3}]'::jsonb,
    '["40000000-0000-4000-8000-000000000001"]'::jsonb,
    '[{"language_code":"ru","proficiency":5}]'::jsonb
  )$$,
  'owner atomically replaces every targeted relation set'
);
select is((select count(*)::integer from public.profile_skills where profile_id = auth.uid()), 1, 'skill replacement persisted');
select is((select count(*)::integer from public.profile_tools where profile_id = auth.uid()), 1, 'tool replacement persisted');
select is((select count(*)::integer from public.profile_interests where profile_id = auth.uid()), 1, 'interest replacement persisted');
select is((select count(*)::integer from public.profile_languages where profile_id = auth.uid()), 1, 'language replacement persisted');

select throws_ok(
  $$select public.replace_my_profile_relations(
    '[]'::jsonb,
    '[{"id":"39999999-9999-4999-8999-999999999999","proficiency":3}]'::jsonb,
    null,
    null
  )$$,
  '23503',
  'A selected profile tool is invalid.',
  'a later invalid relation rejects the whole replacement transaction'
);
select is((select count(*)::integer from public.profile_skills where profile_id = auth.uid()), 1, 'failed multi-set replacement preserves the old skill set');

set local request.jwt.claim.sub = '51000000-0000-4000-8000-000000000002';
select lives_ok(
  $$select public.replace_my_profile_relations(
    '[{"id":"20000000-0000-4000-8000-000000000002","proficiency":2}]'::jsonb,
    null, null, null
  )$$,
  'the RPC derives a second owner from auth.uid()'
);
select is((select count(*)::integer from public.profile_skills where profile_id = auth.uid()), 1, 'second user receives only their own relation');
select is(
  (select count(*)::integer from public.profile_skills where profile_id = '51000000-0000-4000-8000-000000000001'),
  0,
  'RLS prevents the second user from observing the first relation set'
);

set local request.jwt.claim.sub = '51000000-0000-4000-8000-000000000001';

select throws_ok(
  $$select public.replace_my_profile_relations(
    '[{"id":"20000000-0000-4000-8000-000000000001"},{"id":"20000000-0000-4000-8000-000000000001"}]'::jsonb,
    null, null, null
  )$$,
  '22023',
  'Duplicate profile skill IDs are not allowed.',
  'duplicate input is rejected deterministically'
);

select lives_ok(
  $$select public.replace_my_profile_relations('[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)$$,
  'empty arrays clear all targeted relation sets atomically'
);
select is(
  (select count(*)::integer from (
    select profile_id from public.profile_skills where profile_id = auth.uid()
    union all select profile_id from public.profile_tools where profile_id = auth.uid()
    union all select profile_id from public.profile_interests where profile_id = auth.uid()
    union all select profile_id from public.profile_languages where profile_id = auth.uid()
  ) relations),
  0,
  'empty replacement leaves every targeted relation set empty'
);

select * from finish();
rollback;
