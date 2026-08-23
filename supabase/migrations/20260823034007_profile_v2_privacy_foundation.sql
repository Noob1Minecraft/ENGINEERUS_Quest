-- Profile v2 keeps Supabase Auth as the only identity system. The legacy
-- profiles.telegram_user_id column remains temporarily for compatibility, but
-- no Profile v2 grant, policy, relation, function, or DTO depends on it.

create table public.engineering_disciplines (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label_ru text not null,
  label_kk text not null,
  label_en text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (slug = lower(slug) and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  check (char_length(label_ru) between 1 and 100),
  check (char_length(label_kk) between 1 and 100),
  check (char_length(label_en) between 1 and 100)
);

create table public.skills (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label_ru text not null,
  label_kk text not null,
  label_en text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (slug = lower(slug) and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  check (char_length(label_ru) between 1 and 100),
  check (char_length(label_kk) between 1 and 100),
  check (char_length(label_en) between 1 and 100)
);

create table public.tools (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label_ru text not null,
  label_kk text not null,
  label_en text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (slug = lower(slug) and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  check (char_length(label_ru) between 1 and 100),
  check (char_length(label_kk) between 1 and 100),
  check (char_length(label_en) between 1 and 100)
);

create table public.interests (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label_ru text not null,
  label_kk text not null,
  label_en text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (slug = lower(slug) and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  check (char_length(label_ru) between 1 and 100),
  check (char_length(label_kk) between 1 and 100),
  check (char_length(label_en) between 1 and 100)
);

insert into public.engineering_disciplines (id, slug, label_ru, label_kk, label_en)
values
  ('10000000-0000-4000-8000-000000000001', 'mechanical', 'Машиностроение', 'Машина жасау', 'Mechanical Engineering'),
  ('10000000-0000-4000-8000-000000000002', 'electrical', 'Электротехника', 'Электротехника', 'Electrical Engineering'),
  ('10000000-0000-4000-8000-000000000003', 'software', 'Разработка ПО', 'Бағдарламалық жасақтама', 'Software Engineering'),
  ('10000000-0000-4000-8000-000000000004', 'civil', 'Строительство', 'Құрылыс инженериясы', 'Civil Engineering'),
  ('10000000-0000-4000-8000-000000000005', 'chemical', 'Химическая инженерия', 'Химиялық инженерия', 'Chemical Engineering'),
  ('10000000-0000-4000-8000-000000000006', 'materials', 'Материаловедение', 'Материалтану', 'Materials Engineering'),
  ('10000000-0000-4000-8000-000000000007', 'aerospace', 'Аэрокосмическая инженерия', 'Аэроғарыш инженериясы', 'Aerospace Engineering'),
  ('10000000-0000-4000-8000-000000000008', 'mechatronics', 'Мехатроника', 'Мехатроника', 'Mechatronics')
on conflict (slug) do nothing;

insert into public.skills (id, slug, label_ru, label_kk, label_en)
values
  ('20000000-0000-4000-8000-000000000001', 'mechanical-design', 'Механическое проектирование', 'Механикалық жобалау', 'Mechanical Design'),
  ('20000000-0000-4000-8000-000000000002', 'circuit-design', 'Проектирование электрических схем', 'Электр сұлбаларын жобалау', 'Circuit Design'),
  ('20000000-0000-4000-8000-000000000003', 'software-development', 'Разработка программного обеспечения', 'Бағдарламалық жасақтаманы әзірлеу', 'Software Development'),
  ('20000000-0000-4000-8000-000000000004', 'structural-analysis', 'Расчёт конструкций', 'Құрылымдық талдау', 'Structural Analysis'),
  ('20000000-0000-4000-8000-000000000005', 'materials-selection', 'Выбор материалов', 'Материалдарды таңдау', 'Materials Selection'),
  ('20000000-0000-4000-8000-000000000006', 'welding', 'Сварочное производство', 'Дәнекерлеу өндірісі', 'Welding'),
  ('20000000-0000-4000-8000-000000000007', 'embedded-systems', 'Встраиваемые системы', 'Ендірілген жүйелер', 'Embedded Systems'),
  ('20000000-0000-4000-8000-000000000008', 'project-management', 'Управление проектами', 'Жобаларды басқару', 'Project Management')
on conflict (slug) do nothing;

insert into public.tools (id, slug, label_ru, label_kk, label_en)
values
  ('30000000-0000-4000-8000-000000000001', 'solidworks', 'SolidWorks', 'SolidWorks', 'SolidWorks'),
  ('30000000-0000-4000-8000-000000000002', 'autocad', 'AutoCAD', 'AutoCAD', 'AutoCAD'),
  ('30000000-0000-4000-8000-000000000003', 'matlab', 'MATLAB', 'MATLAB', 'MATLAB'),
  ('30000000-0000-4000-8000-000000000004', 'python', 'Python', 'Python', 'Python'),
  ('30000000-0000-4000-8000-000000000005', 'arduino', 'Arduino', 'Arduino', 'Arduino'),
  ('30000000-0000-4000-8000-000000000006', 'ros2', 'ROS 2', 'ROS 2', 'ROS 2')
on conflict (slug) do nothing;

insert into public.interests (id, slug, label_ru, label_kk, label_en)
values
  ('40000000-0000-4000-8000-000000000001', 'robotics', 'Робототехника', 'Робототехника', 'Robotics'),
  ('40000000-0000-4000-8000-000000000002', 'renewable-energy', 'Возобновляемая энергетика', 'Жаңартылатын энергетика', 'Renewable Energy'),
  ('40000000-0000-4000-8000-000000000003', 'manufacturing', 'Производство', 'Өндіріс', 'Manufacturing'),
  ('40000000-0000-4000-8000-000000000004', 'civil-infrastructure', 'Гражданская инфраструктура', 'Азаматтық инфрақұрылым', 'Civil Infrastructure'),
  ('40000000-0000-4000-8000-000000000005', 'aerospace-systems', 'Аэрокосмические системы', 'Аэроғарыш жүйелері', 'Aerospace Systems'),
  ('40000000-0000-4000-8000-000000000006', 'materials-engineering', 'Инженерия материалов', 'Материалдар инженериясы', 'Materials Engineering')
on conflict (slug) do nothing;

alter table public.profiles
add column university_name text,
add column primary_discipline_id uuid references public.engineering_disciplines (id) on delete set null,
add column bio text,
add column portfolio_url text,
add column profile_visibility text not null default 'private'
  check (profile_visibility in ('public', 'authenticated', 'private')),
add column portfolio_visibility text not null default 'private'
  check (portfolio_visibility in ('public', 'authenticated', 'private')),
add column available_for_projects boolean not null default false,
add constraint profiles_university_name_length
  check (university_name is null or char_length(university_name) between 1 and 200),
add constraint profiles_bio_length
  check (bio is null or char_length(bio) between 1 and 2000),
add constraint profiles_portfolio_url_length
  check (portfolio_url is null or char_length(portfolio_url) between 1 and 2048),
add constraint profiles_portfolio_url_scheme
  check (portfolio_url is null or portfolio_url ~* '^https?://');

create index profiles_primary_discipline_id_idx
on public.profiles (primary_discipline_id)
where primary_discipline_id is not null;

create index profiles_discovery_idx
on public.profiles (profile_visibility, available_for_projects, id);

do $$
begin
  if exists (
    select 1
    from public.profiles
    where username is not null
    group by lower(username)
    having count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'Cannot enforce case-insensitive username uniqueness: duplicate usernames already exist.';
  end if;
end;
$$;

create unique index profiles_username_ci_unique
on public.profiles (lower(username))
where username is not null;

create table public.profile_private_settings (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  preferred_lang text not null default 'ru'
    check (preferred_lang in ('ru', 'kk', 'en')),
  allow_project_invitations boolean not null default true,
  allow_direct_messages boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profile_private_settings_set_updated_at
before update on public.profile_private_settings
for each row execute function public.set_updated_at();

insert into public.profile_private_settings (profile_id, preferred_lang)
select id, preferred_lang
from public.profiles
on conflict (profile_id) do nothing;

create or replace function public.handle_new_profile_private_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.profile_private_settings (profile_id, preferred_lang)
  values (new.id, new.preferred_lang)
  on conflict (profile_id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_profile_private_settings()
from public, anon, authenticated, service_role;

create trigger on_profile_created_private_settings
after insert on public.profiles
for each row execute function public.handle_new_profile_private_settings();

create table public.profile_skills (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  skill_id uuid not null references public.skills (id) on delete restrict,
  proficiency smallint check (proficiency between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (profile_id, skill_id)
);

create index profile_skills_skill_profile_idx
on public.profile_skills (skill_id, profile_id);

create table public.profile_tools (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  tool_id uuid not null references public.tools (id) on delete restrict,
  proficiency smallint check (proficiency between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (profile_id, tool_id)
);

create index profile_tools_tool_profile_idx
on public.profile_tools (tool_id, profile_id);

create table public.profile_interests (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  interest_id uuid not null references public.interests (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (profile_id, interest_id)
);

create index profile_interests_interest_profile_idx
on public.profile_interests (interest_id, profile_id);

create table public.profile_languages (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  language_code text not null,
  proficiency smallint check (proficiency between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (profile_id, language_code),
  check (language_code ~ '^[a-z]{2,3}(-[A-Z]{2})?$')
);

alter table public.engineering_disciplines enable row level security;
alter table public.skills enable row level security;
alter table public.tools enable row level security;
alter table public.interests enable row level security;
alter table public.profile_private_settings enable row level security;
alter table public.profile_skills enable row level security;
alter table public.profile_tools enable row level security;
alter table public.profile_interests enable row level security;
alter table public.profile_languages enable row level security;

revoke all on table public.engineering_disciplines from anon, authenticated;
revoke all on table public.skills from anon, authenticated;
revoke all on table public.tools from anon, authenticated;
revoke all on table public.interests from anon, authenticated;
revoke all on table public.profile_private_settings from anon, authenticated;
revoke all on table public.profile_skills from anon, authenticated;
revoke all on table public.profile_tools from anon, authenticated;
revoke all on table public.profile_interests from anon, authenticated;
revoke all on table public.profile_languages from anon, authenticated;

-- Replace the legacy table-wide profile grant with an explicit safe-column
-- surface. preferred_lang now comes from profile_private_settings and the
-- deprecated telegram_user_id column is intentionally omitted.
revoke all on table public.profiles from anon, authenticated;
grant select (
  id, username, display_name, avatar_url, university_name,
  primary_discipline_id, bio, portfolio_url, profile_visibility,
  portfolio_visibility, available_for_projects, created_at, updated_at
) on public.profiles to authenticated;
grant update (
  username, display_name, avatar_url, university_name, primary_discipline_id,
  bio, portfolio_url, profile_visibility, portfolio_visibility,
  available_for_projects
) on public.profiles to authenticated;

grant select on table public.engineering_disciplines to authenticated;
grant select on table public.skills to authenticated;
grant select on table public.tools to authenticated;
grant select on table public.interests to authenticated;

grant select on table public.profile_private_settings to authenticated;
grant update (preferred_lang, allow_project_invitations, allow_direct_messages)
on public.profile_private_settings to authenticated;

grant select, insert, delete on table public.profile_skills to authenticated;
grant update (proficiency) on public.profile_skills to authenticated;
grant select, insert, delete on table public.profile_tools to authenticated;
grant update (proficiency) on public.profile_tools to authenticated;
grant select, insert, delete on table public.profile_interests to authenticated;
grant select, insert, delete on table public.profile_languages to authenticated;
grant update (proficiency) on public.profile_languages to authenticated;

create policy engineering_disciplines_select_active
on public.engineering_disciplines for select
to authenticated
using (is_active = true);

create policy skills_select_active
on public.skills for select
to authenticated
using (is_active = true);

create policy tools_select_active
on public.tools for select
to authenticated
using (is_active = true);

create policy interests_select_active
on public.interests for select
to authenticated
using (is_active = true);

create policy profile_private_settings_select_own
on public.profile_private_settings for select
to authenticated
using ((select auth.uid()) = profile_id);

create policy profile_private_settings_update_own
on public.profile_private_settings for update
to authenticated
using ((select auth.uid()) = profile_id)
with check ((select auth.uid()) = profile_id);

create policy profile_skills_select_own
on public.profile_skills for select
to authenticated
using ((select auth.uid()) = profile_id);

create policy profile_skills_insert_own
on public.profile_skills for insert
to authenticated
with check ((select auth.uid()) = profile_id);

create policy profile_skills_update_own
on public.profile_skills for update
to authenticated
using ((select auth.uid()) = profile_id)
with check ((select auth.uid()) = profile_id);

create policy profile_skills_delete_own
on public.profile_skills for delete
to authenticated
using ((select auth.uid()) = profile_id);

create policy profile_tools_select_own
on public.profile_tools for select
to authenticated
using ((select auth.uid()) = profile_id);

create policy profile_tools_insert_own
on public.profile_tools for insert
to authenticated
with check ((select auth.uid()) = profile_id);

create policy profile_tools_update_own
on public.profile_tools for update
to authenticated
using ((select auth.uid()) = profile_id)
with check ((select auth.uid()) = profile_id);

create policy profile_tools_delete_own
on public.profile_tools for delete
to authenticated
using ((select auth.uid()) = profile_id);

create policy profile_interests_select_own
on public.profile_interests for select
to authenticated
using ((select auth.uid()) = profile_id);

create policy profile_interests_insert_own
on public.profile_interests for insert
to authenticated
with check ((select auth.uid()) = profile_id);

create policy profile_interests_delete_own
on public.profile_interests for delete
to authenticated
using ((select auth.uid()) = profile_id);

create policy profile_languages_select_own
on public.profile_languages for select
to authenticated
using ((select auth.uid()) = profile_id);

create policy profile_languages_insert_own
on public.profile_languages for insert
to authenticated
with check ((select auth.uid()) = profile_id);

create policy profile_languages_update_own
on public.profile_languages for update
to authenticated
using ((select auth.uid()) = profile_id)
with check ((select auth.uid()) = profile_id);

create policy profile_languages_delete_own
on public.profile_languages for delete
to authenticated
using ((select auth.uid()) = profile_id);
