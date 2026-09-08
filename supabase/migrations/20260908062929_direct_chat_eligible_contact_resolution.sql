-- Direct Chat peer identity is intentionally projected through a relationship-
-- authorized RPC. Profile RLS remains owner-only and no arbitrary profile lookup
-- is exposed to authenticated clients.

create or replace function public.list_direct_chat_eligible_contacts()
returns table (
  profile_id uuid,
  username text,
  display_name text,
  avatar_url text,
  project_id uuid,
  project_title text,
  role_title text,
  relationship_kind text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'direct_chat_auth_required' using errcode = '42501';
  end if;

  return query
  with actor_projects as (
    select project.id, project.title, project.owner_id
    from public.projects project
    where project.owner_id = v_actor
       or exists (
         select 1
         from public.project_members actor_member
         where actor_member.project_id = project.id
           and actor_member.user_id = v_actor
       )
  ), eligible_peers as (
    select
      actor_project.id as project_id,
      actor_project.title as project_title,
      actor_project.owner_id as peer_id,
      null::text as role_title,
      'owner'::text as relationship_kind
    from actor_projects actor_project

    union all

    select
      actor_project.id,
      actor_project.title,
      member.user_id,
      role.title,
      'member'::text
    from actor_projects actor_project
    join public.project_members member
      on member.project_id = actor_project.id
    left join public.project_roles role
      on role.id = member.role_id
  )
  select
    profile.id,
    profile.username,
    profile.display_name,
    profile.avatar_url,
    peer.project_id,
    peer.project_title,
    peer.role_title,
    peer.relationship_kind
  from eligible_peers peer
  join public.profiles profile
    on profile.id = peer.peer_id
  where peer.peer_id <> v_actor
    and not exists (
      select 1
      from public.user_blocks block
      where (block.blocker_id = v_actor and block.blocked_id = peer.peer_id)
         or (block.blocker_id = peer.peer_id and block.blocked_id = v_actor)
    )
    and not exists (
      select 1
      from public.profile_private_settings setting
      where setting.profile_id in (v_actor, peer.peer_id)
        and not setting.allow_direct_messages
    )
  order by
    lower(coalesce(profile.display_name, profile.username, '')),
    profile.id,
    peer.project_id
  limit 100;
end;
$$;

comment on function public.list_direct_chat_eligible_contacts() is
  'Lists minimal peer identity only for users who share an authoritative project ownership/membership relationship with auth.uid().';

revoke all on function public.list_direct_chat_eligible_contacts()
from public, anon, authenticated, service_role;
grant execute on function public.list_direct_chat_eligible_contacts()
to authenticated;
