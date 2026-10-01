begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(11);

select has_function(
  'public',
  'complete_ai_exchange_without_reward',
  array['uuid', 'uuid', 'text', 'text', 'text'],
  'zero-reward AI response persistence RPC exists'
);
select ok(
  has_function_privilege('service_role', 'public.complete_ai_exchange_without_reward(uuid,uuid,text,text,text)', 'execute'),
  'service_role can persist a deterministic zero-reward response'
);
select ok(
  not has_function_privilege('authenticated', 'public.complete_ai_exchange_without_reward(uuid,uuid,text,text,text)', 'execute'),
  'authenticated clients cannot call the privileged persistence RPC directly'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  'ae000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'ai-redirect@example.test', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"username":"ai_redirect"}'::jsonb, now(), now()
);

insert into public.chat_sessions (id, user_id, title, module)
values (
  'ae000000-0000-4000-8000-000000000002',
  'ae000000-0000-4000-8000-000000000001',
  'Redirect persistence',
  'tutor'
);

set local role service_role;
select lives_ok(
  $$select public.begin_ai_exchange(
    'ae000000-0000-4000-8000-000000000001',
    'ae000000-0000-4000-8000-000000000002',
    'off-topic-request-1',
    'Write me a love poem',
    'tutor'
  )$$,
  'the canonical user message is persisted before refusal'
);
select lives_ok(
  $$select public.complete_ai_exchange_without_reward(
    'ae000000-0000-4000-8000-000000000001',
    'ae000000-0000-4000-8000-000000000002',
    'off-topic-request-1',
    'Engineering-only redirect',
    'tutor'
  )$$,
  'the localized refusal is persisted without reward'
);
select lives_ok(
  $$select public.complete_ai_exchange_without_reward(
    'ae000000-0000-4000-8000-000000000001',
    'ae000000-0000-4000-8000-000000000002',
    'off-topic-request-1',
    'Engineering-only redirect',
    'tutor'
  )$$,
  'replaying the same request is idempotent'
);
reset role;

select is(
  (select count(*)::integer from public.chat_messages where request_id = 'off-topic-request-1' and role = 'user'),
  1,
  'one user row is retained'
);
select is(
  (select count(*)::integer from public.chat_messages where request_id = 'off-topic-request-1' and role = 'assistant'),
  1,
  'one assistant refusal row is retained'
);
select is(
  (select xp_awarded from public.chat_messages where request_id = 'off-topic-request-1' and role = 'assistant'),
  0,
  'the refusal awards zero XP'
);
select is(
  (select requests_count from public.user_progress where user_id = 'ae000000-0000-4000-8000-000000000001'),
  0::bigint,
  'the refusal does not advance AI request progress'
);
select is(
  (select count(*)::integer from public.xp_ledger where user_id = 'ae000000-0000-4000-8000-000000000001'),
  0,
  'the refusal creates no XP ledger entry'
);

select * from finish();
rollback;
