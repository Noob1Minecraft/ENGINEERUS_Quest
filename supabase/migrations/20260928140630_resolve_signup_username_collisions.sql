create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text := public.safe_profile_username(new.raw_user_meta_data, new.id);
  candidate_username text := requested_username;
  collision_attempt integer := 0;
begin
  loop
    insert into public.profiles (id, username, display_name, avatar_url)
    values (
      new.id,
      candidate_username,
      public.safe_profile_display_name(new.raw_user_meta_data, new.id),
      case
        when jsonb_typeof(coalesce(new.raw_user_meta_data, '{}'::jsonb)) = 'object'
         and jsonb_typeof(new.raw_user_meta_data -> 'avatar_url') = 'string'
        then nullif(left(btrim(new.raw_user_meta_data ->> 'avatar_url'), 2048), '')
        else null
      end
    )
    on conflict (lower(username)) where username is not null do nothing;

    if found then
      exit;
    end if;

    collision_attempt := collision_attempt + 1;
    candidate_username := case
      when collision_attempt = 1
        then 'engineer_' || replace(new.id::text, '-', '')
      else 'engineer_' || pg_catalog.md5(new.id::text || ':' || collision_attempt::text)
    end;
  end loop;

  return new;
end;
$$;
