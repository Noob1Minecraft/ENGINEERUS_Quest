begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(29);

create or replace function public._projects_sql_throws(statement text)
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

create or replace function public._projects_rows_affected(statement text)
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
    '91000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'project-owner@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"ProjectOwner"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '91000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'project-other@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"ProjectOther"}'::jsonb, now(), now()
  );

select has_table('public', 'projects', 'projects table exists');
select col_is_pk('public', 'projects', 'id', 'projects use a UUID primary key');
select col_default_is('public', 'projects', 'owner_id', 'auth.uid()', 'owner defaults to auth.uid()');
select is((select relrowsecurity from pg_class where oid = 'public.projects'::regclass), true, 'projects RLS is enabled');
select has_index('public', 'projects', 'projects_owner_id_idx', 'owner index exists');
select has_index('public', 'projects', 'projects_status_idx', 'status index exists');
select has_index('public', 'projects', 'projects_visibility_idx', 'visibility index exists');
select has_index('public', 'projects', 'projects_primary_discipline_id_idx', 'discipline index exists');
select has_index('public', 'projects', 'projects_created_at_idx', 'created-at index exists');
select has_trigger('public', 'projects', 'projects_set_updated_at', 'updated-at trigger exists');
select ok(has_column_privilege('authenticated', 'public.projects', 'title', 'SELECT'), 'authenticated may select safe columns through RLS');
select ok(has_column_privilege('authenticated', 'public.projects', 'title', 'INSERT'), 'authenticated may insert safe columns');
select ok(has_column_privilege('authenticated', 'public.projects', 'title', 'UPDATE'), 'authenticated may update safe columns');
select ok(not has_table_privilege('authenticated', 'public.projects', 'DELETE'), 'hard delete is not exposed');
select ok(not has_table_privilege('anon', 'public.projects', 'SELECT'), 'anonymous project discovery is disabled');

set local request.jwt.claim.sub = '91000000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local role authenticated;

select lives_ok(
  $$insert into public.projects (title) values ('Owner draft')$$,
  'authenticated user creates an own project'
);
select is(
  (select owner_id from public.projects where title = 'Owner draft'),
  '91000000-0000-4000-8000-000000000001'::uuid,
  'project owner is derived from auth.uid()'
);
select ok(
  public._projects_sql_throws(
    $$insert into public.projects (owner_id, title)
      values ('91000000-0000-4000-8000-000000000002', 'Spoofed')$$
  ),
  'owner_id cannot be supplied through the authenticated grant surface'
);
select is((select count(*)::integer from public.projects where title = 'Owner draft'), 1, 'owner reads own private draft');
select lives_ok(
  $$insert into public.projects (title, status, visibility)
    values ('Visible project', 'open', 'authenticated')$$,
  'owner can publish an authenticated-visible project'
);
select lives_ok(
  $$insert into public.projects (title) values ('Archive target')$$,
  'owner can create a project for the archive path'
);
select is(
  public._projects_rows_affected($$update public.projects set status = 'archived' where title = 'Archive target'$$),
  1,
  'owner can archive an own project'
);

reset role;
set local request.jwt.claim.sub = '91000000-0000-4000-8000-000000000002';
set local request.jwt.claim.role = 'authenticated';
set local role authenticated;

select is((select count(*)::integer from public.projects where title = 'Owner draft'), 0, 'another user cannot read a private draft');
select is((select count(*)::integer from public.projects where title = 'Visible project'), 1, 'another authenticated user reads a visible non-draft project');
select is(
  public._projects_rows_affected($$update public.projects set title = 'Hijacked' where title = 'Visible project'$$),
  0,
  'another user cannot update a project'
);
select is(
  public._projects_rows_affected($$update public.projects set status = 'archived' where title = 'Visible project'$$),
  0,
  'another user cannot archive a project'
);
select ok(
  public._projects_sql_throws($$insert into public.projects (title, primary_discipline_id) values ('Bad discipline', '99999999-9999-4999-8999-999999999999')$$),
  'invalid discipline is rejected'
);
select ok(
  public._projects_sql_throws($$insert into public.projects (title, status) values ('Bad status', 'unknown')$$),
  'invalid status is rejected'
);
select ok(
  public._projects_sql_throws($$insert into public.projects (title, visibility) values ('Bad visibility', 'everyone')$$),
  'invalid visibility is rejected'
);

select * from finish();
rollback;
