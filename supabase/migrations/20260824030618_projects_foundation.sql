-- Phase B: authenticated, owner-controlled engineering projects.
-- Applications, roles, memberships, invitations, chat, and realtime are
-- intentionally outside this migration.

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid()
    references public.profiles (id) on delete restrict,
  title text not null,
  description text not null default '',
  primary_discipline_id uuid
    references public.engineering_disciplines (id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'open', 'in_progress', 'completed', 'cancelled', 'archived')),
  visibility text not null default 'private'
    check (visibility in ('private', 'authenticated', 'public')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_title_length
    check (char_length(btrim(title)) between 1 and 120),
  constraint projects_description_length
    check (char_length(description) <= 5000)
);

create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

create index projects_owner_id_idx on public.projects (owner_id, id);
create index projects_status_idx on public.projects (status, id);
create index projects_visibility_idx on public.projects (visibility, id);
create index projects_primary_discipline_id_idx
on public.projects (primary_discipline_id, id)
where primary_discipline_id is not null;
create index projects_created_at_idx on public.projects (created_at desc, id desc);

alter table public.projects enable row level security;

-- Data API access is explicit. Owner identity, IDs, and timestamps are not
-- writable through the authenticated column surface.
revoke all on table public.projects from anon, authenticated, service_role;

grant select (
  id, owner_id, title, description, primary_discipline_id,
  status, visibility, created_at, updated_at
) on public.projects to authenticated;
grant insert (
  title, description, primary_discipline_id, status, visibility
) on public.projects to authenticated;
grant update (
  title, description, primary_discipline_id, status, visibility
) on public.projects to authenticated;

create policy projects_select_owner_or_visible
on public.projects for select
to authenticated
using (
  (select auth.uid()) = owner_id
  or (
    status <> 'draft'
    and visibility in ('authenticated', 'public')
  )
);

create policy projects_insert_owner
on public.projects for insert
to authenticated
with check ((select auth.uid()) = owner_id);

create policy projects_update_owner
on public.projects for update
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

-- No DELETE grant or policy is provided. DELETE /api/projects/:id performs a
-- future-safe archive transition through the owner-only update policy.
