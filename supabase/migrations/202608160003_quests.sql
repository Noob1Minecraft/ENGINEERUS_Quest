create table public.quest_definitions (
  id text primary key,
  name jsonb not null,
  description jsonb not null,
  reward_label jsonb not null default '{}'::jsonb,
  criteria jsonb not null,
  xp_reward integer not null check (xp_reward > 0),
  repeat_policy text not null default 'once'
    check (repeat_policy in ('once', 'daily', 'weekly')),
  achievement_code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(name) = 'object'),
  check (jsonb_typeof(description) = 'object'),
  check (jsonb_typeof(criteria) = 'object')
);

create trigger quest_definitions_set_updated_at
before update on public.quest_definitions
for each row execute function public.set_updated_at();

create table public.user_quests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  quest_id text not null references public.quest_definitions (id),
  cycle_key text not null default 'once',
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed')),
  progress jsonb not null default '{}'::jsonb,
  xp_ledger_id uuid references public.xp_ledger (id),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, quest_id, cycle_key),
  check (
    (status = 'completed' and completed_at is not null)
    or (status = 'in_progress' and completed_at is null)
  )
);

create trigger user_quests_set_updated_at
before update on public.user_quests
for each row execute function public.set_updated_at();

create index user_quests_user_status
on public.user_quests (user_id, status, updated_at desc);
