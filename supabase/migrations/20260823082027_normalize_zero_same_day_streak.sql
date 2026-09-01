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
    -- Legacy module activity could stamp today's date while leaving streak_days at zero.
    v_current_streak := greatest(v_current_streak, 1);
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
'Records one authenticated Engineerus activity day using the Asia/Almaty calendar date. Row locking makes same-day and concurrent calls idempotent, including legacy same-day zero state.';
