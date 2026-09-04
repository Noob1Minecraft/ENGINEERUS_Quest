-- First-party product analytics extends the existing content-free event store.
-- product_events is already part of gamification, so retaining it avoids a
-- second source of truth while preserving all existing XP/quest behavior.
alter table public.product_events
  add column session_id uuid null,
  add column source text not null default 'backend'
    check (source in ('backend', 'database'));

alter table public.product_events
  drop constraint product_events_event_name_check;

alter table public.product_events
  add constraint product_events_event_name_check check (event_name in (
    -- Canonical analytics taxonomy.
    'signup_completed', 'login_completed', 'onboarding_completed',
    'first_meaningful_action', 'ai_message_sent', 'quest_completed',
    'learning_resource_opened', 'project_created',
    'project_application_submitted', 'project_invitation_accepted',
    'engimatch_viewed', 'engimatch_action_taken', 'document_uploaded',
    'image_uploaded', 'direct_chat_started', 'invite_link_created',
    'invite_link_opened', 'invited_user_registered',
    -- Existing operational/gamification events retained for compatibility.
    'onboarding_started', 'ai_session_started', 'project_applied',
    'direct_chat_opened', 'direct_message_sent', 'feedback_submitted',
    'daily_quest_completed', 'weekly_quest_completed',
    'achievement_unlocked', 'level_up', 'quest_chain_completed'
  ));

create index product_events_created_idx
  on public.product_events (created_at desc);
create index product_events_session_created_idx
  on public.product_events (session_id, created_at desc)
  where session_id is not null;

-- Browser roles keep no direct analytics surface. The trusted backend derives
-- user_id from the verified JWT and supplies only allowlisted metadata.
revoke all on table public.product_events
  from public, anon, authenticated;
grant select, insert on table public.product_events to service_role;

create function public.record_profile_signup_analytics()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.product_events (
    user_id, event_name, metadata, dedupe_key, source, created_at
  ) values (
    new.id, 'signup_completed', '{}'::jsonb, 'signup', 'database', new.created_at
  )
  on conflict (user_id, event_name, dedupe_key) do nothing;
  return new;
end;
$$;

revoke all on function public.record_profile_signup_analytics()
  from public, anon, authenticated, service_role;

create trigger on_profile_created_analytics_signup
after insert on public.profiles
for each row execute function public.record_profile_signup_analytics();

-- Populate a signup baseline for existing accounts without collecting any new
-- identity attributes.
insert into public.product_events (
  user_id, event_name, metadata, dedupe_key, source, created_at
)
select id, 'signup_completed', '{}'::jsonb, 'signup', 'database', created_at
from public.profiles
on conflict (user_id, event_name, dedupe_key) do nothing;

create function public.record_first_meaningful_action_analytics()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.event_name in (
    'ai_message_sent', 'quest_completed', 'project_created',
    'project_application_submitted', 'project_applied',
    'project_invitation_accepted', 'engimatch_action_taken',
    'document_uploaded', 'image_uploaded', 'direct_chat_started'
  ) then
    insert into public.product_events (
      user_id, event_name, metadata, dedupe_key, session_id, source, created_at
    ) values (
      new.user_id,
      'first_meaningful_action',
      jsonb_build_object('trigger_event', new.event_name),
      'activation',
      new.session_id,
      'database',
      new.created_at
    )
    on conflict (user_id, event_name, dedupe_key) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.record_first_meaningful_action_analytics()
  from public, anon, authenticated, service_role;

create trigger on_product_event_analytics_activation
after insert on public.product_events
for each row execute function public.record_first_meaningful_action_analytics();

-- Backfill activation from already-recorded meaningful events. A user gets at
-- most one activation row and the earliest qualifying timestamp is retained.
insert into public.product_events (
  user_id, event_name, metadata, dedupe_key, source, created_at
)
select distinct on (user_id)
  user_id,
  'first_meaningful_action',
  jsonb_build_object('trigger_event', event_name),
  'activation',
  'database',
  created_at
from public.product_events
where event_name in (
  'ai_message_sent', 'quest_completed', 'project_created', 'project_applied'
)
order by user_id, created_at asc, id asc
on conflict (user_id, event_name, dedupe_key) do nothing;

