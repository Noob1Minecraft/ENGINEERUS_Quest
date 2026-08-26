begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(21);

create or replace function public._profile_v2_sql_throws(statement text)
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

create or replace function public._profile_v2_rows_affected(statement text)
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

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '50000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'profile-a@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"ProfileAlpha","preferred_lang":"kk"}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '50000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'profile-b@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"ProfileBeta","preferred_lang":"ru"}'::jsonb,
    now(), now()
  );

select has_table('public', 'profile_private_settings', 'private profile settings table exists');
select has_table('public', 'profile_skills', 'normalized profile skills table exists');
select has_table('public', 'profile_tools', 'normalized profile tools table exists');
select has_table('public', 'profile_interests', 'normalized profile interests table exists');
select has_table('public', 'profile_languages', 'normalized profile languages table exists');
select has_table('public', 'engineering_disciplines', 'discipline taxonomy exists');
select has_table('public', 'skills', 'skills taxonomy exists');
select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profile_private_settings'
      and column_name = 'telegram_user_id'
  ),
  'Profile v2 private settings contain no Telegram identity'
);
select is(
  (select preferred_lang from public.profile_private_settings
   where profile_id = '50000000-0000-4000-8000-000000000001'),
  'ru',
  'new-profile private settings use the conservative language default'
);
select is(
  (select count(*)::integer from public.engineering_disciplines where is_active),
  8,
  'starter discipline taxonomy contains the required eight disciplines'
);

set local request.jwt.claim.sub = '50000000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local role authenticated;

select is(
  (select count(*)::integer from public.profile_private_settings
   where profile_id = '50000000-0000-4000-8000-000000000001'),
  1,
  'owner can read private settings'
);
select is(
  (select count(*)::integer from public.profile_private_settings
   where profile_id = '50000000-0000-4000-8000-000000000002'),
  0,
  'another user cannot read private settings'
);
select is(
  public._profile_v2_rows_affected(
    $$update public.profile_private_settings
      set allow_direct_messages = false
      where profile_id = '50000000-0000-4000-8000-000000000001'$$
  ),
  1,
  'owner can update private settings'
);
select ok(
  public._profile_v2_sql_throws(
    $$select telegram_user_id from public.profiles
      where id = '50000000-0000-4000-8000-000000000002'$$
  ),
  'authenticated users cannot read the legacy Telegram column'
);
select ok(
  public._profile_v2_sql_throws(
    $$select email from auth.users
      where id = '50000000-0000-4000-8000-000000000002'$$
  ),
  'authenticated users cannot read auth email'
);
select lives_ok(
  $$select public.replace_my_profile_relations(
    '[{"id":"20000000-0000-4000-8000-000000000001","proficiency":4}]'::jsonb,
    null, null, null
  )$$,
  'owner can atomically add a normalized skill'
);
select is(
  (select proficiency::integer from public.profile_skills
   where profile_id = '50000000-0000-4000-8000-000000000001'
     and skill_id = '20000000-0000-4000-8000-000000000001'),
  4,
  'owner can read normalized skill proficiency'
);
select is(
  (select count(*)::integer from public.profile_skills
   where profile_id = '50000000-0000-4000-8000-000000000002'),
  0,
  'another user relation is not visible'
);
select ok(
  public._profile_v2_sql_throws(
    $$select public.replace_my_profile_relations(
      '[{"id":"29999999-9999-4999-8999-999999999999"}]'::jsonb,
      null, null, null
    )$$
  ),
  'invalid taxonomy IDs are rejected by the atomic RPC'
);
select ok(
  public._profile_v2_sql_throws(
    $$update public.profiles
      set username = 'profilebeta'
      where id = '50000000-0000-4000-8000-000000000001'$$
  ),
  'username uniqueness is case insensitive'
);
select is(
  (select count(*)::integer from public.profiles
   where id = '50000000-0000-4000-8000-000000000002'),
  0,
  'existing owner-only profile RLS prevents direct cross-user discovery'
);

select * from finish();
rollback;
