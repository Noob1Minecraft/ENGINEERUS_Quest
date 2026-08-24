-- Phase C: normalized project recruiting, membership, applications, and invitations.
-- Authenticated clients receive a read-only table surface. Every mutation runs
-- through a narrowly scoped function that derives the actor from auth.uid().

create table public.project_roles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null,
  description text not null default '',
  discipline_id uuid references public.engineering_disciplines (id) on delete set null,
  positions_total smallint not null default 1 check (positions_total between 1 and 20),
  status text not null default 'open' check (status in ('open', 'filled', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_roles_title_length check (char_length(btrim(title)) between 1 and 120),
  constraint project_roles_description_length check (char_length(description) <= 2000),
  unique (project_id, id)
);

create trigger project_roles_set_updated_at
before update on public.project_roles
for each row execute function public.set_updated_at();

create index project_roles_project_status_idx on public.project_roles (project_id, status, id);
create index project_roles_discipline_idx on public.project_roles (discipline_id, id)
where discipline_id is not null;

create table public.project_role_skills (
  role_id uuid not null references public.project_roles (id) on delete cascade,
  skill_id uuid not null references public.skills (id) on delete restrict,
  requirement text not null default 'required' check (requirement in ('required', 'optional')),
  weight smallint not null default 1 check (weight between 1 and 100),
  created_at timestamptz not null default now(),
  primary key (role_id, skill_id)
);

create index project_role_skills_skill_role_idx on public.project_role_skills (skill_id, role_id);

create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role_id uuid not null,
  joined_at timestamptz not null default now(),
  primary key (project_id, user_id),
  foreign key (project_id, role_id)
    references public.project_roles (project_id, id) on delete restrict
);

create index project_members_user_project_idx on public.project_members (user_id, project_id);
create index project_members_role_idx on public.project_members (role_id, user_id);

create table public.project_applications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  role_id uuid not null,
  applicant_id uuid not null references public.profiles (id) on delete cascade,
  note text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'withdrawn', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles (id) on delete set null,
  foreign key (project_id, role_id)
    references public.project_roles (project_id, id) on delete cascade,
  constraint project_applications_note_length check (char_length(note) <= 1000),
  constraint project_applications_role_applicant_unique unique (role_id, applicant_id)
);

create trigger project_applications_set_updated_at
before update on public.project_applications
for each row execute function public.set_updated_at();

create index project_applications_project_status_idx
on public.project_applications (project_id, status, id);
create index project_applications_applicant_status_idx
on public.project_applications (applicant_id, status, id);
create index project_applications_role_status_idx
on public.project_applications (role_id, status, id);

create table public.project_invitations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  role_id uuid not null,
  invitee_id uuid not null references public.profiles (id) on delete cascade,
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  note text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles (id) on delete set null,
  foreign key (project_id, role_id)
    references public.project_roles (project_id, id) on delete cascade,
  constraint project_invitations_note_length check (char_length(note) <= 1000),
  constraint project_invitations_expiry_after_creation check (expires_at > created_at)
);

create trigger project_invitations_set_updated_at
before update on public.project_invitations
for each row execute function public.set_updated_at();

create unique index project_invitations_pending_unique
on public.project_invitations (role_id, invitee_id)
where status = 'pending';
create index project_invitations_project_status_idx
on public.project_invitations (project_id, status, id);
create index project_invitations_invitee_status_idx
on public.project_invitations (invitee_id, status, id);
create index project_invitations_role_status_idx
on public.project_invitations (role_id, status, id);
create index project_invitations_pending_expiry_idx
on public.project_invitations (expires_at, id)
where status = 'pending';

alter table public.project_roles enable row level security;
alter table public.project_role_skills enable row level security;
alter table public.project_members enable row level security;
alter table public.project_applications enable row level security;
alter table public.project_invitations enable row level security;

revoke all on table public.project_roles from anon, authenticated, service_role;
revoke all on table public.project_role_skills from anon, authenticated, service_role;
revoke all on table public.project_members from anon, authenticated, service_role;
revoke all on table public.project_applications from anon, authenticated, service_role;
revoke all on table public.project_invitations from anon, authenticated, service_role;

