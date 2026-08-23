alter table public.user_progress
add column longest_streak integer not null default 0 check (longest_streak >= 0);

update public.user_progress
set longest_streak = greatest(longest_streak, streak_days);

-- Daily activity owns last_activity_date. AI/module progress must not move the
-- calendar marker or create a second streak update path.
create or replace function public.record_user_progress(
  p_user_id uuid,
  p_requests integer default 0,
  p_material integer default 0,
  p_patent integer default 0,
  p_module text default null
)
returns public.user_progress
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_progress public.user_progress;
begin
  if p_requests < 0 or p_material < 0 or p_patent < 0 then
    raise exception 'Progress increments cannot be negative';
  end if;

  insert into public.user_progress (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  update public.user_progress
  set requests_count = requests_count + p_requests,
      material_count = material_count + p_material,
      patent_count = patent_count + p_patent,
      modules_used = case
        when p_module is null or p_module = any(modules_used) then modules_used
        else array_append(modules_used, p_module)
      end
  where user_id = p_user_id
  returning * into v_progress;

  return v_progress;
end;
$$;

create or replace function public.record_daily_activity()
returns table (
  current_streak integer,
  longest_streak integer,
  last_active_date date
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_active_date date := (statement_timestamp() at time zone 'Asia/Almaty')::date;
  v_previous_date date;
  v_current_streak integer;
  v_longest_streak integer;
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required.';
  end if;

  insert into public.user_progress (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  select progress.last_activity_date, progress.streak_days, progress.longest_streak
  into v_previous_date, v_current_streak, v_longest_streak
  from public.user_progress as progress
  where progress.user_id = v_user_id
  for update;

  if v_previous_date is null then
    v_current_streak := 1;
  elsif v_previous_date = v_active_date then
    null;
  elsif v_previous_date = v_active_date - 1 then
    v_current_streak := v_current_streak + 1;
  elsif v_previous_date < v_active_date - 1 then
    v_current_streak := 1;
  else
    -- Preserve the stored state if a future date exists because of prior clock data.
    v_active_date := v_previous_date;
  end if;

  v_longest_streak := greatest(v_longest_streak, v_current_streak);

  update public.user_progress as progress
  set streak_days = v_current_streak,
      longest_streak = v_longest_streak,
      last_activity_date = v_active_date
  where progress.user_id = v_user_id;

  return query
  select v_current_streak, v_longest_streak, v_active_date;
end;
$$;

comment on function public.record_daily_activity() is
'Records one authenticated Engineerus activity day using the Asia/Almaty calendar date. Row locking makes same-day and concurrent calls idempotent.';

revoke all on function public.record_daily_activity()
from public, anon, service_role;

grant execute on function public.record_daily_activity()
to authenticated;
