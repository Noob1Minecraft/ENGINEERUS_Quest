-- Controlled-beta membership is operationally invite-controlled through
-- Supabase Auth. This table records the resulting cohort and first-run state;
-- university data remains in profiles and is not duplicated here.
create table public.beta_participants (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'paused', 'completed')),
  cohort text not null default 'controlled-beta-2026'
    check (char_length(cohort) between 1 and 80),
  source text null check (source is null or char_length(source) between 1 and 80),
  onboarding_started_at timestamptz null,
  onboarding_completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    onboarding_completed_at is null
    or onboarding_started_at is null
    or onboarding_completed_at >= onboarding_started_at
  )
);

create table public.beta_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  category text not null check (category in (
    'bug', 'confusing_ux', 'feature_request', 'ai_answer_quality',
    'project_engimatch', 'other'
  )),
  rating smallint not null check (rating between 1 and 5),
  product_area text not null check (product_area in (
    'onboarding', 'dashboard', 'profile', 'ai_tutor', 'quests',
    'projects', 'engimatch', 'messages', 'authentication', 'other'
  )),
  message text not null check (char_length(message) between 3 and 2000),
  created_at timestamptz not null default now()
);

create index beta_feedback_user_created_idx
on public.beta_feedback (user_id, created_at desc);

create table public.product_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_name text not null check (event_name in (
    'onboarding_started', 'onboarding_completed', 'ai_session_started',
    'ai_message_sent', 'quest_completed', 'project_created',
    'project_applied', 'engimatch_viewed', 'direct_chat_opened',
    'direct_message_sent', 'feedback_submitted'
  )),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object')
    check (pg_column_size(metadata) <= 2048)
    check (not metadata ?| array[
      'message', 'prompt', 'content', 'email', 'token', 'password',
      'authorization', 'notes', 'private_profile'
    ]),
  dedupe_key text not null check (char_length(dedupe_key) between 1 and 128),
  created_at timestamptz not null default now(),
  unique (user_id, event_name, dedupe_key)
);

create index product_events_user_created_idx
on public.product_events (user_id, created_at desc);
create index product_events_name_created_idx
on public.product_events (event_name, created_at desc);

alter table public.beta_participants enable row level security;
alter table public.beta_feedback enable row level security;
alter table public.product_events enable row level security;

-- Browser roles have no direct table surface. Authenticated requests go through
-- the Engineerus backend, which derives user_id from the verified JWT. The
-- service role receives only the CRUD needed for beta state and later metrics.
revoke all on table public.beta_participants from public, anon, authenticated, service_role;
revoke all on table public.beta_feedback from public, anon, authenticated, service_role;
revoke all on table public.product_events from public, anon, authenticated, service_role;

grant select, insert, update on table public.beta_participants to service_role;
grant select, insert on table public.beta_feedback to service_role;
grant select, insert on table public.product_events to service_role;

insert into public.beta_participants (user_id)
select id from public.profiles
on conflict (user_id) do nothing;

create function public.handle_new_beta_participant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.beta_participants (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_beta_participant()
from public, anon, authenticated, service_role;

create trigger on_profile_created_beta_participant
after insert on public.profiles
for each row execute function public.handle_new_beta_participant();

comment on table public.beta_participants is
  'Controlled-beta cohort and per-account onboarding state. Access is managed by the trusted backend.';
comment on table public.beta_feedback is
  'Authenticated controlled-beta feedback. Message content must not contain secrets or private conversation data.';
comment on table public.product_events is
  'First-party, content-free controlled-beta product events used for aggregate readiness metrics.';
