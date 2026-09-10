-- Administrative authorization is stored separately from user-editable profile
-- data. The table has no browser or service-role data surface: authenticated
-- callers may only use the actor-derived RPCs defined below.
create table public.admin_roles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  role text not null default 'admin' check (role = 'admin'),
  granted_at timestamptz not null default now(),
  granted_by uuid null references public.profiles (id) on delete set null
);

alter table public.admin_roles enable row level security;
revoke all on table public.admin_roles from public, anon, authenticated, service_role;

alter table public.beta_feedback
  add column admin_status text not null default 'new'
    check (admin_status in ('new', 'reviewed', 'resolved')),
  add column reviewed_at timestamptz null,
  add column reviewed_by uuid null references public.profiles (id) on delete set null;

create index beta_feedback_admin_status_created_idx
on public.beta_feedback (admin_status, created_at desc, id desc);

comment on table public.admin_roles is
  'Operator-bootstrapped Engineerus administrators. Browser table access is denied; role changes use authenticated RPCs.';
comment on column public.beta_feedback.admin_status is
  'Administrative workflow state. Feedback submission remains append-only for the trusted service.';

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.admin_roles as roles
      where roles.user_id = (select auth.uid())
        and roles.role = 'admin'
    );
$$;

create function public.admin_list_feedback(
  p_limit integer default 25,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  id uuid,
  category text,
  rating smallint,
  product_area text,
  message text,
  status text,
  created_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid,
  submitter_id uuid,
  submitter_username text,
  submitter_display_name text,
  submitter_avatar_url text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.is_admin() then
    raise exception using errcode = '42501', message = 'admin_forbidden';
  end if;
  if p_limit < 1 or p_limit > 50
     or ((p_before_created_at is null) <> (p_before_id is null)) then
    raise exception using errcode = '22023', message = 'invalid_admin_feedback_query';
  end if;

  return query
  select feedback.id, feedback.category, feedback.rating, feedback.product_area,
    feedback.message, feedback.admin_status, feedback.created_at,
    feedback.reviewed_at, feedback.reviewed_by, feedback.user_id,
    profile.username, profile.display_name, profile.avatar_url
  from public.beta_feedback as feedback
  left join public.profiles as profile on profile.id = feedback.user_id
  where p_before_created_at is null
     or (feedback.created_at, feedback.id) < (p_before_created_at, p_before_id)
  order by feedback.created_at desc, feedback.id desc
  limit p_limit;
end;
$$;

create function public.admin_get_feedback(p_feedback_id uuid)
returns table (
  id uuid,
  category text,
  rating smallint,
  product_area text,
  message text,
  status text,
  created_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid,
  submitter_id uuid,
  submitter_username text,
  submitter_display_name text,
  submitter_avatar_url text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.is_admin() then
    raise exception using errcode = '42501', message = 'admin_forbidden';
  end if;

  return query
  select feedback.id, feedback.category, feedback.rating, feedback.product_area,
    feedback.message, feedback.admin_status, feedback.created_at,
    feedback.reviewed_at, feedback.reviewed_by, feedback.user_id,
    profile.username, profile.display_name, profile.avatar_url
  from public.beta_feedback as feedback
  left join public.profiles as profile on profile.id = feedback.user_id
  where feedback.id = p_feedback_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'admin_feedback_not_found';
  end if;
end;
$$;

create function public.admin_update_feedback_status(
  p_feedback_id uuid,
  p_status text
)
returns table (
  id uuid,
  category text,
  rating smallint,
  product_area text,
  message text,
  status text,
  created_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid,
  submitter_id uuid,
  submitter_username text,
  submitter_display_name text,
  submitter_avatar_url text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if (select auth.uid()) is null or not public.is_admin() then
    raise exception using errcode = '42501', message = 'admin_forbidden';
  end if;
  if p_status not in ('new', 'reviewed', 'resolved') then
    raise exception using errcode = '22023', message = 'invalid_admin_feedback_status';
  end if;

  update public.beta_feedback as feedback
  set admin_status = p_status,
      reviewed_at = case when p_status = 'new' then null else now() end,
      reviewed_by = case when p_status = 'new' then null else actor end
  where feedback.id = p_feedback_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'admin_feedback_not_found';
  end if;

  return query
  select feedback.id, feedback.category, feedback.rating, feedback.product_area,
    feedback.message, feedback.admin_status, feedback.created_at,
    feedback.reviewed_at, feedback.reviewed_by, feedback.user_id,
    profile.username, profile.display_name, profile.avatar_url
  from public.beta_feedback as feedback
  left join public.profiles as profile on profile.id = feedback.user_id
  where feedback.id = p_feedback_id;
end;
$$;

create function public.admin_list_admins()
returns table (
  user_id uuid,
  role text,
  granted_at timestamptz,
  granted_by uuid,
  username text,
  display_name text,
  avatar_url text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.is_admin() then
    raise exception using errcode = '42501', message = 'admin_forbidden';
  end if;

  return query
  select roles.user_id, roles.role, roles.granted_at, roles.granted_by,
    profile.username, profile.display_name, profile.avatar_url
  from public.admin_roles as roles
  join public.profiles as profile on profile.id = roles.user_id
  order by roles.granted_at asc, roles.user_id asc;
end;
$$;

create function public.admin_search_users(
  p_query text,
  p_limit integer default 20
)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  is_admin boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_query text := lower(btrim(coalesce(p_query, '')));
begin
  if (select auth.uid()) is null or not public.is_admin() then
    raise exception using errcode = '42501', message = 'admin_forbidden';
  end if;
  if char_length(normalized_query) < 2 or char_length(normalized_query) > 80
     or p_limit < 1 or p_limit > 20 then
    raise exception using errcode = '22023', message = 'invalid_admin_user_search';
  end if;

  return query
  select profile.id, profile.username, profile.display_name, profile.avatar_url,
    (roles.user_id is not null)
  from public.profiles as profile
  left join public.admin_roles as roles on roles.user_id = profile.id
  where position(normalized_query in lower(coalesce(profile.username, ''))) > 0
     or position(normalized_query in lower(coalesce(profile.display_name, ''))) > 0
  order by coalesce(profile.display_name, profile.username, profile.id::text), profile.id
  limit p_limit;
end;
$$;

create function public.admin_grant_role(p_target_user_id uuid)
returns table (
  user_id uuid,
  role text,
  granted_at timestamptz,
  granted_by uuid,
  username text,
  display_name text,
  avatar_url text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  perform pg_catalog.pg_advisory_xact_lock(831274991001);
  if (select auth.uid()) is null or not public.is_admin() then
    raise exception using errcode = '42501', message = 'admin_forbidden';
  end if;
  if not exists (select 1 from public.profiles as profile where profile.id = p_target_user_id) then
    raise exception using errcode = 'P0002', message = 'admin_target_not_found';
  end if;

  insert into public.admin_roles (user_id, role, granted_by)
  values (p_target_user_id, 'admin', actor)
  on conflict on constraint admin_roles_pkey do nothing;

  return query
  select roles.user_id, roles.role, roles.granted_at, roles.granted_by,
    profile.username, profile.display_name, profile.avatar_url
  from public.admin_roles as roles
  join public.profiles as profile on profile.id = roles.user_id
  where roles.user_id = p_target_user_id;
end;
$$;

create function public.admin_revoke_role(p_target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(831274991001);
  if (select auth.uid()) is null or not public.is_admin() then
    raise exception using errcode = '42501', message = 'admin_forbidden';
  end if;
  if not exists (select 1 from public.admin_roles as roles where roles.user_id = p_target_user_id) then
    raise exception using errcode = 'P0002', message = 'admin_target_not_found';
  end if;
  if (select count(*) from public.admin_roles) <= 1 then
    raise exception using errcode = 'P0001', message = 'last_admin_required';
  end if;

  delete from public.admin_roles as roles where roles.user_id = p_target_user_id;
  return true;
end;
$$;

revoke all on function public.is_admin() from public, anon, authenticated, service_role;
revoke all on function public.admin_list_feedback(integer, timestamptz, uuid) from public, anon, authenticated, service_role;
revoke all on function public.admin_get_feedback(uuid) from public, anon, authenticated, service_role;
revoke all on function public.admin_update_feedback_status(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.admin_list_admins() from public, anon, authenticated, service_role;
revoke all on function public.admin_search_users(text, integer) from public, anon, authenticated, service_role;
revoke all on function public.admin_grant_role(uuid) from public, anon, authenticated, service_role;
revoke all on function public.admin_revoke_role(uuid) from public, anon, authenticated, service_role;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.admin_list_feedback(integer, timestamptz, uuid) to authenticated;
grant execute on function public.admin_get_feedback(uuid) to authenticated;
grant execute on function public.admin_update_feedback_status(uuid, text) to authenticated;
grant execute on function public.admin_list_admins() to authenticated;
grant execute on function public.admin_search_users(text, integer) to authenticated;
grant execute on function public.admin_grant_role(uuid) to authenticated;
grant execute on function public.admin_revoke_role(uuid) to authenticated;

-- First-admin bootstrap is intentionally operator-only and has no permanent
-- browser endpoint. After verifying the immutable auth/profile UUID, an
-- authorized database operator runs exactly:
-- insert into public.admin_roles (user_id, role, granted_by)
-- values ('<verified-profile-uuid>'::uuid, 'admin', null);
-- A null granted_by denotes the one-time operator bootstrap; every later grant
-- records the authenticated administrator returned by auth.uid().
