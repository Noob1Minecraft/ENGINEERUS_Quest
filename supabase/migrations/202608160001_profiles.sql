create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text,
  display_name text,
  avatar_url text,
  preferred_lang text not null default 'ru'
    check (preferred_lang in ('ru', 'kk', 'en')),
  telegram_user_id bigint unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (username is null or char_length(username) between 2 and 50),
  check (display_name is null or char_length(display_name) between 1 and 100)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.safe_profile_username(
  metadata jsonb,
  user_id uuid
)
returns text
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  candidate text;
begin
  if jsonb_typeof(coalesce(metadata, '{}'::jsonb)) = 'object'
     and jsonb_typeof(metadata -> 'username') = 'string' then
    candidate := metadata ->> 'username';
  end if;

  candidate := btrim(
    regexp_replace(
      regexp_replace(left(coalesce(candidate, ''), 256), '[[:cntrl:]]+', ' ', 'g'),
      '[[:space:]]+',
      ' ',
      'g'
    )
  );
  candidate := left(candidate, 50);

  if char_length(candidate) < 2 then
    return 'engineer_' || right(replace(user_id::text, '-', ''), 12);
  end if;

  return candidate;
end;
$$;

create or replace function public.safe_profile_display_name(
  metadata jsonb,
  user_id uuid
)
returns text
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  candidate text;
begin
  if jsonb_typeof(coalesce(metadata, '{}'::jsonb)) = 'object' then
    if jsonb_typeof(metadata -> 'display_name') = 'string' then
      candidate := metadata ->> 'display_name';
    elsif jsonb_typeof(metadata -> 'full_name') = 'string' then
      candidate := metadata ->> 'full_name';
    end if;
  end if;

  candidate := btrim(
    regexp_replace(
      regexp_replace(left(coalesce(candidate, ''), 512), '[[:cntrl:]]+', ' ', 'g'),
      '[[:space:]]+',
      ' ',
      'g'
    )
  );
  candidate := left(candidate, 100);

  if char_length(candidate) < 1 then
    return public.safe_profile_username(metadata, user_id);
  end if;

  return candidate;
end;
$$;

revoke all on function public.safe_profile_username(jsonb, uuid)
from public, anon, authenticated;
revoke all on function public.safe_profile_display_name(jsonb, uuid)
from public, anon, authenticated;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    public.safe_profile_username(new.raw_user_meta_data, new.id),
    public.safe_profile_display_name(new.raw_user_meta_data, new.id),
    case
      when jsonb_typeof(coalesce(new.raw_user_meta_data, '{}'::jsonb)) = 'object'
       and jsonb_typeof(new.raw_user_meta_data -> 'avatar_url') = 'string'
      then nullif(left(btrim(new.raw_user_meta_data ->> 'avatar_url'), 2048), '')
      else null
    end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function public.handle_new_auth_user();

insert into public.profiles (id, username, display_name, avatar_url)
select
  users.id,
  public.safe_profile_username(users.raw_user_meta_data, users.id),
  public.safe_profile_display_name(users.raw_user_meta_data, users.id),
  case
    when jsonb_typeof(coalesce(users.raw_user_meta_data, '{}'::jsonb)) = 'object'
     and jsonb_typeof(users.raw_user_meta_data -> 'avatar_url') = 'string'
    then nullif(left(btrim(users.raw_user_meta_data ->> 'avatar_url'), 2048), '')
    else null
  end
from auth.users as users
on conflict (id) do nothing;
