begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(35);

select has_table('public', 'product_events', 'analytics reuses the first-party product event store');
select has_column('public', 'product_events', 'session_id', 'events support a low-risk session identifier');
select has_column('public', 'product_events', 'source', 'events record their trusted source');
select has_index('public', 'product_events', 'product_events_created_idx', 'global time-series index exists');
select has_index('public', 'product_events', 'product_events_session_created_idx', 'session time-series index exists');
select ok((select relrowsecurity from pg_class where oid = 'public.product_events'::regclass), 'event RLS remains enabled');

select ok(has_table_privilege('service_role', 'public.product_events', 'SELECT,INSERT'), 'service role can append and aggregate events');
select ok(not has_table_privilege('service_role', 'public.product_events', 'UPDATE,DELETE'), 'service role cannot mutate or delete events');
select ok(not has_table_privilege('anon', 'public.product_events', 'SELECT,INSERT,UPDATE,DELETE'), 'anon has no event access');
select ok(not has_table_privilege('authenticated', 'public.product_events', 'SELECT,INSERT,UPDATE,DELETE'), 'authenticated has no direct event access');

select ok(not has_function_privilege('public', 'public.record_profile_signup_analytics()'::regprocedure, 'EXECUTE'), 'PUBLIC cannot invoke signup analytics');
select ok(not has_function_privilege('anon', 'public.record_profile_signup_analytics()'::regprocedure, 'EXECUTE'), 'anon cannot invoke signup analytics');
select ok(not has_function_privilege('authenticated', 'public.record_profile_signup_analytics()'::regprocedure, 'EXECUTE'), 'authenticated cannot invoke signup analytics');
select ok(not has_function_privilege('service_role', 'public.record_profile_signup_analytics()'::regprocedure, 'EXECUTE'), 'service role cannot invoke signup analytics directly');
select ok(not has_function_privilege('public', 'public.record_first_meaningful_action_analytics()'::regprocedure, 'EXECUTE'), 'PUBLIC cannot invoke activation analytics');
select ok(not has_function_privilege('service_role', 'public.record_first_meaningful_action_analytics()'::regprocedure, 'EXECUTE'), 'service role cannot invoke activation analytics directly');

select has_view('public', 'analytics_core_metrics', 'core metrics view exists');
select has_view('public', 'analytics_retention_cohorts', 'retention cohort view exists');
select has_view('public', 'analytics_active_users_week', 'weekly active-user view exists');
select ok(has_table_privilege('service_role', 'public.analytics_core_metrics', 'SELECT'), 'service role can read aggregate metrics');
select ok(has_table_privilege('service_role', 'public.analytics_retention_cohorts', 'SELECT'), 'service role can read retention metrics');
select ok(has_table_privilege('service_role', 'public.analytics_active_users_week', 'SELECT'), 'service role can read weekly active IDs');
select ok(not has_table_privilege('anon', 'public.analytics_core_metrics', 'SELECT'), 'anon cannot read analytics views');
select ok(not has_table_privilege('authenticated', 'public.analytics_core_metrics', 'SELECT'), 'authenticated cannot read analytics views');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  'e1000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'analytics-user@example.test', '', '2026-01-01 00:00:00+00',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"username":"analytics_user"}'::jsonb,
  '2026-01-01 00:00:00+00', '2026-01-01 00:00:00+00'
);

select is((select count(*)::integer from public.product_events where user_id = 'e1000000-0000-4000-8000-000000000001' and event_name = 'signup_completed'), 1, 'profile creation records signup once');
select is((select source from public.product_events where user_id = 'e1000000-0000-4000-8000-000000000001' and event_name = 'signup_completed'), 'database', 'signup source is database authoritative');

-- Pin the authoritative signup event to a stable historical cohort date. The
-- normal profile trigger correctly uses its server-side creation timestamp.
update public.product_events
set created_at = '2026-01-01 00:00:00+00'
where user_id = 'e1000000-0000-4000-8000-000000000001'
  and event_name = 'signup_completed';

insert into public.product_events (user_id, event_name, metadata, dedupe_key, created_at)
values ('e1000000-0000-4000-8000-000000000001', 'ai_message_sent', '{"module":"tutor"}', 'assistant-1', '2026-01-02 08:00:00+00');

select is((select count(*)::integer from public.product_events where user_id = 'e1000000-0000-4000-8000-000000000001' and event_name = 'first_meaningful_action'), 1, 'first meaningful action activates once');
select is((select metadata ->> 'trigger_event' from public.product_events where user_id = 'e1000000-0000-4000-8000-000000000001' and event_name = 'first_meaningful_action'), 'ai_message_sent', 'activation records only the triggering event name');

insert into public.product_events (user_id, event_name, metadata, dedupe_key, created_at)
values ('e1000000-0000-4000-8000-000000000001', 'quest_completed', '{"quest_id":"fixture"}', 'quest-1', '2026-01-03 08:00:00+00');

insert into public.product_events (user_id, event_name, metadata, dedupe_key, created_at)
values ('e1000000-0000-4000-8000-000000000001', 'quest_completed', '{"quest_id":"fixture"}', 'quest-1', '2026-01-03 08:00:00+00')
on conflict (user_id, event_name, dedupe_key) do nothing;

select is((select count(*)::integer from public.product_events where user_id = 'e1000000-0000-4000-8000-000000000001' and event_name = 'first_meaningful_action'), 1, 'later meaningful actions cannot duplicate activation');
select is((select count(*)::integer from public.product_events where user_id = 'e1000000-0000-4000-8000-000000000001' and event_name = 'quest_completed' and dedupe_key = 'quest-1'), 1, 'action idempotency prevents duplicate events');
select is((select retained_d1::integer from public.analytics_retention_cohorts where signup_day = '2026-01-01'), 1, 'D1 retention uses UTC signup and meaningful-action days');
select is((select activated_users::integer from public.analytics_core_metrics), 1, 'aggregate metrics count the activated user');
select is((select count(*)::integer from public.analytics_active_users_week where user_id = 'e1000000-0000-4000-8000-000000000001'), 0, 'fixed historical fixtures do not appear as active this week');

select throws_ok(
  $$insert into public.product_events (user_id, event_name, metadata, dedupe_key) values ('e1000000-0000-4000-8000-000000000001', 'made_up_event', '{}', 'bad')$$,
  '23514',
  null,
  'unknown event names are rejected by the database'
);
select throws_ok(
  $$insert into public.product_events (user_id, event_name, metadata, dedupe_key) values ('e1000000-0000-4000-8000-000000000001', 'ai_message_sent', '{"prompt":"private"}', 'bad-metadata')$$,
  '23514',
  null,
  'sensitive top-level metadata keys remain rejected'
);

select * from finish();
rollback;
