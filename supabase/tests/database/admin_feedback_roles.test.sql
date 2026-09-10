begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(49);

select has_table('public', 'admin_roles', 'admin role table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.admin_roles'::regclass), 'admin role RLS is enabled');
select policies_are('public', 'admin_roles', array[]::text[], 'admin roles have no direct browser policy');
select has_column('public', 'beta_feedback', 'admin_status', 'feedback has workflow status');
select has_column('public', 'beta_feedback', 'reviewed_at', 'feedback records review time');
select has_column('public', 'beta_feedback', 'reviewed_by', 'feedback records reviewing admin');

select ok(not has_table_privilege('anon', 'public.admin_roles', 'SELECT,INSERT,UPDATE,DELETE'), 'anon has no admin role table access');
select ok(not has_table_privilege('authenticated', 'public.admin_roles', 'SELECT,INSERT,UPDATE,DELETE'), 'authenticated has no admin role table access');
select ok(not has_table_privilege('service_role', 'public.admin_roles', 'SELECT,INSERT,UPDATE,DELETE'), 'service role has no admin role table access');
select ok(not has_table_privilege('authenticated', 'public.beta_feedback', 'SELECT,UPDATE,DELETE'), 'authenticated receives no feedback admin table access');
select ok(not has_table_privilege('service_role', 'public.beta_feedback', 'UPDATE,DELETE'), 'trusted submission service remains unable to change workflow state directly');

select function_privs_are('public', 'is_admin', array[]::text[], 'authenticated', array['EXECUTE'], 'authenticated may check only its own admin role');
select function_privs_are('public', 'admin_list_feedback', array['integer','timestamp with time zone','uuid'], 'authenticated', array['EXECUTE'], 'authenticated role may enter guarded feedback RPC');
select function_privs_are('public', 'admin_grant_role', array['uuid'], 'authenticated', array['EXECUTE'], 'authenticated role may enter guarded grant RPC');
select function_privs_are('public', 'admin_revoke_role', array['uuid'], 'authenticated', array['EXECUTE'], 'authenticated role may enter guarded revoke RPC');
select ok(not has_function_privilege('anon', 'public.is_admin()'::regprocedure, 'EXECUTE'), 'anon cannot check admin role');
select ok(not has_function_privilege('public', 'public.admin_list_feedback(integer,timestamptz,uuid)'::regprocedure, 'EXECUTE'), 'PUBLIC cannot list feedback');
select ok(not has_function_privilege('service_role', 'public.admin_grant_role(uuid)'::regprocedure, 'EXECUTE'), 'service role cannot grant admins');
select ok(not has_function_privilege('service_role', 'public.admin_revoke_role(uuid)'::regprocedure, 'EXECUTE'), 'service role cannot revoke admins');

select is((select proconfig from pg_proc where oid = 'public.is_admin()'::regprocedure), array['search_path=""']::text[], 'is_admin fixes search_path to empty');
select is((select proconfig from pg_proc where oid = 'public.admin_grant_role(uuid)'::regprocedure), array['search_path=""']::text[], 'grant RPC fixes search_path to empty');
select is((select proconfig from pg_proc where oid = 'public.admin_revoke_role(uuid)'::regprocedure), array['search_path=""']::text[], 'revoke RPC fixes search_path to empty');

create or replace function public._admin_test_error(statement text)
returns text language plpgsql as $$
begin execute statement; return null;
exception when others then return sqlstate || ':' || sqlerrm;
end;
$$;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000','ad000000-0000-4000-8000-000000000001','authenticated','authenticated','admin-a@example.test','',now(),'{}','{"username":"admin_a"}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','ad000000-0000-4000-8000-000000000002','authenticated','authenticated','normal-b@example.test','',now(),'{}','{"username":"normal_b"}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','ad000000-0000-4000-8000-000000000003','authenticated','authenticated','user-c@example.test','',now(),'{}','{"username":"user_c"}',now(),now());

update public.profiles set display_name = case id
  when 'ad000000-0000-4000-8000-000000000001' then 'Admin A'
  when 'ad000000-0000-4000-8000-000000000002' then 'Normal B'
  else 'User C' end
where id in ('ad000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000002','ad000000-0000-4000-8000-000000000003');

insert into public.admin_roles (user_id, role, granted_by)
values ('ad000000-0000-4000-8000-000000000001', 'admin', null);

insert into public.beta_feedback (id, user_id, category, rating, product_area, message)
values ('af000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000002','bug',4,'dashboard','Synthetic admin workflow feedback');

set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'ad000000-0000-4000-8000-000000000002';
set local role authenticated;

