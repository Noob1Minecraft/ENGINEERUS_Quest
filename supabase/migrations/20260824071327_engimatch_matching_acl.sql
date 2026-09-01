-- EngiMatch remains mediated by the Engineerus backend. The service role may
-- read only the invitation eligibility switch; it cannot read language
-- preference, direct-message preference, timestamps, or any Auth data.
grant select (profile_id, allow_project_invitations)
on public.profile_private_settings to service_role;

-- Matching filters by opt-in profile IDs. The primary key already supports
-- those bounded lookups, so no additional index or match cache is required.
