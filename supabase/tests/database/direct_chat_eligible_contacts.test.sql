begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(24);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000','98000000-0000-4000-8000-000000000001','authenticated','authenticated','contact-owner@example.test','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','98000000-0000-4000-8000-000000000002','authenticated','authenticated','contact-member@example.test','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','98000000-0000-4000-8000-000000000003','authenticated','authenticated','contact-second-member@example.test','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','98000000-0000-4000-8000-000000000004','authenticated','authenticated','contact-pending@example.test','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','98000000-0000-4000-8000-000000000005','authenticated','authenticated','contact-outsider@example.test','',now(),'{}','{}',now(),now());

update public.profiles
set username = case id
  when '98000000-0000-4000-8000-000000000001' then 'contact-owner'
  when '98000000-0000-4000-8000-000000000002' then 'contact-member'
  when '98000000-0000-4000-8000-000000000003' then 'contact-second'
  when '98000000-0000-4000-8000-000000000004' then 'contact-pending'
  else 'contact-outsider' end,
display_name = case id
  when '98000000-0000-4000-8000-000000000001' then 'Contact Owner'
  when '98000000-0000-4000-8000-000000000002' then 'Contact Member'
  when '98000000-0000-4000-8000-000000000003' then 'Contact Second Member'
  when '98000000-0000-4000-8000-000000000004' then 'Contact Pending'
  else 'Contact Outsider' end,
profile_visibility = 'private';

insert into public.projects (id, owner_id, title, status, visibility)
values ('98100000-0000-4000-8000-000000000001','98000000-0000-4000-8000-000000000001','Private contact project','open','private');
insert into public.project_roles (id, project_id, title, positions_total, status)
values ('98200000-0000-4000-8000-000000000001','98100000-0000-4000-8000-000000000001','Contact engineer',3,'open');
insert into public.project_members (project_id,user_id,role_id) values
 ('98100000-0000-4000-8000-000000000001','98000000-0000-4000-8000-000000000002','98200000-0000-4000-8000-000000000001'),
 ('98100000-0000-4000-8000-000000000001','98000000-0000-4000-8000-000000000003','98200000-0000-4000-8000-000000000001');

set local request.jwt.claim.sub='98000000-0000-4000-8000-000000000001';
set local request.jwt.claim.role='authenticated';
set local role authenticated;
do $$
begin
  if auth.uid() is distinct from '98000000-0000-4000-8000-000000000001'::uuid then
    raise exception 'unexpected fixture actor';
  end if;
end;
$$;
select set_config(
  'phase_direct_chat.pending_invitation_id',
  public.create_project_invitation(
    '98200000-0000-4000-8000-000000000001',
    '98000000-0000-4000-8000-000000000004',
    'Pending',
    now() + interval '7 days'
  )::text,
  true
);
reset role;

select has_function('public','list_direct_chat_eligible_contacts',array[]::text[],'eligible-contact projection exists');
select ok((select prosecdef from pg_proc where oid='public.list_direct_chat_eligible_contacts()'::regprocedure),'eligible-contact projection is SECURITY DEFINER');
select ok(
  (select coalesce(proconfig, '{}'::text[]) @> array['search_path=""']::text[]
   from pg_proc
   where oid='public.list_direct_chat_eligible_contacts()'::regprocedure),
  'eligible-contact projection has an explicit empty search_path'
);
select ok(has_function_privilege('authenticated','public.list_direct_chat_eligible_contacts()','EXECUTE'),'authenticated may list its own eligible contacts');
select ok(not has_function_privilege('anon','public.list_direct_chat_eligible_contacts()','EXECUTE'),'anon cannot list eligible contacts');
select ok(not has_function_privilege('service_role','public.list_direct_chat_eligible_contacts()','EXECUTE'),'service role has no exposed eligible-contact RPC grant');
select ok(not has_function_privilege('public','public.list_direct_chat_eligible_contacts()','EXECUTE'),'PUBLIC has no eligible-contact RPC grant');
select is((select count(*)::integer from pg_proc where proname='list_direct_chat_eligible_contacts' and pronargs > 0),0,'eligible-contact projection accepts no target identity');

