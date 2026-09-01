-- A10: keep newly persisted avatar URLs within the browser image policy.
-- Existing unsafe values are cleared rather than exposed after this hardening.
update public.profiles
set avatar_url = null
where avatar_url is not null
  and avatar_url !~ '^https://[^[:space:]@/:?#]+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$';

alter table public.profiles
add constraint profiles_avatar_url_https
check (
  avatar_url is null
  or avatar_url ~ '^https://[^[:space:]@/:?#]+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'
);

-- A13: replace every relation set requested by the authenticated profile owner
-- in one database transaction. Null means "leave unchanged"; [] means "clear".
create function public.replace_my_profile_relations(
  p_skills jsonb,
  p_tools jsonb,
  p_interests jsonb,
  p_languages jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid := auth.uid();
  v_inserted integer;
begin
  if v_profile_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  perform 1
  from public.profiles
  where id = v_profile_id
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'The authenticated profile does not exist.';
  end if;

  if (p_skills is not null and jsonb_typeof(p_skills) <> 'array')
     or (p_tools is not null and jsonb_typeof(p_tools) <> 'array')
     or (p_interests is not null and jsonb_typeof(p_interests) <> 'array')
     or (p_languages is not null and jsonb_typeof(p_languages) <> 'array') then
    raise exception using errcode = '22023', message = 'Profile relation inputs must be arrays or null.';
  end if;

  if p_skills is not null then
    if jsonb_array_length(p_skills) <> (
      select count(distinct item ->> 'id') from jsonb_array_elements(p_skills) item
    ) then
      raise exception using errcode = '22023', message = 'Duplicate profile skill IDs are not allowed.';
    end if;
    delete from public.profile_skills where profile_id = v_profile_id;
    insert into public.profile_skills (profile_id, skill_id, proficiency)
    select v_profile_id, skill.id,
      case when item -> 'proficiency' = 'null'::jsonb then null else (item ->> 'proficiency')::smallint end
    from jsonb_array_elements(p_skills) item
    join public.skills skill
      on skill.id = (item ->> 'id')::uuid
     and skill.is_active = true;
    get diagnostics v_inserted = row_count;
    if v_inserted <> jsonb_array_length(p_skills) then
      raise exception using errcode = '23503', message = 'A selected profile skill is invalid.';
    end if;
  end if;

  if p_tools is not null then
    if jsonb_array_length(p_tools) <> (
      select count(distinct item ->> 'id') from jsonb_array_elements(p_tools) item
    ) then
      raise exception using errcode = '22023', message = 'Duplicate profile tool IDs are not allowed.';
    end if;
    delete from public.profile_tools where profile_id = v_profile_id;
    insert into public.profile_tools (profile_id, tool_id, proficiency)
    select v_profile_id, tool.id,
      case when item -> 'proficiency' = 'null'::jsonb then null else (item ->> 'proficiency')::smallint end
    from jsonb_array_elements(p_tools) item
    join public.tools tool
      on tool.id = (item ->> 'id')::uuid
     and tool.is_active = true;
    get diagnostics v_inserted = row_count;
    if v_inserted <> jsonb_array_length(p_tools) then
      raise exception using errcode = '23503', message = 'A selected profile tool is invalid.';
    end if;
  end if;

  if p_interests is not null then
    if jsonb_array_length(p_interests) <> (
      select count(distinct value) from jsonb_array_elements_text(p_interests)
    ) then
      raise exception using errcode = '22023', message = 'Duplicate profile interest IDs are not allowed.';
    end if;
    delete from public.profile_interests where profile_id = v_profile_id;
    insert into public.profile_interests (profile_id, interest_id)
    select v_profile_id, interest.id
    from jsonb_array_elements_text(p_interests) requested(id)
    join public.interests interest
      on interest.id = requested.id::uuid
     and interest.is_active = true;
    get diagnostics v_inserted = row_count;
    if v_inserted <> jsonb_array_length(p_interests) then
      raise exception using errcode = '23503', message = 'A selected profile interest is invalid.';
    end if;
  end if;

  if p_languages is not null then
    if jsonb_array_length(p_languages) <> (
      select count(distinct item ->> 'language_code') from jsonb_array_elements(p_languages) item
    ) then
      raise exception using errcode = '22023', message = 'Duplicate profile language codes are not allowed.';
    end if;
    delete from public.profile_languages where profile_id = v_profile_id;
    insert into public.profile_languages (profile_id, language_code, proficiency)
    select v_profile_id, item ->> 'language_code',
      case when item -> 'proficiency' = 'null'::jsonb then null else (item ->> 'proficiency')::smallint end
    from jsonb_array_elements(p_languages) item;
  end if;
end;
$$;

revoke all on function public.replace_my_profile_relations(jsonb, jsonb, jsonb, jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.replace_my_profile_relations(jsonb, jsonb, jsonb, jsonb)
to authenticated;

-- Relation writes now go through the single authenticated transaction above.
revoke insert, update, delete on table public.profile_skills from authenticated;
revoke insert, update, delete on table public.profile_tools from authenticated;
revoke insert, update, delete on table public.profile_interests from authenticated;
revoke insert, update, delete on table public.profile_languages from authenticated;
