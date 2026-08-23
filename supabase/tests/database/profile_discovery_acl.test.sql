begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(24);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '51000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'discovery-a@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '51000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'discovery-b@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now()
  );

update public.profiles
set profile_visibility = 'authenticated',
    primary_discipline_id = '10000000-0000-4000-8000-000000000001'
where id = '51000000-0000-4000-8000-000000000002';

insert into public.profile_skills (profile_id, skill_id, proficiency)
values (
  '51000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000001',
  4
);

select ok(
  (
    select array_agg(column_name order by column_name)
    from information_schema.column_privileges
    where table_schema = 'public'
      and table_name = 'profiles'
      and grantee = 'service_role'
      and privilege_type = 'SELECT'
  ) = array[
    'available_for_projects', 'avatar_url', 'bio', 'created_at', 'display_name',
    'id', 'portfolio_url', 'portfolio_visibility', 'primary_discipline_id',
    'profile_visibility', 'university_name', 'updated_at', 'username'
  ]::information_schema.sql_identifier[],
  'service_role profile SELECT surface is exactly the PublicProfile-backed columns'
);

select ok(
  has_column_privilege('service_role', 'public.profiles', 'id', 'select'),
  'service_role can select profile identifiers'
);
select ok(
  has_column_privilege('service_role', 'public.profiles', 'profile_visibility', 'select'),
  'service_role can enforce profile discoverability'
);
select ok(
  has_column_privilege('service_role', 'public.profiles', 'portfolio_visibility', 'select'),
  'service_role can enforce portfolio visibility'
);
select ok(
  not has_column_privilege('service_role', 'public.profiles', 'telegram_user_id', 'select'),
  'service_role cannot select the legacy Telegram identity'
);
select ok(
  not has_column_privilege('service_role', 'public.profiles', 'preferred_lang', 'select'),
  'service_role cannot select the legacy profile language column'
);
select ok(
  not has_table_privilege('service_role', 'public.profile_private_settings', 'select'),
  'service_role has no table-level private-settings SELECT'
);
select ok(
  not has_column_privilege('service_role', 'public.profile_private_settings', 'preferred_lang', 'select'),
  'service_role has no private-settings column SELECT'
);

select ok(
  has_column_privilege('service_role', 'public.engineering_disciplines', 'label_en', 'select'),
  'service_role can read discipline display metadata'
);
select ok(
  has_column_privilege('service_role', 'public.skills', 'label_ru', 'select'),
  'service_role can read skill display metadata'
);
select ok(
  has_column_privilege('service_role', 'public.tools', 'label_kk', 'select'),
  'service_role can read tool display metadata'
);
select ok(
  has_column_privilege('service_role', 'public.interests', 'slug', 'select'),
  'service_role can read interest display metadata'
);
select ok(
  not has_column_privilege('service_role', 'public.skills', 'is_active', 'select'),
  'service_role taxonomy access excludes non-discovery columns'
);
select ok(
  has_column_privilege('service_role', 'public.profile_skills', 'skill_id', 'select'),
  'service_role can read discovery skill relations'
);
select ok(
  has_column_privilege('service_role', 'public.profile_tools', 'tool_id', 'select'),
  'service_role can read discovery tool relations'
);
select ok(
  has_column_privilege('service_role', 'public.profile_interests', 'interest_id', 'select'),
  'service_role can read discovery interest relations'
);
select ok(
  has_column_privilege('service_role', 'public.profile_languages', 'language_code', 'select'),
  'service_role can read discovery language relations'
);
select ok(
  not has_column_privilege('service_role', 'public.profile_skills', 'created_at', 'select'),
  'service_role relation access excludes non-discovery columns'
);

set local role service_role;

select lives_ok(
  $$select p.id, p.username, p.display_name, p.avatar_url, p.university_name,
           p.primary_discipline_id, p.bio, p.portfolio_url,
           p.profile_visibility, p.portfolio_visibility,
           p.available_for_projects, p.created_at, p.updated_at
    from public.profiles p
    where p.profile_visibility in ('public', 'authenticated')
    order by p.id
    limit 26$$,
  'service_role can perform the safe profile discovery projection'
);

select lives_ok(
  $$select ps.profile_id, ps.proficiency,
           s.id, s.slug, s.label_ru, s.label_kk, s.label_en
    from public.profile_skills ps
    join public.skills s on s.id = ps.skill_id
    where ps.profile_id = '51000000-0000-4000-8000-000000000002'$$,
  'service_role can load the normalized discovery relation projection'
);

select throws_ok(
  $$select telegram_user_id from public.profiles$$,
  '42501',
  'permission denied for table profiles',
  'service_role cannot query telegram_user_id'
);

select throws_ok(
  $$select preferred_lang from public.profile_private_settings$$,
  '42501',
  'permission denied for table profile_private_settings',
  'service_role cannot query private profile settings'
);

reset role;
set local role anon;

select throws_ok(
  $$select id from public.profiles$$,
  '42501',
  'permission denied for table profiles',
  'anon gains no profile discovery privilege'
);

reset role;
set local request.jwt.claim.sub = '51000000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local role authenticated;

select is(
  (select count(*)::integer
   from public.profiles
   where id = '51000000-0000-4000-8000-000000000002'),
  0,
  'authenticated direct cross-user profile access remains owner-only'
);

select * from finish();
rollback;
