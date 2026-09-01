begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

create or replace function public._phase_c_throws(statement text)
returns boolean language plpgsql as $$
begin
  execute statement;
  return false;
exception when others then
  return true;
end;
$$;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '92000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'phase-c-owner@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '92000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'phase-c-applicant-1@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '92000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'phase-c-applicant-2@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '92000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'phase-c-invitee@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

select has_table('public', 'project_roles', 'project_roles exists');
select has_table('public', 'project_role_skills', 'project_role_skills exists');
select has_table('public', 'project_members', 'project_members exists');
select has_table('public', 'project_applications', 'project_applications exists');
select has_table('public', 'project_invitations', 'project_invitations exists');
select ok((select relrowsecurity from pg_class where oid = 'public.project_roles'::regclass), 'project_roles RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.project_members'::regclass), 'project_members RLS enabled');
select ok(not has_table_privilege('authenticated', 'public.project_members', 'INSERT'), 'clients cannot insert members');
select ok(not has_table_privilege('authenticated', 'public.project_applications', 'UPDATE'), 'clients cannot mutate application status');
select ok(not has_table_privilege('authenticated', 'public.project_invitations', 'UPDATE'), 'clients cannot mutate invitation status');
select ok(not has_table_privilege('anon', 'public.project_roles', 'SELECT'), 'anon receives no role access');
select ok(not has_table_privilege('service_role', 'public.project_roles', 'SELECT'), 'service_role receives no role table access');
select ok(not has_table_privilege('service_role', 'public.project_applications', 'SELECT'), 'service_role receives no application table access');
select ok(not has_table_privilege('service_role', 'public.project_invitations', 'SELECT'), 'service_role receives no invitation table access');
select ok(has_function_privilege('authenticated', 'public.accept_project_application(uuid)', 'EXECUTE'), 'authenticated can call hardened application acceptance');
select ok(not has_function_privilege('anon', 'public.accept_project_application(uuid)', 'EXECUTE'), 'anon cannot accept applications');
select ok(not has_function_privilege('service_role', 'public.accept_project_application(uuid)', 'EXECUTE'), 'service_role cannot call application acceptance');
select ok(
  pg_get_functiondef('public.accept_project_application(uuid)'::regprocedure)
    like
  '%where id = v_application.role_id for update%',
  'application acceptance locks the shared role before the request'
);
select ok(
  pg_get_functiondef('public.accept_project_invitation(uuid)'::regprocedure)
    like
  '%where id = v_invitation.role_id for update%',
  'invitation acceptance locks the shared role before the request'
);
select ok(
  pg_get_functiondef('public.accept_project_application(uuid)'::regprocedure)
    like '%where id = p_application_id for update%',
  'application acceptance locks the request row'
);
select ok(
  pg_get_functiondef('public.accept_project_invitation(uuid)'::regprocedure)
    like '%where id = p_invitation_id for update%',
  'invitation acceptance locks the request row'
);

set local request.jwt.claim.sub = '92000000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local role authenticated;

insert into public.projects (title, status, visibility)
values ('Phase C project', 'open', 'authenticated');

select lives_ok(
  $$select public.create_project_role(
    (select id from public.projects where title = 'Phase C project'),
    'Mechanical designer', 'Design components',
    '10000000-0000-4000-8000-000000000001', 1,
    array['20000000-0000-4000-8000-000000000001']::uuid[],
    array['required']::text[], array[10]::integer[]
  )$$,
  'project owner creates a normalized role'
);
select is((select count(*)::integer from public.project_role_skills), 1, 'role skill stored in normalized relation');
select lives_ok(
  $$select public.update_project_role(
    (select id from public.project_roles where title = 'Mechanical designer'),
    p_description => 'Updated description', p_positions_total => 1
  )$$,
  'project owner updates a role'
);
select is((select description from public.project_roles where title = 'Mechanical designer'), 'Updated description', 'role update persisted');
select ok(
  public._phase_c_throws($$select public.create_project_application((select id from public.project_roles where title = 'Mechanical designer'), '')$$),
  'project owner cannot apply to own role'
);
select ok(
  public._phase_c_throws($$select public.create_project_invitation((select id from public.project_roles where title = 'Mechanical designer'), '92000000-0000-4000-8000-000000000001', '', null)$$),
  'project owner cannot invite self'
);

