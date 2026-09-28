begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(8);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    'f6000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'signup-normal@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"BridgeBuilder","display_name":"Bridge Builder"}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'f6000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'signup-same-case@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"BridgeBuilder","display_name":"Second Builder"}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'f6000000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 'signup-other-case@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"bridgebuilder","display_name":"Third Builder"}'::jsonb,
    now(), now()
  );

select is(
  (select username from public.profiles where id = 'f6000000-0000-4000-8000-000000000001'),
  'BridgeBuilder',
  'an available username is preserved'
);
select is(
  (select username from public.profiles where id = 'f6000000-0000-4000-8000-000000000002'),
  'engineer_f6000000000040008000000000000002',
  'a same-case collision receives a deterministic private fallback'
);
select is(
  (select username from public.profiles where id = 'f6000000-0000-4000-8000-000000000003'),
  'engineer_f6000000000040008000000000000003',
  'a different-case collision receives a deterministic private fallback'
);
select is(
  (select count(*)::integer from public.profiles where id::text like 'f6000000-0000-4000-8000-00000000000%'),
  3,
  'all colliding signups still create profiles'
);
select is(
  (select count(distinct lower(username))::integer from public.profiles where id::text like 'f6000000-0000-4000-8000-00000000000%'),
  3,
  'case-insensitive username uniqueness remains intact'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'profiles RLS remains enabled'
);
select ok(
  not has_table_privilege('anon', 'public.profiles', 'SELECT'),
  'anonymous users still cannot read profiles'
);
select ok(
  not has_table_privilege('authenticated', 'public.profiles', 'INSERT'),
  'authenticated users still cannot bypass trigger-based profile creation'
);

select * from finish();
rollback;
