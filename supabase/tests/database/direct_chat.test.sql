begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

create or replace function public._phase_e_throws(statement text)
returns boolean language plpgsql as $$
begin execute statement; return false; exception when others then return true; end;
$$;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000','95000000-0000-4000-8000-000000000001','authenticated','authenticated','phase-e-owner@example.test','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','95000000-0000-4000-8000-000000000002','authenticated','authenticated','phase-e-member@example.test','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','95000000-0000-4000-8000-000000000003','authenticated','authenticated','phase-e-second@example.test','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','95000000-0000-4000-8000-000000000004','authenticated','authenticated','phase-e-outsider@example.test','',now(),'{}','{}',now(),now());

insert into public.projects (id, owner_id, title, status, visibility)
values ('95100000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001','Phase E private project','open','private');
insert into public.project_roles (id, project_id, title, positions_total, status)
values
 ('95200000-0000-4000-8000-000000000001','95100000-0000-4000-8000-000000000001','Member one',2,'open'),
 ('95200000-0000-4000-8000-000000000002','95100000-0000-4000-8000-000000000001','Member two',2,'open');
insert into public.project_members (project_id,user_id,role_id) values
 ('95100000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000002','95200000-0000-4000-8000-000000000001'),
 ('95100000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000003','95200000-0000-4000-8000-000000000002');

select has_table('public','direct_conversations','direct conversations are separate from AI chats');
select has_table('public','direct_conversation_members','direct membership exists');
select has_table('public','direct_messages','direct messages exist');
select has_table('public','user_blocks','minimal user blocking exists');
select ok((select relrowsecurity from pg_class where oid='public.direct_conversations'::regclass),'conversation RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.direct_messages'::regclass),'message RLS enabled');
select ok(not has_table_privilege('anon','public.direct_messages','SELECT'),'anon cannot read direct messages');
select ok(not has_table_privilege('authenticated','public.direct_messages','INSERT'),'clients cannot spoof message inserts');
select ok(not has_table_privilege('authenticated','public.direct_conversations','INSERT'),'clients cannot create arbitrary conversations');
select ok(not has_table_privilege('service_role','public.direct_messages','SELECT'),'service role receives no direct-message table grant');
select ok(has_function_privilege('authenticated','public.get_or_create_direct_conversation(uuid,uuid)','EXECUTE'),'authenticated may use guarded create RPC');
select ok(not has_function_privilege('anon','public.get_or_create_direct_conversation(uuid,uuid)','EXECUTE'),'anon cannot create direct chats');
select ok(not has_function_privilege('service_role','public.send_direct_message(uuid,uuid,text)','EXECUTE'),'service role cannot bypass sender RPC');

set local request.jwt.claim.sub='95000000-0000-4000-8000-000000000001';
set local request.jwt.claim.role='authenticated';
set local role authenticated;
select lives_ok($$select public.get_or_create_direct_conversation('95000000-0000-4000-8000-000000000002','95100000-0000-4000-8000-000000000001')$$,'owner can open chat with accepted project member');
select is((select count(*)::integer from public.direct_conversations),1,'one canonical conversation created');
select set_config('phasee.conversation_id',(select id::text from public.direct_conversations),true);
select lives_ok($$select public.get_or_create_direct_conversation('95000000-0000-4000-8000-000000000002','95100000-0000-4000-8000-000000000001')$$,'repeat create is idempotent');
select is((select count(*)::integer from public.direct_conversations),1,'repeat create cannot duplicate pair');
select is((select count(*)::integer from public.direct_conversation_members),2,'conversation has exactly two members');
select ok(public._phase_e_throws($$select public.get_or_create_direct_conversation('95000000-0000-4000-8000-000000000001',null)$$),'self conversation is forbidden');
select ok(public._phase_e_throws($$select public.get_or_create_direct_conversation('95000000-0000-4000-8000-000000000004',null)$$),'unrelated profile cannot be contacted');
select lives_ok($$select * from public.send_direct_message((select id from public.direct_conversations),'95300000-0000-4000-8000-000000000001','Owner hello')$$,'participant sends through authoritative RPC');
select is((select count(*)::integer from public.direct_messages),1,'one direct message stored');
select lives_ok($$select * from public.send_direct_message((select id from public.direct_conversations),'95300000-0000-4000-8000-000000000001','Owner hello')$$,'same idempotency key is safe');
select is((select count(*)::integer from public.direct_messages),1,'idempotent retry does not duplicate message');
select ok(public._phase_e_throws($$select * from public.send_direct_message((select id from public.direct_conversations),gen_random_uuid(),'   ')$$),'blank message rejected');
select is((select sender_id from public.direct_messages limit 1),'95000000-0000-4000-8000-000000000001'::uuid,'sender is auth.uid');
select is((select count(*)::integer from public.chat_messages),0,'AI chat messages remain untouched');

