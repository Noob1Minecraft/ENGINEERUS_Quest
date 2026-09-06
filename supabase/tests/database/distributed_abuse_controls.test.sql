begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

select has_table('public', 'abuse_rate_limit_windows', 'authoritative rate-limit table exists');
select has_table('public', 'ai_capacity_leases', 'authoritative AI lease table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.abuse_rate_limit_windows'::regclass), 'rate-limit table has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.ai_capacity_leases'::regclass), 'AI lease table has RLS');

select ok(not has_table_privilege('anon', 'public.abuse_rate_limit_windows', 'SELECT'), 'anon cannot read rate-limit state');
select ok(not has_table_privilege('authenticated', 'public.abuse_rate_limit_windows', 'SELECT'), 'authenticated cannot read rate-limit state');
select ok(not has_table_privilege('service_role', 'public.abuse_rate_limit_windows', 'SELECT'), 'service role has no direct rate-limit table access');
select ok(not has_table_privilege('anon', 'public.ai_capacity_leases', 'SELECT'), 'anon cannot read AI leases');
select ok(not has_table_privilege('authenticated', 'public.ai_capacity_leases', 'SELECT'), 'authenticated cannot read AI leases');
select ok(not has_table_privilege('service_role', 'public.ai_capacity_leases', 'SELECT'), 'service role has no direct AI lease table access');

select ok(has_function_privilege('service_role', 'public.consume_abuse_budget(uuid,text)', 'EXECUTE'), 'service role can consume server budget');
select ok(not has_function_privilege('authenticated', 'public.consume_abuse_budget(uuid,text)', 'EXECUTE'), 'authenticated cannot forge server budget actor');
select ok(not has_function_privilege('anon', 'public.consume_abuse_budget(uuid,text)', 'EXECUTE'), 'anon cannot consume server budget');
select ok(has_function_privilege('service_role', 'public.acquire_ai_capacity(uuid,uuid)', 'EXECUTE'), 'service role can acquire AI capacity');
select ok(has_function_privilege('service_role', 'public.release_ai_capacity(uuid,uuid)', 'EXECUTE'), 'service role can release AI capacity');
select ok(not has_function_privilege('authenticated', 'public.acquire_ai_capacity(uuid,uuid)', 'EXECUTE'), 'authenticated cannot forge AI capacity actor');
select ok(not has_function_privilege('authenticated', 'public.enforce_authenticated_abuse_budget()', 'EXECUTE'), 'trigger helper is not directly callable');

select matches(
  pg_get_triggerdef((
    select oid from pg_trigger
    where tgname = 'project_application_transition_abuse_budget' and not tgisinternal
  )),
  'AFTER UPDATE.*REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows',
  'application transition budget inspects after-update transition tables'
);
select matches(
  pg_get_triggerdef((
    select oid from pg_trigger
    where tgname = 'project_invitation_transition_abuse_budget' and not tgisinternal
  )),
  'AFTER UPDATE.*REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows',
  'invitation transition budget inspects after-update transition tables'
);
select ok(
  pg_get_functiondef('public.enforce_authenticated_abuse_budget()'::regprocedure)
    like '%old_row.status is distinct from new_row.status%',
  'transition budgeting is limited to actual business status changes'
);
select ok(not has_table_privilege('authenticated', 'public.project_applications', 'UPDATE'), 'authenticated cannot directly update applications');
select ok(not has_table_privilege('authenticated', 'public.project_invitations', 'UPDATE'), 'authenticated cannot directly update invitations');

