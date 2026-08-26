begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(24);

select has_table('public', 'beta_participants', 'beta participant state exists');
select has_table('public', 'beta_feedback', 'beta feedback exists');
select has_table('public', 'product_events', 'first-party product events exist');

select ok((select relrowsecurity from pg_class where oid = 'public.beta_participants'::regclass), 'participant RLS is enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.beta_feedback'::regclass), 'feedback RLS is enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.product_events'::regclass), 'event RLS is enabled');

select ok(has_table_privilege('service_role', 'public.beta_participants', 'SELECT,INSERT,UPDATE'), 'service role can manage participant state');
select ok(not has_table_privilege('service_role', 'public.beta_participants', 'DELETE'), 'service role cannot delete participant state');
select ok(has_table_privilege('service_role', 'public.beta_feedback', 'SELECT,INSERT'), 'service role can store and later aggregate feedback');
select ok(not has_table_privilege('service_role', 'public.beta_feedback', 'UPDATE,DELETE'), 'feedback is append-only through the service surface');
select ok(has_table_privilege('service_role', 'public.product_events', 'SELECT,INSERT'), 'service role can store and aggregate events');
select ok(not has_table_privilege('service_role', 'public.product_events', 'UPDATE,DELETE'), 'events are append-only through the service surface');

select ok(not has_table_privilege('anon', 'public.beta_participants', 'SELECT,INSERT,UPDATE,DELETE'), 'anon has no participant access');
select ok(not has_table_privilege('anon', 'public.beta_feedback', 'SELECT,INSERT,UPDATE,DELETE'), 'anon has no feedback access');
select ok(not has_table_privilege('anon', 'public.product_events', 'SELECT,INSERT,UPDATE,DELETE'), 'anon has no event access');
select ok(not has_table_privilege('authenticated', 'public.beta_participants', 'SELECT,INSERT,UPDATE,DELETE'), 'authenticated has no direct participant table access');
select ok(not has_table_privilege('authenticated', 'public.beta_feedback', 'SELECT,INSERT,UPDATE,DELETE'), 'authenticated has no direct feedback table access');
select ok(not has_table_privilege('authenticated', 'public.product_events', 'SELECT,INSERT,UPDATE,DELETE'), 'authenticated has no direct event table access');

select ok(not has_function_privilege('public', 'public.handle_new_beta_participant()'::regprocedure, 'EXECUTE'), 'PUBLIC cannot execute beta bootstrap');
select ok(not has_function_privilege('anon', 'public.handle_new_beta_participant()'::regprocedure, 'EXECUTE'), 'anon cannot execute beta bootstrap');
select ok(not has_function_privilege('authenticated', 'public.handle_new_beta_participant()'::regprocedure, 'EXECUTE'), 'authenticated cannot execute beta bootstrap');
select ok(not has_function_privilege('service_role', 'public.handle_new_beta_participant()'::regprocedure, 'EXECUTE'), 'service role cannot execute beta bootstrap directly');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  'ba000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'beta-user@example.test', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"username":"beta_user"}'::jsonb,
  now(), now()
);

select is((select count(*)::integer from public.beta_participants where user_id = 'ba000000-0000-4000-8000-000000000001'), 1, 'new profile receives one beta participant record');
select is((select cohort from public.beta_participants where user_id = 'ba000000-0000-4000-8000-000000000001'), 'controlled-beta-2026', 'participant receives the controlled beta cohort');

select * from finish();
rollback;