set local request.jwt.claim.sub='98000000-0000-4000-8000-000000000002';
set local request.jwt.claim.role='authenticated';
set local role authenticated;
select is((select count(*)::integer from public.list_direct_chat_eligible_contacts()),2,'accepted member sees owner and another accepted member');
select ok(exists(select 1 from public.list_direct_chat_eligible_contacts() where profile_id='98000000-0000-4000-8000-000000000001'),'accepted invitation/member relationship exposes the project owner');
select ok(exists(select 1 from public.list_direct_chat_eligible_contacts() where profile_id='98000000-0000-4000-8000-000000000003'),'accepted project membership exposes another member');
select ok(not exists(select 1 from public.list_direct_chat_eligible_contacts() where profile_id='98000000-0000-4000-8000-000000000004'),'pending invitation is not eligible');
select ok(not exists(select 1 from public.list_direct_chat_eligible_contacts() where profile_id='98000000-0000-4000-8000-000000000005'),'unrelated account is not eligible');
select is((select project_title from public.list_direct_chat_eligible_contacts() where profile_id='98000000-0000-4000-8000-000000000001'),'Private contact project','minimal private project context is returned only through the relationship');
select is((select relationship_kind from public.list_direct_chat_eligible_contacts() where profile_id='98000000-0000-4000-8000-000000000001'),'owner','owner relationship is explicit');
select is((select role_title from public.list_direct_chat_eligible_contacts() where profile_id='98000000-0000-4000-8000-000000000003'),'Contact engineer','member role context is returned');
select ok(not exists(select 1 from jsonb_object_keys(to_jsonb(contact)) key where key in ('email','telegram_user_id','preferred_lang','bio','portfolio_url','profile_visibility','private_settings')),'projection contains no private profile fields')
from public.list_direct_chat_eligible_contacts() contact limit 1;

reset role;
set local request.jwt.claim.sub='98000000-0000-4000-8000-000000000005';
set local role authenticated;
select is((select count(*)::integer from public.list_direct_chat_eligible_contacts()),0,'unrelated authenticated user receives no contacts');

reset role;
update public.profile_private_settings set allow_direct_messages=false where profile_id='98000000-0000-4000-8000-000000000003';
set local request.jwt.claim.sub='98000000-0000-4000-8000-000000000002';
set local role authenticated;
select ok(not exists(select 1 from public.list_direct_chat_eligible_contacts() where profile_id='98000000-0000-4000-8000-000000000003'),'disabled peer is excluded');

reset role;
update public.profile_private_settings set allow_direct_messages=true where profile_id='98000000-0000-4000-8000-000000000003';
insert into public.user_blocks(blocker_id,blocked_id) values ('98000000-0000-4000-8000-000000000003','98000000-0000-4000-8000-000000000002');
set local request.jwt.claim.sub='98000000-0000-4000-8000-000000000002';
set local role authenticated;
select ok(not exists(select 1 from public.list_direct_chat_eligible_contacts() where profile_id='98000000-0000-4000-8000-000000000003'),'either-direction block excludes the peer');
select lives_ok($$select public.get_or_create_direct_conversation('98000000-0000-4000-8000-000000000001','98100000-0000-4000-8000-000000000001')$$,'eligible contact still passes the authoritative conversation RPC');
select is((select count(*)::integer from public.direct_conversations),1,'eligible contact creates one canonical conversation');

-- Fixture-integrity counts run as the transaction owner. Authenticated RLS
-- visibility is covered by the eligible-contact assertions above.
reset role;
select is((select count(*)::integer from public.profiles),5,'projection does not alter profiles');
select is((select count(*)::integer from public.project_members),2,'projection does not alter project membership');

select * from finish();
rollback;
