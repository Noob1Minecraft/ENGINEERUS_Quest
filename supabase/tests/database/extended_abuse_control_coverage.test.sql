begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(16);

select is(
  (select count(*)::integer from pg_constraint
   where conrelid = 'public.abuse_rate_limit_windows'::regclass
     and conname = 'abuse_rate_limit_windows_operation_check'),
  1,
  'authoritative operation constraint remains singular'
);
select ok(
  pg_get_constraintdef((select oid from pg_constraint
    where conrelid = 'public.abuse_rate_limit_windows'::regclass
      and conname = 'abuse_rate_limit_windows_operation_check')) like '%engimatch%',
  'constraint allows the added authoritative operations'
);
select ok(has_function_privilege('service_role', 'public.consume_abuse_budget(uuid,text)', 'EXECUTE'), 'service role retains budget execution');
select ok(not has_function_privilege('authenticated', 'public.consume_abuse_budget(uuid,text)', 'EXECUTE'), 'authenticated cannot forge budget actor');
select ok(not has_function_privilege('anon', 'public.consume_abuse_budget(uuid,text)', 'EXECUTE'), 'anon cannot consume budget');
select ok(not has_function_privilege('public', 'public.consume_abuse_budget(uuid,text)', 'EXECUTE'), 'PUBLIC cannot consume budget');
select is(
  (select proconfig from pg_proc where oid = 'public.consume_abuse_budget(uuid,text)'::regprocedure),
  array['search_path=""']::text[],
  'budget function retains an explicit empty search_path'
);

set local role service_role;
select is((public.consume_abuse_budget('a6500000-0000-4000-8000-000000000001', 'engimatch')->>'limit')::integer, 30, 'EngiMatch has a shared limit');
select is((public.consume_abuse_budget('a6500000-0000-4000-8000-000000000002', 'document_upload')->>'limit')::integer, 10, 'document uploads have a shared limit');
select is((public.consume_abuse_budget('a6500000-0000-4000-8000-000000000003', 'image_upload')->>'limit')::integer, 10, 'image uploads have a shared limit');
select is((public.consume_abuse_budget('a6500000-0000-4000-8000-000000000004', 'beta_feedback')->>'limit')::integer, 10, 'feedback has a shared limit');
select is((public.consume_abuse_budget('a6500000-0000-4000-8000-000000000005', 'admin_mutation')->>'limit')::integer, 30, 'admin mutations have a shared limit');
select throws_ok(
  $$select public.consume_abuse_budget('a6500000-0000-4000-8000-000000000006', 'unknown_operation')$$,
  '22023', 'abuse_budget_operation_invalid',
  'unknown operations remain rejected'
);
reset role;

select is(
  (select count(*)::integer from public.abuse_rate_limit_windows
   where actor_id in (
    'a6500000-0000-4000-8000-000000000001',
    'a6500000-0000-4000-8000-000000000002',
    'a6500000-0000-4000-8000-000000000003',
    'a6500000-0000-4000-8000-000000000004',
    'a6500000-0000-4000-8000-000000000005'
   )),
  5,
  'each added operation persists only one minimal counter row'
);
select ok(not has_table_privilege('service_role', 'public.abuse_rate_limit_windows', 'SELECT'), 'service role receives no direct table access');
select ok(not has_table_privilege('authenticated', 'public.abuse_rate_limit_windows', 'SELECT'), 'authenticated receives no direct table access');

select * from finish();
rollback;