grant select (
  id, project_id, title, description, discipline_id,
  positions_total, status, created_at, updated_at
) on public.project_roles to authenticated;
grant select (role_id, skill_id, requirement, weight, created_at)
on public.project_role_skills to authenticated;
grant select (project_id, user_id, role_id, joined_at)
on public.project_members to authenticated;
grant select (
  id, project_id, role_id, applicant_id, note, status,
  created_at, updated_at, decided_at, decided_by
) on public.project_applications to authenticated;
grant select (
  id, project_id, role_id, invitee_id, inviter_id, note, status,
  expires_at, created_at, updated_at, decided_at, decided_by
) on public.project_invitations to authenticated;

create policy project_roles_select_visible
on public.project_roles for select
to authenticated
using (
  exists (
    select 1 from public.projects project
    where project.id = project_roles.project_id
      and (
        project.owner_id = (select auth.uid())
        or (project.status <> 'draft' and project.visibility in ('authenticated', 'public'))
      )
  )
  or exists (
    select 1 from public.project_members member
    where member.role_id = project_roles.id
      and member.user_id = (select auth.uid())
  )
  or exists (
    select 1 from public.project_applications application
    where application.role_id = project_roles.id
      and application.applicant_id = (select auth.uid())
  )
  or exists (
    select 1 from public.project_invitations invitation
    where invitation.role_id = project_roles.id
      and invitation.invitee_id = (select auth.uid())
  )
);

create policy project_role_skills_select_visible
on public.project_role_skills for select
to authenticated
using (
  exists (
    select 1 from public.project_roles role
    where role.id = project_role_skills.role_id
  )
);

create policy project_members_select_safe
on public.project_members for select
to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.projects project
    where project.id = project_members.project_id
      and (
        project.owner_id = (select auth.uid())
        or (project.status <> 'draft' and project.visibility in ('authenticated', 'public'))
      )
  )
);

create policy project_applications_select_actor_or_owner
on public.project_applications for select
to authenticated
using (
  applicant_id = (select auth.uid())
  or exists (
    select 1 from public.projects project
    where project.id = project_applications.project_id
      and project.owner_id = (select auth.uid())
  )
);

create policy project_invitations_select_actor_or_owner
on public.project_invitations for select
to authenticated
using (
  invitee_id = (select auth.uid())
  or inviter_id = (select auth.uid())
);

-- Defense in depth: even privileged mutation code cannot add a project owner as
-- a duplicate member. The composite foreign key already guarantees that the
-- selected role belongs to the same project.
create function public.guard_project_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.projects project
    where project.id = new.project_id and project.owner_id = new.user_id
  ) then
    raise exception using errcode = '23514', message = 'project_owner_cannot_be_member';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_project_member()
from public, anon, authenticated, service_role;

create trigger project_members_guard_owner
before insert or update on public.project_members
for each row execute function public.guard_project_member();