reset role;
set local request.jwt.claim.sub='95000000-0000-4000-8000-000000000002';
set local role authenticated;
select is((select count(*)::integer from public.direct_conversations),1,'other participant reads conversation');
select is((select count(*)::integer from public.direct_messages),1,'other participant reads history');
select lives_ok($$select public.mark_direct_conversation_read((select id from public.direct_conversations))$$,'participant marks only own member state read');
select lives_ok($$select * from public.send_direct_message((select id from public.direct_conversations),'95300000-0000-4000-8000-000000000002','Member reply')$$,'other participant replies');

reset role;
set local request.jwt.claim.sub='95000000-0000-4000-8000-000000000004';
set local role authenticated;
select is((select count(*)::integer from public.direct_conversations),0,'outsider cannot read conversation');
select is((select count(*)::integer from public.direct_messages),0,'outsider cannot read messages');
select ok(public._phase_e_throws($$select public.mark_direct_conversation_read('00000000-0000-0000-0000-000000000000')$$),'outsider cannot mutate read state');
select ok(public._phase_e_throws($$select * from public.send_direct_message(current_setting('phasee.conversation_id')::uuid,gen_random_uuid(),'intrusion')$$),'non-participant cannot send');

reset role;
-- pgTAP runs this file in one transaction, so make the owner's read boundary
-- explicitly precede the reply (real API calls use separate transactions).
update public.direct_conversation_members
set last_read_at = now() - interval '1 second'
where conversation_id = current_setting('phasee.conversation_id')::uuid
  and user_id = '95000000-0000-4000-8000-000000000001';
set local request.jwt.claim.sub='95000000-0000-4000-8000-000000000001';
set local role authenticated;
select is((select unread_count::integer from public.list_direct_conversations(25,null,null)),1,'unread count derives only messages after own read state from the other sender');
select lives_ok($$select public.block_direct_chat_user('95000000-0000-4000-8000-000000000002')$$,'participant can block other participant');
select ok(public._phase_e_throws($$select public.get_or_create_direct_conversation('95000000-0000-4000-8000-000000000002',null)$$),'blocked pair cannot create or reuse conversation');
select ok(public._phase_e_throws($$select * from public.send_direct_message((select id from public.direct_conversations),gen_random_uuid(),'blocked')$$),'block prevents future sends');
select is((select count(*)::integer from public.direct_messages),2,'rejected blocked message is not persisted');
select is((select count(*)::integer from public.direct_messages where content='Owner hello'),1,'historical messages remain readable after block');
select lives_ok($$select public.unblock_direct_chat_user('95000000-0000-4000-8000-000000000002')$$,'blocker can unblock');
select lives_ok($$select * from public.send_direct_message((select id from public.direct_conversations),gen_random_uuid(),'after unblock')$$,'unblock restores eligible messaging');

reset role;
update public.profile_private_settings set allow_direct_messages=false where profile_id='95000000-0000-4000-8000-000000000003';
set local request.jwt.claim.sub='95000000-0000-4000-8000-000000000002';
set local role authenticated;
select ok(public._phase_e_throws($$select public.get_or_create_direct_conversation('95000000-0000-4000-8000-000000000003','95100000-0000-4000-8000-000000000001')$$),'recipient messaging preference is enforced');

reset role;
select * from finish();
rollback;
