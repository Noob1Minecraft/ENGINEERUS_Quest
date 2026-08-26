begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

create or replace function public._h1_documents_throws(statement text)
returns boolean language plpgsql as $$
begin execute statement; return false; exception when others then return true; end;
$$;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
 ('00000000-0000-0000-0000-000000000000','a0000000-0000-4000-8000-000000000001','authenticated','authenticated','h1-a@example.test','',now(),'{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','a0000000-0000-4000-8000-000000000002','authenticated','authenticated','h1-b@example.test','',now(),'{}','{}',now(),now());

select has_table('public','documents','document metadata table exists');
select has_table('public','document_chunks','document chunks table exists');
select ok((select relrowsecurity from pg_class where oid='public.documents'::regclass),'document RLS is enabled');
select ok((select relrowsecurity from pg_class where oid='public.document_chunks'::regclass),'chunk RLS is enabled');
select ok(not has_table_privilege('anon','public.documents','SELECT'),'anon cannot read document metadata');
select ok(not has_table_privilege('anon','public.document_chunks','SELECT'),'anon cannot read chunks');
select ok(not has_table_privilege('authenticated','public.documents','INSERT,UPDATE,DELETE'),'authenticated cannot mutate document state');
select ok(not has_table_privilege('authenticated','public.document_chunks','SELECT,INSERT,UPDATE,DELETE'),'authenticated cannot access chunks directly');
select ok(has_column_privilege('authenticated','public.documents','original_filename','SELECT'),'authenticated has metadata column SELECT');
select ok(not has_column_privilege('authenticated','public.documents','storage_path','SELECT'),'storage path is outside browser grant');
select ok(not has_column_privilege('authenticated','public.documents','failure_code','SELECT'),'internal failure code is outside browser grant');
select ok(has_table_privilege('service_role','public.documents','SELECT,INSERT,UPDATE,DELETE'),'service role has processing access to metadata');
select ok(has_table_privilege('service_role','public.document_chunks','SELECT,INSERT,DELETE'),'service role has bounded chunk processing access');
select ok(not has_table_privilege('service_role','public.document_chunks','UPDATE'),'service role cannot rewrite chunks in place');
select ok(has_function_privilege('service_role','public.complete_document_processing(uuid,uuid,integer,jsonb)','EXECUTE'),'service role can atomically complete processing');
select ok(has_function_privilege('service_role','public.create_document_upload(uuid,uuid,text,text,text,integer,text)','EXECUTE'),'service role can reserve an upload slot atomically');
select ok(not has_table_privilege('service_role','public.profiles','UPDATE'),'document quota serialization does not widen service role profile privileges');
select ok(not has_function_privilege('authenticated','public.create_document_upload(uuid,uuid,text,text,text,integer,text)','EXECUTE'),'authenticated cannot reserve or forge document uploads');
select ok(not has_function_privilege('authenticated','public.complete_document_processing(uuid,uuid,integer,jsonb)','EXECUTE'),'authenticated cannot control processing status');
select ok(not has_function_privilege('anon','public.complete_document_processing(uuid,uuid,integer,jsonb)','EXECUTE'),'anon cannot control processing status');
select is((select public from storage.buckets where id='engineerus-documents'),false,'document bucket is private');
select is((select file_size_limit::bigint from storage.buckets where id='engineerus-documents'),10485760::bigint,'bucket enforces 10 MB');
select ok((select allowed_mime_types @> array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','text/markdown']::text[] from storage.buckets where id='engineerus-documents'),'bucket MIME allowlist is exact enough for H1');
select is((select count(*)::integer from pg_policies where schemaname='storage' and tablename='objects' and (qual like '%engineerus-documents%' or with_check like '%engineerus-documents%')),0,'browser roles receive no document Storage policy');

insert into public.documents (id,user_id,original_filename,file_type,mime_type,size_bytes,status,storage_path)
values
 ('a1000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','a.txt','txt','text/plain',10,'processing','a0000000-0000-4000-8000-000000000001/a1000000-0000-4000-8000-000000000001/original.txt'),
 ('a1000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000002','b.txt','txt','text/plain',10,'processing','a0000000-0000-4000-8000-000000000002/a1000000-0000-4000-8000-000000000002/original.txt');

set local request.jwt.claim.sub='a0000000-0000-4000-8000-000000000001';
set local request.jwt.claim.role='authenticated';
set local role authenticated;
select is((select count(*)::integer from public.documents),1,'owner sees only own metadata');
select is((select original_filename from public.documents),'a.txt','owner reads safe metadata');

reset role;
set local role service_role;
select lives_ok($$select * from public.complete_document_processing(
 'a0000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',null,
 '[{"ordinal":0,"text":"safe engineering context","page_number":null}]'::jsonb
)$$,'server atomically completes a valid document');
select is((select status from public.documents where id='a1000000-0000-4000-8000-000000000001'),'ready','completion controls ready status');
select is((select count(*)::integer from public.document_chunks where document_id='a1000000-0000-4000-8000-000000000001'),1,'completion inserts exactly one chunk');

reset role;
insert into public.documents (user_id,original_filename,file_type,mime_type,size_bytes,status,storage_path)
select
 'a0000000-0000-4000-8000-000000000002',
 'quota-' || item || '.txt', 'txt', 'text/plain', 1, 'processing',
 'a0000000-0000-4000-8000-000000000002/' || gen_random_uuid()::text || '/original.txt'
from generate_series(1,19) item;
set local role service_role;
select ok(public._h1_documents_throws($$select * from public.create_document_upload(
 gen_random_uuid(),'a0000000-0000-4000-8000-000000000002','over.txt','txt','text/plain',1,
 'a0000000-0000-4000-8000-000000000002/' || gen_random_uuid()::text || '/original.txt'
)$$),'atomic upload reservation rejects the twenty-first document');

reset role;
select * from finish();
rollback;
