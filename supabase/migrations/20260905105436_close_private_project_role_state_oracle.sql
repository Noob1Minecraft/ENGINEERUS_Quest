-- Inaccessible private roles must remain indistinguishable from nonexistent
-- roles before any role or project state is disclosed.
create or replace function public.create_project_application(
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
  v_is_owner boolean;
  v_is_member boolean;
  v_id uuid;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select * into v_role
  from public.project_roles
  where id = p_role_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'project_role_not_found';
  end if;

  select * into v_project
  from public.projects
  where id = v_role.project_id
  for update;

  v_is_owner := v_project.owner_id = v_actor;
  v_is_member := exists (
    select 1 from public.project_members
    where project_id = v_project.id and user_id = v_actor
  );

  -- Preserve specific owner/member protections for actors already related to
  -- the private project. Everyone else receives the same result as an unknown
  -- role before status or capacity is inspected.
  if v_project.visibility = 'private' then
    if v_is_owner then
      raise exception using errcode = 'P0001', message = 'self_application_forbidden';
    end if;
    if v_is_member then
      raise exception using errcode = 'P0001', message = 'already_project_member';
    end if;
    raise exception using errcode = 'P0001', message = 'project_role_not_found';
  end if;

  if v_project.status <> 'open' or v_role.status <> 'open' then
    raise exception using errcode = 'P0001', message = 'project_role_not_open';
  end if;

  if v_is_owner then
    raise exception using errcode = 'P0001', message = 'self_application_forbidden';
  end if;

  if v_is_member then
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

comment on function public.create_project_application(uuid, text) is
  'Creates applications for visible open projects; private project roles are invitation-only and state-hidden from unrelated callers.';