-- UTC is the reporting calendar. Page views are intentionally excluded from
-- active-user and retention calculations.
create view public.analytics_core_metrics
with (security_invoker = true)
as
with meaningful as (
  select user_id, event_name, created_at
  from public.product_events
  where event_name in (
    'ai_message_sent', 'quest_completed', 'project_created',
    'project_application_submitted', 'project_applied',
    'project_invitation_accepted', 'engimatch_action_taken',
    'document_uploaded', 'image_uploaded', 'direct_chat_started'
  )
)
select
  count(distinct user_id) filter (where event_name = 'signup_completed') as total_signups,
  count(distinct user_id) filter (where event_name = 'first_meaningful_action') as activated_users,
  round(
    100.0 * count(distinct user_id) filter (where event_name = 'first_meaningful_action')
    / nullif(count(distinct user_id) filter (where event_name = 'signup_completed'), 0),
    2
  ) as activation_rate_percent,
  (select count(distinct user_id) from meaningful
    where created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC') as dau,
  (select count(distinct user_id) from meaningful
    where created_at >= now() - interval '7 days') as wau,
  (select count(distinct user_id) from meaningful
    where created_at >= now() - interval '30 days') as mau,
  count(distinct user_id) filter (where event_name = 'ai_message_sent') as ai_tutor_users,
  count(distinct user_id) filter (where event_name = 'project_created') as project_users,
  count(distinct user_id) filter (where event_name in ('engimatch_viewed', 'engimatch_action_taken')) as engimatch_users,
  count(distinct user_id) filter (where event_name = 'quest_completed') as quest_users,
  count(distinct user_id) filter (where event_name = 'document_uploaded') as document_users,
  count(distinct user_id) filter (where event_name = 'direct_chat_started') as direct_chat_users
from public.product_events;

create view public.analytics_retention_cohorts
with (security_invoker = true)
as
with signups as (
  select user_id, min((created_at at time zone 'UTC')::date) as signup_day
  from public.product_events
  where event_name = 'signup_completed'
  group by user_id
), meaningful_days as (
  select distinct user_id, (created_at at time zone 'UTC')::date as active_day
  from public.product_events
  where event_name in (
    'ai_message_sent', 'quest_completed', 'project_created',
    'project_application_submitted', 'project_applied',
    'project_invitation_accepted', 'engimatch_action_taken',
    'document_uploaded', 'image_uploaded', 'direct_chat_started'
  )
)
select
  signup_day,
  count(*) as signups,
  count(*) filter (where exists (
    select 1 from meaningful_days m
    where m.user_id = s.user_id and m.active_day = s.signup_day + 1
  )) as retained_d1,
  count(*) filter (where exists (
    select 1 from meaningful_days m
    where m.user_id = s.user_id and m.active_day = s.signup_day + 7
  )) as retained_d7,
  count(*) filter (where exists (
    select 1 from meaningful_days m
    where m.user_id = s.user_id and m.active_day = s.signup_day + 30
  )) as retained_d30
from signups s
group by signup_day;

create view public.analytics_active_users_week
with (security_invoker = true)
as
select user_id, max(created_at) as last_active_at
from public.product_events
where event_name in (
  'ai_message_sent', 'quest_completed', 'project_created',
  'project_application_submitted', 'project_applied',
  'project_invitation_accepted', 'engimatch_action_taken',
  'document_uploaded', 'image_uploaded', 'direct_chat_started'
)
and created_at >= now() - interval '7 days'
group by user_id;

revoke all on table public.analytics_core_metrics,
  public.analytics_retention_cohorts,
  public.analytics_active_users_week
  from public, anon, authenticated, service_role;
grant select on table public.analytics_core_metrics,
  public.analytics_retention_cohorts,
  public.analytics_active_users_week
  to service_role;

comment on table public.product_events is
  'First-party, content-free product analytics. No prompts, responses, chat content, document/image content, tokens, raw IP addresses, or user-agent strings.';
comment on view public.analytics_core_metrics is
  'Service-role-only aggregate acquisition, activation, active-user, and feature-adoption metrics.';
comment on view public.analytics_retention_cohorts is
  'Service-role-only signup-cohort D1/D7/D30 retention using UTC calendar days and meaningful actions only.';
comment on view public.analytics_active_users_week is
  'Service-role-only weekly active profile IDs and last meaningful activity timestamp.';
