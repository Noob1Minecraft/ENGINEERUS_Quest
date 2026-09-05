begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

create or replace function public._private_application_error(p_role_id uuid, p_note text default '')
returns text
language plpgsql
as $$
begin
  perform public.create_project_application(p_role_id, p_note);
  return null;
exception when others then
  return sqlerrm;
end;
$$;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '9a100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'private-owner@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '9a100000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'private-invitee@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '9a100000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'private-unrelated@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '9a100000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'private-member@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.projects (id, owner_id, title, status, visibility)
values
  ('9b100000-0000-4000-8000-000000000001', '9a100000-0000-4000-8000-000000000001', 'Private authorization fixture', 'open', 'private'),
  ('9b100000-0000-4000-8000-000000000002', '9a100000-0000-4000-8000-000000000001', 'Visible authorization fixture', 'open', 'authenticated'),
  ('9b100000-0000-4000-8000-000000000003', '9a100000-0000-4000-8000-000000000001', 'Private draft fixture', 'draft', 'private'),
  ('9b100000-0000-4000-8000-000000000004', '9a100000-0000-4000-8000-000000000001', 'Private archived fixture', 'archived', 'private');

insert into public.project_roles (id, project_id, title, positions_total, status)
values
  ('9c100000-0000-4000-8000-000000000001', '9b100000-0000-4000-8000-000000000001', 'Private open role', 4, 'open'),
  ('9c100000-0000-4000-8000-000000000002', '9b100000-0000-4000-8000-000000000002', 'Visible open role', 4, 'open'),
  ('9c100000-0000-4000-8000-000000000003', '9b100000-0000-4000-8000-000000000001', 'Private closed role', 1, 'closed'),
  ('9c100000-0000-4000-8000-000000000004', '9b100000-0000-4000-8000-000000000001', 'Private filled role', 1, 'filled'),
  ('9c100000-0000-4000-8000-000000000005', '9b100000-0000-4000-8000-000000000003', 'Private role on draft project', 1, 'open'),
  ('9c100000-0000-4000-8000-000000000006', '9b100000-0000-4000-8000-000000000004', 'Private role on archived project', 1, 'open');

insert into public.project_members (project_id, user_id, role_id)
values
  ('9b100000-0000-4000-8000-000000000001', '9a100000-0000-4000-8000-000000000004', '9c100000-0000-4000-8000-000000000001');

set local request.jwt.claim.sub = '9a100000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local role authenticated;

select lives_ok(
  $$select public.create_project_invitation(
    '9c100000-0000-4000-8000-000000000001',
    '9a100000-0000-4000-8000-000000000002',
    'Use the invitation flow', null
  )$$,
  'private project owner can invite an eligible user'
);

select is(
  public._private_application_error('9c100000-0000-4000-8000-000000000001', 'Owner attempt'),
  'self_application_forbidden',
  'owner remains blocked by the existing self-application guard'
);

reset role;
set local request.jwt.claim.sub = '9a100000-0000-4000-8000-000000000003';
set local request.jwt.claim.role = 'authenticated';
set local role authenticated;

select is(
  (select count(*)::integer from public.project_roles where id = '9c100000-0000-4000-8000-000000000001'),
  0,
  'unrelated user cannot discover the private role'
);
select is(
  (select count(*)::integer from public.projects where id = '9b100000-0000-4000-8000-000000000001'),
  0,
  'unrelated user cannot discover the private project'
);
select is(
  public._private_application_error('9c100000-0000-4000-8000-00000000ffff', 'Unknown role'),
  'project_role_not_found',
  'an unknown role UUID is denied without disclosure'
);
select is(
  public._private_application_error('9c100000-0000-4000-8000-000000000001', 'Known private role'),
  'project_role_not_found',
  'known private role UUID does not authorize an unrelated application'
);
select is(
  public._private_application_error('9c100000-0000-4000-8000-000000000003', 'Known private closed role'),
  'project_role_not_found',
  'private closed role is indistinguishable from an unknown role'
);
select is(
  public._private_application_error('9c100000-0000-4000-8000-000000000004', 'Known private filled role'),
  'project_role_not_found',
  'private filled role is indistinguishable from an unknown role'
);
select is(
  public._private_application_error('9c100000-0000-4000-8000-000000000005', 'Private draft project role'),
  'project_role_not_found',
  'private role on a draft project is indistinguishable from an unknown role'
);
select is(
  public._private_application_error('9c100000-0000-4000-8000-000000000006', 'Private archived project role'),
  'project_role_not_found',
  'private role on an archived project is indistinguishable from an unknown role'
);
select is(
  (select count(*)::integer from public.project_applications where applicant_id = '9a100000-0000-4000-8000-000000000003'),
  0,
  'denied private application inserts no row'
);
select is(
  (select count(*)::integer from public.project_roles where id = '9c100000-0000-4000-8000-000000000001'),
  0,
  'denied application does not unlock applicant-visible role access'
);
select lives_ok(
  $$select public.create_project_application('9c100000-0000-4000-8000-000000000002', 'Visible role application')$$,
  'eligible user can still apply to an authenticated-visible open role'
);

reset role;
set local request.jwt.claim.sub = '9a100000-0000-4000-8000-000000000002';
set local request.jwt.claim.role = 'authenticated';
set local role authenticated;

select is(
  public._private_application_error('9c100000-0000-4000-8000-000000000001', 'Invitee application attempt'),
  'project_role_not_found',
  'private role remains invitation-only for a pending invitee'
);
select lives_ok(
  $$select public.accept_project_invitation(
    (select id from public.project_invitations where role_id = '9c100000-0000-4000-8000-000000000001' and invitee_id = '9a100000-0000-4000-8000-000000000002')
  )$$,
  'invited user can join the private project through the intended invitation flow'
);
select is(
  (select count(*)::integer from public.project_members where project_id = '9b100000-0000-4000-8000-000000000001' and user_id = '9a100000-0000-4000-8000-000000000002'),
  1,
  'private invitation acceptance creates exactly one membership'
);

reset role;
set local request.jwt.claim.sub = '9a100000-0000-4000-8000-000000000004';
set local request.jwt.claim.role = 'authenticated';
set local role authenticated;

select is(
  public._private_application_error('9c100000-0000-4000-8000-000000000001', 'Existing member attempt'),
  'already_project_member',
  'existing member remains blocked by the existing membership guard'
);

reset role;
select is(
  (select count(*)::integer from public.project_applications where project_id = '9b100000-0000-4000-8000-000000000001'),
  0,
  'private project has no application rows after all denied attempts'
);
select is(
  (select count(*)::integer from public.project_applications where project_id = '9b100000-0000-4000-8000-000000000002'),
  1,
  'visible project preserves the legitimate application path'
);
select ok(
  has_function_privilege('authenticated', 'public.create_project_application(uuid,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.create_project_application(uuid,text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.create_project_application(uuid,text)', 'EXECUTE'),
  'RPC execute grants remain restricted to authenticated users'
);

select * from finish();
rollback;
