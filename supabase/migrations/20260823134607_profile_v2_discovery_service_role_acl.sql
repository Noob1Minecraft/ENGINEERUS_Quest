-- Profile discovery is intentionally mediated by the Engineerus backend. The
-- service role bypasses RLS, but PostgREST still requires explicit object
-- privileges. Keep that privileged read surface aligned with PublicProfile:
-- no legacy Telegram identity, private settings, or Auth-schema data.

revoke select on table public.profiles from service_role;
revoke select on table public.engineering_disciplines from service_role;
revoke select on table public.skills from service_role;
revoke select on table public.tools from service_role;
revoke select on table public.interests from service_role;
revoke select on table public.profile_skills from service_role;
revoke select on table public.profile_tools from service_role;
revoke select on table public.profile_interests from service_role;
revoke select on table public.profile_languages from service_role;

-- Preserve the private-settings boundary even on projects whose historical
-- default privileges granted service_role table access.
revoke select on table public.profile_private_settings from service_role;

grant select (
  id, username, display_name, avatar_url, university_name,
  primary_discipline_id, bio, portfolio_url, profile_visibility,
  portfolio_visibility, available_for_projects, created_at, updated_at
) on public.profiles to service_role;

grant select (id, slug, label_ru, label_kk, label_en)
on public.engineering_disciplines to service_role;
grant select (id, slug, label_ru, label_kk, label_en)
on public.skills to service_role;
grant select (id, slug, label_ru, label_kk, label_en)
on public.tools to service_role;
grant select (id, slug, label_ru, label_kk, label_en)
on public.interests to service_role;

grant select (profile_id, skill_id, proficiency)
on public.profile_skills to service_role;
grant select (profile_id, tool_id, proficiency)
on public.profile_tools to service_role;
grant select (profile_id, interest_id)
on public.profile_interests to service_role;
grant select (profile_id, language_code, proficiency)
on public.profile_languages to service_role;