select is(
  (select count(*)::integer from pg_trigger where tgname in (
    'direct_conversation_create_abuse_budget', 'direct_message_send_abuse_budget',
    'project_application_create_abuse_budget', 'project_application_transition_abuse_budget',
    'project_invitation_create_abuse_budget', 'project_invitation_transition_abuse_budget'
  ) and not tgisinternal),
  6,
  'all critical direct mutation surfaces have database triggers'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', 'a6300000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'pack2b-owner@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a6300000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'pack2b-applicant@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a6300000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'pack2b-invitee@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a6300000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'pack2b-decision-actor@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.projects (id, owner_id, title, status, visibility)
values ('a6310000-0000-4000-8000-000000000001', 'a6300000-0000-4000-8000-000000000001', 'Pack 2B trigger fixture', 'open', 'authenticated');

insert into public.project_roles (id, project_id, title, positions_total, status)
values
  ('a6320000-0000-4000-8000-000000000001', 'a6310000-0000-4000-8000-000000000001', 'Application fixture', 2, 'open'),
  ('a6320000-0000-4000-8000-000000000002', 'a6310000-0000-4000-8000-000000000001', 'Invitation fixture', 2, 'open');

set local request.jwt.claim.sub = 'a6300000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';
insert into public.project_applications (
  id, project_id, role_id, applicant_id, status, decided_at, decided_by
) values (
  'a6330000-0000-4000-8000-000000000001', 'a6310000-0000-4000-8000-000000000001',
  'a6320000-0000-4000-8000-000000000001', 'a6300000-0000-4000-8000-000000000002',
  'pending', null, null
), (
  'a6330000-0000-4000-8000-000000000002', 'a6310000-0000-4000-8000-000000000001',
  'a6320000-0000-4000-8000-000000000001', 'a6300000-0000-4000-8000-000000000003',
  'rejected', now(), 'a6300000-0000-4000-8000-000000000004'
);

insert into public.project_invitations (
  id, project_id, role_id, invitee_id, inviter_id, status, expires_at, decided_at, decided_by
) values (
  'a6340000-0000-4000-8000-000000000001', 'a6310000-0000-4000-8000-000000000001',
  'a6320000-0000-4000-8000-000000000002', 'a6300000-0000-4000-8000-000000000003',
  'a6300000-0000-4000-8000-000000000001', 'pending', now() + interval '1 day', null, null
), (
  'a6340000-0000-4000-8000-000000000002', 'a6310000-0000-4000-8000-000000000001',
  'a6320000-0000-4000-8000-000000000002', 'a6300000-0000-4000-8000-000000000002',
  'a6300000-0000-4000-8000-000000000001', 'rejected', now() + interval '1 day', now(),
  'a6300000-0000-4000-8000-000000000004'
);
set local request.jwt.claim.sub = '';
set local request.jwt.claim.role = '';

select lives_ok(
  $$update public.project_applications set decided_by = null where id = 'a6330000-0000-4000-8000-00000000ffff'$$,
  'zero-row application update does not demand an authenticated actor'
);
select lives_ok(
  $$update public.project_invitations set decided_by = null where id = 'a6340000-0000-4000-8000-00000000ffff'$$,
  'zero-row invitation update does not demand an authenticated actor'
);
select is(
  (select count(*)::integer from public.abuse_rate_limit_windows where actor_id = 'a6300000-0000-4000-8000-000000000004'),
  0,
  'zero-row and fixture maintenance creates no abuse counter'
);

select throws_ok(
  $$update public.project_applications set status = 'withdrawn' where id = 'a6330000-0000-4000-8000-000000000001'$$,
  '42501', 'authentication_required',
  'NULL-auth application business transition is not a bypass'
);
select is(
  (select status from public.project_applications where id = 'a6330000-0000-4000-8000-000000000001'),
  'pending',
  'rejected NULL-auth transition is rolled back'
);
select is(
  (select count(*)::integer from public.abuse_rate_limit_windows where operation = 'project_application_transition'),
  0,
  'rejected NULL-auth transition creates no budget state'
);

set local request.jwt.claim.sub = 'a6300000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local role authenticated;
select lives_ok(
  $$select public.reject_project_application('a6330000-0000-4000-8000-000000000001')$$,
  'authenticated application business transition remains allowed within budget'
);
reset role;
select is(
  (select request_count from public.abuse_rate_limit_windows
   where actor_id = 'a6300000-0000-4000-8000-000000000001'
     and operation = 'project_application_transition'),
  1,
  'authenticated application transition consumes one authoritative budget unit'
);

set local request.jwt.claim.sub = 'a6300000-0000-4000-8000-000000000003';
set local request.jwt.claim.role = 'authenticated';
set local role authenticated;
select lives_ok(
  $$select public.reject_project_invitation('a6340000-0000-4000-8000-000000000001')$$,
  'authenticated invitation business transition remains allowed within budget'
);
reset role;
select is(
  (select request_count from public.abuse_rate_limit_windows
   where actor_id = 'a6300000-0000-4000-8000-000000000003'
     and operation = 'project_invitation_transition'),
  1,
  'authenticated invitation transition consumes one authoritative budget unit'
);

select lives_ok(
  $$delete from auth.users where id = 'a6300000-0000-4000-8000-000000000004'$$,
  'auth-user deletion succeeds when FK cleanup clears decision metadata'
);
select is(
  (select decided_by from public.project_applications where id = 'a6330000-0000-4000-8000-000000000002'),
  null::uuid,
  'application decided_by FK cleanup succeeds'
);
select is(
  (select decided_by from public.project_invitations where id = 'a6340000-0000-4000-8000-000000000002'),
  null::uuid,
  'invitation decided_by FK cleanup succeeds'
);
select is(
  (select count(*)::integer from public.abuse_rate_limit_windows where actor_id = 'a6300000-0000-4000-8000-000000000004'),
  0,
  'FK cleanup does not consume the deleted actor abuse budget'
);
select is(
  (select count(*)::integer from public.abuse_rate_limit_windows
   where operation in ('project_application_transition', 'project_invitation_transition')),
  2,
  'FK cleanup does not add transition budget entries beyond user actions'
);

set local role service_role;
create temporary table budget_results (attempt integer, allowed boolean) on commit drop;
do $$
declare
  i integer;
  result jsonb;
begin
  for i in 1..21 loop
    result := public.consume_abuse_budget(
      'a6200000-0000-4000-8000-000000000001', 'ai_request'
    );
    insert into budget_results values (i, (result ->> 'allowed')::boolean);
  end loop;
end;
$$;
reset role;

select is((select count(*)::integer from budget_results where allowed), 20, 'AI fixed window permits exactly its atomic budget');
select is((select allowed from budget_results where attempt = 21), false, 'request over the shared budget is denied');
select is(
  (select request_count from public.abuse_rate_limit_windows
   where actor_id = 'a6200000-0000-4000-8000-000000000001' and operation = 'ai_request'),
  20,
  'denied attempts cannot increase the counter beyond its bound'
);

set local role service_role;
select ok(public.acquire_ai_capacity(
  'a6200000-0000-4000-8000-000000000011',
  'a6200000-0000-4000-8000-000000000101'
), 'first user acquires shared AI capacity');
select ok(not public.acquire_ai_capacity(
  'a6200000-0000-4000-8000-000000000011',
  'a6200000-0000-4000-8000-000000000102'
), 'same user cannot acquire concurrent AI capacity');
select ok(public.acquire_ai_capacity(
  'a6200000-0000-4000-8000-000000000012',
  'a6200000-0000-4000-8000-000000000103'
), 'second user acquires shared global capacity');
do $$
declare
  i integer;
begin
  for i in 13..18 loop
    perform public.acquire_ai_capacity(
      ('a6200000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
      ('a6200000-0000-4000-9000-' || lpad(i::text, 12, '0'))::uuid
    );
  end loop;
end;
$$;
select ok(not public.acquire_ai_capacity(
  'a6200000-0000-4000-8000-000000000019',
  'a6200000-0000-4000-9000-000000000019'
), 'ninth concurrent lease is rejected by the global bound');
select ok(public.release_ai_capacity(
  'a6200000-0000-4000-8000-000000000011',
  'a6200000-0000-4000-8000-000000000101'
), 'lease release is actor-and-lease scoped');
select ok(not public.release_ai_capacity(
  'a6200000-0000-4000-8000-000000000011',
  'a6200000-0000-4000-8000-000000000101'
), 'lease release is idempotent');
reset role;

select * from finish();
rollback;