select is(public.is_admin(), false, 'normal user is not an admin');
select matches(public._admin_test_error('select * from public.admin_list_feedback(25,null,null)'), '^42501:admin_forbidden', 'normal user cannot read admin feedback');
select matches(public._admin_test_error($sql$select * from public.admin_update_feedback_status('af000000-0000-4000-8000-000000000001','resolved')$sql$), '^42501:admin_forbidden', 'normal user cannot update feedback status');
select matches(public._admin_test_error($sql$select * from public.admin_grant_role('ad000000-0000-4000-8000-000000000002')$sql$), '^42501:admin_forbidden', 'normal user cannot promote self');
select matches(public._admin_test_error($sql$select * from public.admin_grant_role('ad000000-0000-4000-8000-000000000003')$sql$), '^42501:admin_forbidden', 'normal user cannot promote another user');
select matches(public._admin_test_error($sql$select public.admin_revoke_role('ad000000-0000-4000-8000-000000000001')$sql$), '^42501:admin_forbidden', 'normal user cannot revoke an admin');
select matches(public._admin_test_error($sql$insert into public.admin_roles(user_id,role) values ('ad000000-0000-4000-8000-000000000002','admin')$sql$), '^42501:', 'direct authenticated admin role insert is denied');
select matches(public._admin_test_error('select * from public.beta_feedback'), '^42501:', 'normal user cannot directly read feedback');

reset role;
set local request.jwt.claim.sub = 'ad000000-0000-4000-8000-000000000001';
set local role authenticated;

select is(public.is_admin(), true, 'bootstrapped admin is recognized');
select is((select count(*)::integer from public.admin_list_feedback(25,null,null)), 1, 'admin can list feedback');
select is((select message from public.admin_get_feedback('af000000-0000-4000-8000-000000000001')), 'Synthetic admin workflow feedback', 'admin can read full feedback');
select is((select status from public.admin_update_feedback_status('af000000-0000-4000-8000-000000000001','reviewed')), 'reviewed', 'admin can update feedback status');
select is((select reviewed_by from public.admin_get_feedback('af000000-0000-4000-8000-000000000001')), 'ad000000-0000-4000-8000-000000000001'::uuid, 'reviewer identity comes from auth.uid');
select is((select count(*)::integer from public.admin_search_users('User C',20)), 1, 'admin can search existing users by safe profile data');
select is((select user_id from public.admin_grant_role('ad000000-0000-4000-8000-000000000003')), 'ad000000-0000-4000-8000-000000000003'::uuid, 'admin can grant another user');
select is((select count(*)::integer from public.admin_grant_role('ad000000-0000-4000-8000-000000000003')), 1, 'duplicate grant is idempotent');

reset role;
select is((select count(*)::integer from public.admin_roles), 2, 'duplicate grant creates only one admin row');
set local request.jwt.claim.sub = 'ad000000-0000-4000-8000-000000000003';
set local role authenticated;
select is(public.is_admin(), true, 'promoted user gains admin access immediately');
select is((select count(*)::integer from public.admin_list_admins()), 2, 'promoted user can list current admins');

reset role;
set local request.jwt.claim.sub = 'ad000000-0000-4000-8000-000000000001';
set local role authenticated;
select is(public.admin_revoke_role('ad000000-0000-4000-8000-000000000003'), true, 'admin can revoke another admin');
select matches(public._admin_test_error($sql$select * from public.admin_grant_role('ad000000-0000-4000-8000-ffffffffffff')$sql$), '^P0002:admin_target_not_found', 'nonexistent target is rejected');
select matches(public._admin_test_error($sql$select public.admin_revoke_role('ad000000-0000-4000-8000-000000000001')$sql$), '^P0001:last_admin_required', 'last remaining admin cannot be removed');

reset role;
set local request.jwt.claim.sub = 'ad000000-0000-4000-8000-000000000003';
set local role authenticated;
select is(public.is_admin(), false, 'revoked user loses admin role immediately');
select matches(public._admin_test_error('select * from public.admin_list_admins()'), '^42501:admin_forbidden', 'revoked user loses admin data access immediately');

reset role;
select is((select admin_status from public.beta_feedback where id = 'af000000-0000-4000-8000-000000000001'), 'reviewed', 'feedback status persists authoritatively');
select is((select count(*)::integer from pg_proc as function_record cross join lateral unnest(function_record.proargmodes) as mode where function_record.oid = 'public.admin_search_users(text,integer)'::regprocedure and mode = 't'), 5, 'admin user search has a five-field safe projection');
select ok(not exists (select 1 from pg_proc as function_record join pg_namespace as function_schema on function_schema.oid = function_record.pronamespace where function_schema.nspname = 'public' and function_record.proname like 'admin_%' and lower(pg_get_function_result(function_record.oid)) ~ '(email|phone|token|password|telegram|metadata)'), 'admin RPC projections expose no sensitive identity fields');

drop function public._admin_test_error(text);
select * from finish();
rollback;
