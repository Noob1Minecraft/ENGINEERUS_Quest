begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

create or replace function public._h2_images_throws(statement text)
returns boolean language plpgsql as $$
begin execute statement; return false; exception when others then return true; end;
$$;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
 ('00000000-0000-0000-0000-000000000000','c0000000-0000-4000-8000-000000000001','authenticated','authenticated','h2-a@example.test','',now(),'{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','c0000000-0000-4000-8000-000000000002','authenticated','authenticated','h2-b@example.test','',now(),'{}','{}',now(),now());

select has_table('public','ai_images','image metadata table exists');
select ok((select relrowsecurity from pg_class where oid='public.ai_images'::regclass),'image RLS is enabled');
select ok(not has_table_privilege('anon','public.ai_images','SELECT,INSERT,UPDATE,DELETE'),'anon has no image access');
select ok(not has_table_privilege('authenticated','public.ai_images','INSERT,UPDATE,DELETE'),'authenticated cannot mutate image state');
select ok(has_column_privilege('authenticated','public.ai_images','original_filename','SELECT'),'authenticated can read owner-safe filename metadata');
select ok(has_column_privilege('authenticated','public.ai_images','width','SELECT'),'authenticated can read owner-safe dimensions');
select ok(not has_column_privilege('authenticated','public.ai_images','user_id','SELECT'),'browser cannot select image owner column');
select ok(not has_column_privilege('authenticated','public.ai_images','storage_path','SELECT'),'browser cannot select private storage path');
select ok(not has_column_privilege('authenticated','public.ai_images','failure_code','SELECT'),'browser cannot select internal failure code');
select ok(has_table_privilege('service_role','public.ai_images','SELECT,INSERT,UPDATE,DELETE'),'service role has server processing access');
select ok(has_function_privilege('service_role','public.create_ai_image_upload(uuid,uuid,text,text,integer,integer,integer,text)','EXECUTE'),'service role can reserve image upload');
select ok(has_function_privilege('service_role','public.complete_ai_image_processing(uuid,uuid)','EXECUTE'),'service role can complete image processing');
select ok(not has_function_privilege('authenticated','public.create_ai_image_upload(uuid,uuid,text,text,integer,integer,integer,text)','EXECUTE'),'authenticated cannot forge image reservations');
select ok(not has_function_privilege('authenticated','public.complete_ai_image_processing(uuid,uuid)','EXECUTE'),'authenticated cannot mark images ready');
select ok(not has_function_privilege('anon','public.complete_ai_image_processing(uuid,uuid)','EXECUTE'),'anon cannot mark images ready');
select ok(not exists (
  select 1
  from pg_proc p, lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
  where p.oid = 'public.create_ai_image_upload(uuid,uuid,text,text,integer,integer,integer,text)'::regprocedure
    and acl.grantee = 0
    and acl.privilege_type = 'EXECUTE'
),'PUBLIC cannot reserve image uploads');
select ok(not has_table_privilege('service_role','public.profiles','UPDATE'),'image quota lock does not widen profile mutation privileges');
select is((select public from storage.buckets where id='engineerus-documents'),false,'shared H1/H2 bucket remains private');
select ok((select allowed_mime_types @> array['image/jpeg','image/png','image/webp']::text[] from storage.buckets where id='engineerus-documents'),'bucket allows only supported H2 image MIME types in addition to H1 documents');
select is((select count(*)::integer from pg_policies where schemaname='storage' and tablename='objects' and (qual like '%engineerus-documents%' or with_check like '%engineerus-documents%')),0,'browser receives no direct Storage object policy');

insert into public.ai_images (id,user_id,original_filename,mime_type,size_bytes,width,height,status,storage_path)
values
 ('c1000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','a.png','image/png',100,20,10,'processing','c0000000-0000-4000-8000-000000000001/images/c1000000-0000-4000-8000-000000000001/normalized.png'),
 ('c1000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000002','b.png','image/png',100,20,10,'processing','c0000000-0000-4000-8000-000000000002/images/c1000000-0000-4000-8000-000000000002/normalized.png');

set local request.jwt.claim.sub='c0000000-0000-4000-8000-000000000001';
set local request.jwt.claim.role='authenticated';
set local role authenticated;
select is((select count(*)::integer from public.ai_images),1,'owner sees only own image metadata');
select is((select original_filename from public.ai_images),'a.png','owner reads safe image metadata');

reset role;
set local role service_role;
select lives_ok($$select * from public.complete_ai_image_processing(
 'c0000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001'
)$$,'server completes an owned processing image');
select is((select status from public.ai_images where id='c1000000-0000-4000-8000-000000000001'),'ready','completion controls ready status');

reset role;
insert into public.ai_images (user_id,original_filename,mime_type,size_bytes,width,height,status,storage_path)
select
 'c0000000-0000-4000-8000-000000000002',
 'quota-' || item || '.png', 'image/png', 1, 1, 1, 'processing',
 'c0000000-0000-4000-8000-000000000002/images/' || gen_random_uuid()::text || '/normalized.png'
from generate_series(1,29) item;
set local role service_role;
select ok(public._h2_images_throws($$select * from public.create_ai_image_upload(
 gen_random_uuid(),'c0000000-0000-4000-8000-000000000002','over.png','image/png',1,1,1,
 'c0000000-0000-4000-8000-000000000002/images/' || gen_random_uuid()::text || '/normalized.png'
)$$),'atomic upload reservation rejects the thirty-first image');

reset role;
select * from finish();
rollback;
