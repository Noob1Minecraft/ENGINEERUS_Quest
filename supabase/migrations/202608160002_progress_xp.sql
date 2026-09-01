create table public.user_progress (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  total_xp bigint not null default 0 check (total_xp >= 0),
  level integer not null default 1 check (level >= 1),
  streak_days integer not null default 0 check (streak_days >= 0),
  last_activity_date date,
  requests_count bigint not null default 0 check (requests_count >= 0),
  material_count bigint not null default 0 check (material_count >= 0),
  patent_count bigint not null default 0 check (patent_count >= 0),
  modules_used text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger user_progress_set_updated_at
before update on public.user_progress
for each row execute function public.set_updated_at();

create table public.xp_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount integer not null check (amount <> 0),
  balance_after bigint not null check (balance_after >= 0),
  reason text not null check (char_length(reason) between 1 and 200),
  source_type text not null check (char_length(source_type) between 1 and 50),
  source_id text,
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index xp_ledger_user_idempotency_key
on public.xp_ledger (user_id, idempotency_key)
where idempotency_key is not null;

create index xp_ledger_user_created_at
on public.xp_ledger (user_id, created_at desc);

create or replace function public.handle_new_user_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_progress (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_profile_created_progress
after insert on public.profiles
for each row execute function public.handle_new_user_progress();

insert into public.user_progress (user_id)
select id from public.profiles
on conflict (user_id) do nothing;