reset role;
set local request.jwt.claim.sub = '92000000-0000-4000-8000-000000000002';
set local role authenticated;

select ok(
  public._phase_c_throws($$select public.update_project_role((select id from public.project_roles where title = 'Mechanical designer'), p_title => 'Hijacked')$$),
  'non-owner cannot update roles'
);
select lives_ok(
  $$select public.create_project_application((select id from public.project_roles where title = 'Mechanical designer'), 'Applicant one')$$,
  'eligible user applies to an open role'
);
select is(
  (select applicant_id from public.project_applications where note = 'Applicant one'),
  '92000000-0000-4000-8000-000000000002'::uuid,
  'application identity is derived from auth.uid()'
);
select is(
  (select count(*)::integer from public.project_applications where applicant_id = '92000000-0000-4000-8000-000000000002'),
  1,
  'applicant reads their own application'
);
select ok(
  public._phase_c_throws($$select public.create_project_invitation(
    (select id from public.project_roles where title = 'Mechanical designer'),
    '92000000-0000-4000-8000-000000000004', '', null
  )$$),
  'non-owner cannot create invitations'
);
select ok(
  public._phase_c_throws($$select public.create_project_application((select id from public.project_roles where title = 'Mechanical designer'), 'Duplicate')$$),
  'duplicate application is blocked'
);
select is((select count(*)::integer from public.project_applications), 1, 'duplicate application did not create another row');

reset role;
set local request.jwt.claim.sub = '92000000-0000-4000-8000-000000000003';
set local role authenticated;
select lives_ok(
  $$select public.create_project_application((select id from public.project_roles where title = 'Mechanical designer'), 'Applicant two')$$,
  'second eligible user applies'
);
select ok(
  public._phase_c_throws($$select public.accept_project_application((select id from public.project_applications where applicant_id = '92000000-0000-4000-8000-000000000002'))$$),
  'non-owner cannot accept an application'
);
select is(
  (select count(*)::integer from public.project_applications where applicant_id = '92000000-0000-4000-8000-000000000002'),
  0,
  'an unrelated applicant cannot read another application'
);
select is(
  (select count(*)::integer from public.project_invitations),
  0,
  'an unrelated authenticated user cannot read invitations'
);

reset role;
set local request.jwt.claim.sub = '92000000-0000-4000-8000-000000000001';
set local role authenticated;
select lives_ok(
  $$select public.create_project_invitation(
    (select id from public.project_roles where title = 'Mechanical designer'),
    '92000000-0000-4000-8000-000000000004', 'Please join', null
  )$$,
  'owner invites an eligible real profile'
);
select ok(
  public._phase_c_throws($$select public.create_project_invitation(
    (select id from public.project_roles where title = 'Mechanical designer'),
    '92000000-0000-4000-8000-000000000004', 'Duplicate', null
  )$$),
  'duplicate pending invitation is blocked'
);
select is((select count(*)::integer from public.project_applications), 2, 'owner reads all project applications');
select is((select count(*)::integer from public.project_invitations), 1, 'owner reads project invitations');
select lives_ok(
  $$select public.accept_project_application(
    (select id from public.project_applications where applicant_id = '92000000-0000-4000-8000-000000000002')
  )$$,
  'owner atomically accepts an application'
);
select is((select count(*)::integer from public.project_members), 1, 'acceptance inserts exactly one member');
select is((select status from public.project_roles where title = 'Mechanical designer'), 'filled', 'final slot marks role filled');
select is((select status from public.project_applications where applicant_id = '92000000-0000-4000-8000-000000000003'), 'cancelled', 'remaining application is cancelled');
select is((select status from public.project_invitations where invitee_id = '92000000-0000-4000-8000-000000000004'), 'cancelled', 'remaining invitation is cancelled');
select ok(
  public._phase_c_throws($$select public.accept_project_application(
    (select id from public.project_applications where applicant_id = '92000000-0000-4000-8000-000000000002')
  )$$),
  'accepted application cannot be accepted twice'
);

reset role;
set local request.jwt.claim.sub = '92000000-0000-4000-8000-000000000004';
set local role authenticated;
select ok(
  public._phase_c_throws($$select public.create_project_application(
    (select id from public.project_roles where title = 'Mechanical designer'), ''
  )$$),
  'filled role rejects applications'
);

