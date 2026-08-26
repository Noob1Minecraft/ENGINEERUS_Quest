begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(25);

create or replace function public._security_definer_call_sqlstate(statement text)
returns text
language plpgsql
as $$
begin
  execute statement;
  return null;
exception when others then
  return sqlstate;
end;
$$;

create temporary table expected_security_definers (
  function_oid oid primary key,
  classification text not null check (
    classification in ('TRIGGER_ONLY', 'AUTH_RPC', 'SERVICE_INTERNAL', 'INTERNAL_HELPER')
  )
) on commit drop;

insert into expected_security_definers (function_oid, classification)
values
  ('public.handle_new_auth_user()'::regprocedure, 'TRIGGER_ONLY'),
  ('public.handle_new_user_progress()'::regprocedure, 'TRIGGER_ONLY'),
  ('public.guard_project_member()'::regprocedure, 'TRIGGER_ONLY'),
  ('public.record_daily_activity()'::regprocedure, 'AUTH_RPC'),
  ('public.create_project_role(uuid,text,text,uuid,integer,uuid[],text[],integer[])'::regprocedure, 'AUTH_RPC'),
  ('public.update_project_role(uuid,text,text,uuid,boolean,integer,text,uuid[],text[],integer[])'::regprocedure, 'AUTH_RPC'),
  ('public.close_project_role(uuid)'::regprocedure, 'AUTH_RPC'),
  ('public.create_project_application(uuid,text)'::regprocedure, 'AUTH_RPC'),
  ('public.create_project_invitation(uuid,uuid,text,timestamptz)'::regprocedure, 'AUTH_RPC'),
  ('public.accept_project_application(uuid)'::regprocedure, 'AUTH_RPC'),
  ('public.accept_project_invitation(uuid)'::regprocedure, 'AUTH_RPC'),
  ('public.reject_project_application(uuid)'::regprocedure, 'AUTH_RPC'),
  ('public.withdraw_project_application(uuid)'::regprocedure, 'AUTH_RPC'),
  ('public.reject_project_invitation(uuid)'::regprocedure, 'AUTH_RPC'),
  ('public.cancel_project_invitation(uuid)'::regprocedure, 'AUTH_RPC'),
  ('public.get_or_create_direct_conversation(uuid,uuid)'::regprocedure, 'AUTH_RPC'),
  ('public.send_direct_message(uuid,uuid,text)'::regprocedure, 'AUTH_RPC'),
  ('public.list_direct_messages(uuid,integer,timestamptz,uuid)'::regprocedure, 'AUTH_RPC'),
  ('public.list_direct_conversations(integer,timestamptz,uuid)'::regprocedure, 'AUTH_RPC'),
  ('public.mark_direct_conversation_read(uuid)'::regprocedure, 'AUTH_RPC'),
  ('public.block_direct_chat_user(uuid)'::regprocedure, 'AUTH_RPC'),
  ('public.unblock_direct_chat_user(uuid)'::regprocedure, 'AUTH_RPC'),
  ('public.award_xp(uuid,integer,text,text,text,text,jsonb)'::regprocedure, 'SERVICE_INTERNAL'),
  ('public.record_user_progress(uuid,integer,integer,integer,text)'::regprocedure, 'SERVICE_INTERNAL'),
  ('public.begin_ai_exchange(uuid,uuid,text,text,text)'::regprocedure, 'SERVICE_INTERNAL'),
  ('public.complete_ai_exchange(uuid,uuid,text,text,text,integer)'::regprocedure, 'SERVICE_INTERNAL'),
  ('public.complete_quest(uuid,text,text)'::regprocedure, 'SERVICE_INTERNAL'),
  ('public.direct_chat_shared_project(uuid,uuid,uuid)'::regprocedure, 'INTERNAL_HELPER');

select is(
  (select count(*)::integer from expected_security_definers),
  28,
  'the SECURITY DEFINER classification inventory contains every application function'
);

select is(
  (
    select count(*)::integer
    from expected_security_definers
    where function_oid in (
      'public.handle_new_auth_user()'::regprocedure,
      'public.handle_new_user_progress()'::regprocedure
    )
      and classification = 'TRIGGER_ONLY'
  ),
  2,
  'the two bootstrap functions have exact trigger-only signatures'
);

select is(
  (
    select count(*)::integer
    from pg_proc function_record
    join pg_namespace function_schema on function_schema.oid = function_record.pronamespace
    where function_schema.nspname = 'public'
      and function_record.prosecdef
  ),
  28,
  'the public schema has no unclassified SECURITY DEFINER function'
);

select is(
  (
    select count(*)::integer
    from expected_security_definers expected
    join pg_proc function_record on function_record.oid = expected.function_oid
    where function_record.prosecdef
  ),
  28,
  'every classified function remains SECURITY DEFINER'
);

select is(
  (
    select count(*)::integer
    from expected_security_definers expected
    join pg_proc function_record on function_record.oid = expected.function_oid
    where function_record.proconfig @> array['search_path=""']::text[]
  ),
  28,
  'every classified SECURITY DEFINER function fixes search_path to empty'
);

select is(
  (
    select count(*)::integer
    from expected_security_definers expected
    join pg_proc function_record on function_record.oid = expected.function_oid
    where pg_get_userbyid(function_record.proowner) = 'postgres'
  ),
  28,
  'function ownership remains postgres'
);