create function public.create_project_role(
  p_project_id uuid,
  p_title text,
  p_description text default '',
  p_discipline_id uuid default null,
  p_positions_total integer default 1,
  p_skill_ids uuid[] default '{}'::uuid[],
  p_skill_requirements text[] default '{}'::text[],
  p_skill_weights integer[] default '{}'::integer[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_project public.projects;
  v_role_id uuid;
  v_count integer := cardinality(coalesce(p_skill_ids, '{}'::uuid[]));
  v_index integer;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select * into v_project from public.projects
  where id = p_project_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'project_not_found';
  end if;
  if v_project.owner_id <> v_actor then
    raise exception using errcode = '42501', message = 'project_role_forbidden';
  end if;
  if v_project.status not in ('draft', 'open', 'in_progress') then
    raise exception using errcode = 'P0001', message = 'project_not_recruiting';
  end if;
  if v_count > 20
    or cardinality(coalesce(p_skill_requirements, '{}'::text[])) <> v_count
    or cardinality(coalesce(p_skill_weights, '{}'::integer[])) <> v_count then
    raise exception using errcode = '22023', message = 'invalid_role_skills';
  end if;

  insert into public.project_roles (
    project_id, title, description, discipline_id, positions_total
  ) values (
    p_project_id, btrim(p_title), coalesce(p_description, ''),
    p_discipline_id, p_positions_total
  ) returning id into v_role_id;

  if v_count > 0 then
    for v_index in 1..v_count loop
      insert into public.project_role_skills (role_id, skill_id, requirement, weight)
      values (
        v_role_id, p_skill_ids[v_index], p_skill_requirements[v_index],
        p_skill_weights[v_index]
      );
    end loop;
  end if;
  return v_role_id;
end;
$$;

create function public.update_project_role(
  p_role_id uuid,
  p_title text default null,
  p_description text default null,
  p_discipline_id uuid default null,
  p_set_discipline boolean default false,
  p_positions_total integer default null,
  p_status text default null,
  p_skill_ids uuid[] default null,
  p_skill_requirements text[] default null,
  p_skill_weights integer[] default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.project_roles;
  v_owner_id uuid;
  v_member_count integer;
  v_next_positions integer;
  v_next_status text;
  v_count integer;
  v_index integer;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  select * into v_role from public.project_roles where id = p_role_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'project_role_not_found';
  end if;
  select owner_id into v_owner_id from public.projects
  where id = v_role.project_id for update;
  if v_owner_id <> v_actor then
    raise exception using errcode = '42501', message = 'project_role_forbidden';
  end if;
  if p_status is not null and p_status not in ('open', 'closed') then
    raise exception using errcode = '22023', message = 'invalid_project_role_status';
  end if;

  select count(*)::integer into v_member_count
  from public.project_members where role_id = p_role_id;
  v_next_positions := coalesce(p_positions_total, v_role.positions_total);
  v_next_status := coalesce(p_status, v_role.status);
  if v_next_positions < 1 or v_next_positions > 20 or v_next_positions < v_member_count then
    raise exception using errcode = '22023', message = 'invalid_project_role_capacity';
  end if;
  if v_next_status = 'open' and v_member_count >= v_next_positions then
    v_next_status := 'filled';
  end if;
  if v_next_status = 'filled' and v_member_count < v_next_positions then
    v_next_status := 'open';
  end if;

  update public.project_roles
  set title = coalesce(btrim(p_title), title),
      description = coalesce(p_description, description),
      discipline_id = case when p_set_discipline then p_discipline_id else discipline_id end,
      positions_total = v_next_positions,
      status = v_next_status
  where id = p_role_id;

  if p_skill_ids is not null or p_skill_requirements is not null or p_skill_weights is not null then
    if p_skill_ids is null or p_skill_requirements is null or p_skill_weights is null then
      raise exception using errcode = '22023', message = 'invalid_role_skills';
    end if;
    v_count := cardinality(p_skill_ids);
    if v_count > 20
      or cardinality(p_skill_requirements) <> v_count
      or cardinality(p_skill_weights) <> v_count then
      raise exception using errcode = '22023', message = 'invalid_role_skills';
    end if;
    delete from public.project_role_skills where role_id = p_role_id;
    if v_count > 0 then
      for v_index in 1..v_count loop
        insert into public.project_role_skills (role_id, skill_id, requirement, weight)
        values (
          p_role_id, p_skill_ids[v_index], p_skill_requirements[v_index],
          p_skill_weights[v_index]
        );
      end loop;
    end if;
  end if;
  return p_role_id;
end;
$$;

create function public.close_project_role(p_role_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_project_id uuid;
  v_owner_id uuid;
begin
  select project_id into v_project_id from public.project_roles
  where id = p_role_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'project_role_not_found';
  end if;
  select owner_id into v_owner_id from public.projects
  where id = v_project_id for update;
  if v_actor is null or v_owner_id <> v_actor then
    raise exception using errcode = '42501', message = 'project_role_forbidden';
  end if;

  update public.project_roles set status = 'closed' where id = p_role_id;
  update public.project_applications
  set status = 'cancelled', decided_at = now(), decided_by = v_owner_id
  where role_id = p_role_id and status = 'pending';
  update public.project_invitations
  set status = 'cancelled', decided_at = now(), decided_by = v_owner_id
  where role_id = p_role_id and status = 'pending';
  return p_role_id;
end;
$$;

create function public.create_project_application(
  p_role_id uuid,
  p_note text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.project_roles;
  v_project public.projects;
  v_id uuid;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  select * into v_role from public.project_roles where id = p_role_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'project_role_not_found';
  end if;
  select * into v_project from public.projects where id = v_role.project_id for update;
  if v_project.status <> 'open' or v_role.status <> 'open' then
    raise exception using errcode = 'P0001', message = 'project_role_not_open';
  end if;
  if v_project.owner_id = v_actor then
    raise exception using errcode = 'P0001', message = 'self_application_forbidden';
  end if;
  if exists (
    select 1 from public.project_members
    where project_id = v_project.id and user_id = v_actor
  ) then
    raise exception using errcode = 'P0001', message = 'already_project_member';
  end if;
  if (select count(*) from public.project_members where role_id = p_role_id) >= v_role.positions_total then
    raise exception using errcode = 'P0001', message = 'project_role_full';
  end if;

  insert into public.project_applications (project_id, role_id, applicant_id, note)
  values (v_project.id, p_role_id, v_actor, coalesce(p_note, ''))
  returning id into v_id;
  return v_id;
end;
$$;

create function public.create_project_invitation(
  p_role_id uuid,
  p_invitee_id uuid,
  p_note text default '',
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.project_roles;
  v_project public.projects;
  v_expiry timestamptz := coalesce(p_expires_at, now() + interval '14 days');
  v_id uuid;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  select * into v_role from public.project_roles where id = p_role_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'project_role_not_found';
  end if;
  select * into v_project from public.projects where id = v_role.project_id for update;
  if v_project.owner_id <> v_actor then
    raise exception using errcode = '42501', message = 'project_invitation_forbidden';
  end if;
  if v_project.status <> 'open' or v_role.status <> 'open' then
    raise exception using errcode = 'P0001', message = 'project_role_not_open';
  end if;
  if p_invitee_id = v_actor then
    raise exception using errcode = 'P0001', message = 'self_invitation_forbidden';
  end if;
  if v_expiry <= now() or v_expiry > now() + interval '90 days' then
    raise exception using errcode = '22023', message = 'invalid_invitation_expiry';
  end if;
  if not exists (
    select 1 from public.profile_private_settings settings
    where settings.profile_id = p_invitee_id
      and settings.allow_project_invitations = true
  ) then
    raise exception using errcode = 'P0001', message = 'project_invitations_disabled';
  end if;
  if exists (
    select 1 from public.project_members
    where project_id = v_project.id and user_id = p_invitee_id
  ) then
    raise exception using errcode = 'P0001', message = 'already_project_member';
  end if;
  if (select count(*) from public.project_members where role_id = p_role_id) >= v_role.positions_total then
    raise exception using errcode = 'P0001', message = 'project_role_full';
  end if;

  insert into public.project_invitations (
    project_id, role_id, invitee_id, inviter_id, note, expires_at
  ) values (
    v_project.id, p_role_id, p_invitee_id, v_actor, coalesce(p_note, ''), v_expiry
  ) returning id into v_id;
  return v_id;
end;
$$;

create function public.accept_project_application(p_application_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_application public.project_applications;
  v_role public.project_roles;
  v_project public.projects;
  v_member_count integer;
begin
  select * into v_application from public.project_applications
  where id = p_application_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'project_application_not_found';
  end if;
  select * into v_role from public.project_roles
  where id = v_application.role_id for update;
  select * into v_application from public.project_applications
  where id = p_application_id for update;
  select * into v_project from public.projects
  where id = v_application.project_id for update;
  if v_actor is null or v_project.owner_id <> v_actor then
    raise exception using errcode = '42501', message = 'project_application_forbidden';
  end if;
  if v_application.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'project_application_not_pending';
  end if;
  if v_project.status <> 'open' or v_role.status <> 'open' then
    raise exception using errcode = 'P0001', message = 'project_role_not_open';
  end if;
  if exists (
    select 1 from public.project_members
    where project_id = v_project.id and user_id = v_application.applicant_id
  ) then
    raise exception using errcode = 'P0001', message = 'already_project_member';
  end if;
  select count(*)::integer into v_member_count
  from public.project_members where role_id = v_role.id;
  if v_member_count >= v_role.positions_total then
    raise exception using errcode = 'P0001', message = 'project_role_full';
  end if;

  insert into public.project_members (project_id, user_id, role_id)
  values (v_project.id, v_application.applicant_id, v_role.id);
  update public.project_applications
  set status = 'accepted', decided_at = now(), decided_by = v_actor
  where id = v_application.id;

  v_member_count := v_member_count + 1;
  if v_member_count >= v_role.positions_total then
    update public.project_roles set status = 'filled' where id = v_role.id;
    update public.project_applications
    set status = 'cancelled', decided_at = now(), decided_by = v_project.owner_id
    where role_id = v_role.id and status = 'pending';
    update public.project_invitations
    set status = 'cancelled', decided_at = now(), decided_by = v_project.owner_id
    where role_id = v_role.id and status = 'pending';
  end if;
  return jsonb_build_object(
    'application_id', v_application.id,
    'project_id', v_project.id,
    'role_id', v_role.id,
    'member_id', v_application.applicant_id,
    'role_status', case when v_member_count >= v_role.positions_total then 'filled' else 'open' end
  );
end;
$$;

create function public.accept_project_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_invitation public.project_invitations;
  v_role public.project_roles;
  v_project public.projects;
  v_member_count integer;
begin
  select * into v_invitation from public.project_invitations
  where id = p_invitation_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'project_invitation_not_found';
  end if;
  select * into v_role from public.project_roles
  where id = v_invitation.role_id for update;
  select * into v_invitation from public.project_invitations
  where id = p_invitation_id for update;
  select * into v_project from public.projects
  where id = v_invitation.project_id for update;
  if v_actor is null or v_invitation.invitee_id <> v_actor then
    raise exception using errcode = '42501', message = 'project_invitation_forbidden';
  end if;
  if v_invitation.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'project_invitation_not_pending';
  end if;
  if v_invitation.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'project_invitation_expired';
  end if;
  if v_project.status <> 'open' or v_role.status <> 'open' then
    raise exception using errcode = 'P0001', message = 'project_role_not_open';
  end if;
  if exists (
    select 1 from public.project_members
    where project_id = v_project.id and user_id = v_actor
  ) then
    raise exception using errcode = 'P0001', message = 'already_project_member';
  end if;
  select count(*)::integer into v_member_count
  from public.project_members where role_id = v_role.id;
  if v_member_count >= v_role.positions_total then
    raise exception using errcode = 'P0001', message = 'project_role_full';
  end if;

  insert into public.project_members (project_id, user_id, role_id)
  values (v_project.id, v_actor, v_role.id);
  update public.project_invitations
  set status = 'accepted', decided_at = now(), decided_by = v_actor
  where id = v_invitation.id;

  v_member_count := v_member_count + 1;
  if v_member_count >= v_role.positions_total then
    update public.project_roles set status = 'filled' where id = v_role.id;
    update public.project_applications
    set status = 'cancelled', decided_at = now(), decided_by = v_project.owner_id
    where role_id = v_role.id and status = 'pending';
    update public.project_invitations
    set status = 'cancelled', decided_at = now(), decided_by = v_project.owner_id
    where role_id = v_role.id and status = 'pending';
  end if;
  return jsonb_build_object(
    'invitation_id', v_invitation.id,
    'project_id', v_project.id,
    'role_id', v_role.id,
    'member_id', v_actor,
    'role_status', case when v_member_count >= v_role.positions_total then 'filled' else 'open' end
  );
end;
$$;

create function public.reject_project_application(p_application_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_application public.project_applications;
  v_owner_id uuid;
begin
  select * into v_application from public.project_applications
  where id = p_application_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'project_application_not_found';
  end if;
  select owner_id into v_owner_id from public.projects
  where id = v_application.project_id for update;
  if v_actor is null or v_owner_id <> v_actor then
    raise exception using errcode = '42501', message = 'project_application_forbidden';
  end if;
  if v_application.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'project_application_not_pending';
  end if;
  update public.project_applications
  set status = 'rejected', decided_at = now(), decided_by = v_actor
  where id = p_application_id;
  return p_application_id;
end;
$$;

create function public.withdraw_project_application(p_application_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_application public.project_applications;
begin
  select * into v_application from public.project_applications
  where id = p_application_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'project_application_not_found';
  end if;
  if v_actor is null or v_application.applicant_id <> v_actor then
    raise exception using errcode = '42501', message = 'project_application_forbidden';
  end if;
  if v_application.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'project_application_not_pending';
  end if;
  update public.project_applications
  set status = 'withdrawn', decided_at = now(), decided_by = v_actor
  where id = p_application_id;
  return p_application_id;
end;
$$;

create function public.reject_project_invitation(p_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_invitation public.project_invitations;
begin
  select * into v_invitation from public.project_invitations
  where id = p_invitation_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'project_invitation_not_found';
  end if;
  if v_actor is null or v_invitation.invitee_id <> v_actor then
    raise exception using errcode = '42501', message = 'project_invitation_forbidden';
  end if;
  if v_invitation.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'project_invitation_not_pending';
  end if;
  update public.project_invitations
  set status = 'rejected', decided_at = now(), decided_by = v_actor
  where id = p_invitation_id;
  return p_invitation_id;
end;
$$;

create function public.cancel_project_invitation(p_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_invitation public.project_invitations;
begin
  select * into v_invitation from public.project_invitations
  where id = p_invitation_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'project_invitation_not_found';
  end if;
  if v_actor is null or v_invitation.inviter_id <> v_actor then
    raise exception using errcode = '42501', message = 'project_invitation_forbidden';
  end if;
  if v_invitation.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'project_invitation_not_pending';
  end if;
  update public.project_invitations
  set status = 'cancelled', decided_at = now(), decided_by = v_actor
  where id = p_invitation_id;
  return p_invitation_id;
end;
$$;

revoke all on function public.create_project_role(uuid, text, text, uuid, integer, uuid[], text[], integer[])
from public, anon, authenticated, service_role;
revoke all on function public.update_project_role(uuid, text, text, uuid, boolean, integer, text, uuid[], text[], integer[])
from public, anon, authenticated, service_role;
revoke all on function public.close_project_role(uuid)
from public, anon, authenticated, service_role;
revoke all on function public.create_project_application(uuid, text)
from public, anon, authenticated, service_role;
revoke all on function public.create_project_invitation(uuid, uuid, text, timestamptz)
from public, anon, authenticated, service_role;
revoke all on function public.accept_project_application(uuid)
from public, anon, authenticated, service_role;
revoke all on function public.accept_project_invitation(uuid)
from public, anon, authenticated, service_role;
revoke all on function public.reject_project_application(uuid)
from public, anon, authenticated, service_role;
revoke all on function public.withdraw_project_application(uuid)
from public, anon, authenticated, service_role;
revoke all on function public.reject_project_invitation(uuid)
from public, anon, authenticated, service_role;
revoke all on function public.cancel_project_invitation(uuid)
from public, anon, authenticated, service_role;

grant execute on function public.create_project_role(uuid, text, text, uuid, integer, uuid[], text[], integer[])
to authenticated;
grant execute on function public.update_project_role(uuid, text, text, uuid, boolean, integer, text, uuid[], text[], integer[])
to authenticated;
grant execute on function public.close_project_role(uuid) to authenticated;
grant execute on function public.create_project_application(uuid, text) to authenticated;
grant execute on function public.create_project_invitation(uuid, uuid, text, timestamptz) to authenticated;
grant execute on function public.accept_project_application(uuid) to authenticated;
grant execute on function public.accept_project_invitation(uuid) to authenticated;
grant execute on function public.reject_project_application(uuid) to authenticated;
grant execute on function public.withdraw_project_application(uuid) to authenticated;
grant execute on function public.reject_project_invitation(uuid) to authenticated;
grant execute on function public.cancel_project_invitation(uuid) to authenticated;

comment on function public.accept_project_application(uuid) is
'Atomically accepts one pending role application using auth.uid(); locks the request and role, creates membership, fills capacity, and cancels remaining pending requests.';
comment on function public.accept_project_invitation(uuid) is
'Atomically accepts one pending role invitation using auth.uid(); locks the request and role, creates membership, fills capacity, and cancels remaining pending requests.';