reset role;
set local request.jwt.claim.sub = '92000000-0000-4000-8000-000000000001';
set local role authenticated;
select ok(
  public._phase_c_throws($$select public.create_project_invitation(
    (select id from public.project_roles where title = 'Mechanical designer'),
    '92000000-0000-4000-8000-000000000004', '', null
  )$$),
  'filled role rejects invitations'
);

select lives_ok(
  $$select public.create_project_role(
    (select id from public.projects where title = 'Phase C project'),
    'Electrical engineer', '', null, 1, '{}'::uuid[], '{}'::text[], '{}'::integer[]
  )$$,
  'owner creates a second role for invitation acceptance'
);
select lives_ok(
  $$select public.create_project_invitation(
    (select id from public.project_roles where title = 'Electrical engineer'),
    '92000000-0000-4000-8000-000000000003', '', null
  )$$,
  'owner creates invitation for second role'
);

reset role;
set local request.jwt.claim.sub = '92000000-0000-4000-8000-000000000003';
set local role authenticated;
select is((select count(*)::integer from public.project_invitations where status = 'pending'), 1, 'invitee reads own pending invitation');
select lives_ok(
  $$select public.accept_project_invitation((select id from public.project_invitations where status = 'pending'))$$,
  'invitee atomically accepts invitation'
);
select is((select count(*)::integer from public.project_members where user_id = '92000000-0000-4000-8000-000000000003'), 1, 'invitation acceptance inserts one membership');
select is((select status from public.project_roles where title = 'Electrical engineer'), 'filled', 'invitation fills final role slot');

reset role;
set local request.jwt.claim.sub = '92000000-0000-4000-8000-000000000001';
set local role authenticated;
select lives_ok(
  $$select public.create_project_role(
    (select id from public.projects where title = 'Phase C project'),
    'Member guard role', '', null, 2, '{}'::uuid[], '{}'::text[], '{}'::integer[]
  )$$,
  'owner creates an open role for existing-member checks'
);
select ok(
  public._phase_c_throws($$select public.create_project_invitation(
    (select id from public.project_roles where title = 'Member guard role'),
    '92000000-0000-4000-8000-000000000003', '', null
  )$$),
  'existing project member cannot be invited to an open role'
);

reset role;
set local request.jwt.claim.sub = '92000000-0000-4000-8000-000000000003';
set local role authenticated;
select ok(
  public._phase_c_throws($$select public.create_project_application((select id from public.project_roles where title = 'Member guard role'), '')$$),
  'existing project member cannot apply to an open project role'
);

reset role;
set local request.jwt.claim.sub = '92000000-0000-4000-8000-000000000001';
set local role authenticated;
select lives_ok(
  $$select public.create_project_role(
    (select id from public.projects where title = 'Phase C project'),
    'Closed role', '', null, 1, '{}'::uuid[], '{}'::text[], '{}'::integer[]
  )$$,
  'owner creates role to close'
);
select lives_ok(
  $$select public.close_project_role((select id from public.project_roles where title = 'Closed role'))$$,
  'owner closes role through explicit action'
);
select is((select status from public.project_roles where title = 'Closed role'), 'closed', 'close action persisted');

reset role;
set local request.jwt.claim.sub = '92000000-0000-4000-8000-000000000004';
set local role authenticated;
select ok(
  public._phase_c_throws($$select public.create_project_application((select id from public.project_roles where title = 'Closed role'), '')$$),
  'closed role rejects applications'
);

reset role;
set local request.jwt.claim.sub = '92000000-0000-4000-8000-000000000001';
set local role authenticated;
select ok(
  public._phase_c_throws($$select public.create_project_invitation((select id from public.project_roles where title = 'Closed role'), '92000000-0000-4000-8000-000000000004', '', null)$$),
  'closed role rejects invitations'
);

reset role;
select ok(
  public._phase_c_throws($$insert into public.project_members (project_id, user_id, role_id)
    values (
      (select id from public.projects where title = 'Phase C project'),
      '92000000-0000-4000-8000-000000000001',
      (select id from public.project_roles where title = 'Closed role')
    )$$),
  'project owner/member duplication is impossible even for privileged code'
);

select * from finish();
rollback;