select is(
  (select count(*)::integer from expected_security_definers where classification = 'TRIGGER_ONLY'),
  3,
  'three SECURITY DEFINER functions are trigger-only'
);

select is(
  (
    select count(*)::integer
    from expected_security_definers expected
    join pg_trigger trigger_record
      on trigger_record.tgfoid = expected.function_oid
     and not trigger_record.tgisinternal
     and trigger_record.tgenabled <> 'D'
    where expected.classification = 'TRIGGER_ONLY'
  ),
  3,
  'each trigger-only function is referenced by one enabled application trigger'
);

select ok(
  not exists (
    select 1
    from expected_security_definers expected
    where expected.classification = 'TRIGGER_ONLY'
      and has_function_privilege('public', expected.function_oid, 'EXECUTE')
  ),
  'PUBLIC cannot execute trigger-only SECURITY DEFINER functions'
);

select ok(
  not exists (
    select 1
    from expected_security_definers expected
    where expected.classification = 'TRIGGER_ONLY'
      and has_function_privilege('anon', expected.function_oid, 'EXECUTE')
  ),
  'anon cannot execute trigger-only SECURITY DEFINER functions'
);

select ok(
  not exists (
    select 1
    from expected_security_definers expected
    where expected.classification = 'TRIGGER_ONLY'
      and has_function_privilege('authenticated', expected.function_oid, 'EXECUTE')
  ),
  'authenticated cannot execute trigger-only SECURITY DEFINER functions'
);

select ok(
  not exists (
    select 1
    from expected_security_definers expected
    where expected.classification = 'TRIGGER_ONLY'
      and has_function_privilege('service_role', expected.function_oid, 'EXECUTE')
  ),
  'service_role has no inherited direct trigger-only execution path'
);

select ok(
  not exists (
    select 1
    from expected_security_definers expected
    where expected.classification = 'TRIGGER_ONLY'
      and not has_function_privilege('postgres', expected.function_oid, 'EXECUTE')
  ),
  'postgres ownership retains execution capability for trigger dispatch'
);

select ok(
  not exists (
    select 1
    from expected_security_definers expected
    where expected.classification = 'AUTH_RPC'
      and not has_function_privilege('authenticated', expected.function_oid, 'EXECUTE')
  ),
  'intentional authenticated RPC execution remains available'
);

select ok(
  not exists (
    select 1
    from expected_security_definers expected
    where expected.classification = 'AUTH_RPC'
      and (
        has_function_privilege('public', expected.function_oid, 'EXECUTE')
        or has_function_privilege('anon', expected.function_oid, 'EXECUTE')
      )
  ),
  'intentional authenticated RPCs remain unavailable to PUBLIC and anon'
);

select ok(
  not exists (
    select 1
    from expected_security_definers expected
    join pg_proc function_record on function_record.oid = expected.function_oid
    where expected.classification = 'AUTH_RPC'
      and position('auth.uid()' in pg_get_functiondef(function_record.oid)) = 0
  ),
  'every authenticated SECURITY DEFINER RPC derives its actor from auth.uid()'
);

select ok(
  not exists (
    select 1
    from expected_security_definers expected
    where expected.classification = 'SERVICE_INTERNAL'
      and (
        not has_function_privilege('service_role', expected.function_oid, 'EXECUTE')
        or has_function_privilege('public', expected.function_oid, 'EXECUTE')
        or has_function_privilege('anon', expected.function_oid, 'EXECUTE')
        or has_function_privilege('authenticated', expected.function_oid, 'EXECUTE')
      )
  ),
  'service-internal functions remain callable only by service_role and owner'
);

select ok(
  not has_function_privilege(
    'service_role',
    'public.direct_chat_shared_project(uuid,uuid,uuid)'::regprocedure,
    'EXECUTE'
  ),
  'the direct-chat internal helper remains non-callable by application roles'
);

set local role anon;
select is(
  public._security_definer_call_sqlstate('select public.handle_new_auth_user()'),
  '42501',
  'anon direct invocation of handle_new_auth_user is denied by ACL'
);
select is(
  public._security_definer_call_sqlstate('select public.handle_new_user_progress()'),
  '42501',
  'anon direct invocation of handle_new_user_progress is denied by ACL'
);
reset role;

set local request.jwt.claim.sub = 'f5000000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local role authenticated;
select is(
  public._security_definer_call_sqlstate('select public.handle_new_auth_user()'),
  '42501',
  'authenticated direct invocation of handle_new_auth_user is denied by ACL'
);
select is(
  public._security_definer_call_sqlstate('select public.handle_new_user_progress()'),
  '42501',
  'authenticated direct invocation of handle_new_user_progress is denied by ACL'
);
reset role;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  'f5000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'phase-f5@example.test', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"username":"phase_f5","display_name":"Phase F5"}'::jsonb,
  now(), now()
);

select is(
  (
    select count(*)::integer
    from public.profiles
    where id = 'f5000000-0000-4000-8000-000000000001'
  ),
  1,
  'auth-user insertion still dispatches the profile bootstrap trigger'
);

select is(
  (
    select count(*)::integer
    from public.user_progress
    where user_id = 'f5000000-0000-4000-8000-000000000001'
  ),
  1,
  'profile insertion still dispatches the progress bootstrap trigger'
);

select is(
  (
    select count(*)::integer
    from public.profile_private_settings
    where profile_id = 'f5000000-0000-4000-8000-000000000001'
  ),
  1,
  'existing authenticated signup bootstrap behavior remains intact'
);

select * from finish();
rollback;
