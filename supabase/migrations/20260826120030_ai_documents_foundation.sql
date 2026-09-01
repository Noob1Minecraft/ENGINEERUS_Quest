-- H1 AI Documents: private metadata, server-controlled processing, and bounded
-- extracted chunks. Browser roles receive no write surface and never see the
-- private Storage object path.

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  original_filename text not null
    check (
      char_length(original_filename) between 1 and 180
      and original_filename !~ '[[:cntrl:]/\\]'
    ),
  file_type text not null check (file_type in ('pdf', 'docx', 'txt', 'markdown')),
  mime_type text not null check (mime_type in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown'
  )),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  status text not null default 'processing'
    check (status in ('uploaded', 'processing', 'ready', 'failed')),
  storage_path text not null unique
    check (
      char_length(storage_path) between 40 and 160
      and storage_path like user_id::text || '/%'
      and storage_path !~ '(^|/)\.\.(/|$)'
      and storage_path !~ '[[:cntrl:]\\]'
    ),
  page_count integer check (page_count between 1 and 200),
  failure_code text check (failure_code is null or char_length(failure_code) between 1 and 64),
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  check (
    (status = 'ready' and processed_at is not null and failure_code is null)
    or (status = 'failed' and processed_at is not null and failure_code is not null)
    or (status in ('uploaded', 'processing') and processed_at is null and failure_code is null)
  )
);

create index documents_owner_created_idx
on public.documents (user_id, created_at desc, id desc);

create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  ordinal integer not null check (ordinal between 0 and 179),
  text text not null check (char_length(text) between 1 and 3000),
  page_number integer check (page_number between 1 and 200),
  created_at timestamptz not null default now(),
  unique (document_id, ordinal)
);

create index document_chunks_retrieval_idx
on public.document_chunks (document_id, ordinal);

alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;

revoke all on table public.documents
from public, anon, authenticated, service_role;
revoke all on table public.document_chunks
from public, anon, authenticated, service_role;

-- Direct Data API access is metadata-only and owner-only. The Engineerus API
-- remains the normal access path and returns an even narrower DTO.
grant select (
  id, original_filename, file_type, mime_type, size_bytes, status,
  page_count, created_at, processed_at
) on public.documents to authenticated;

create policy documents_owner_select
on public.documents
for select
to authenticated
using ((select auth.uid()) = user_id);

-- Processing and deletion are server-controlled. Service role access is used
-- only by authenticated Engineerus routes that explicitly scope every query by
-- the verified JWT subject.
grant select, insert, update, delete on table public.documents to service_role;
grant select, insert, delete on table public.document_chunks to service_role;

create function public.create_document_upload(
  p_document_id uuid,
  p_user_id uuid,
  p_original_filename text,
  p_file_type text,
  p_mime_type text,
  p_size_bytes integer,
  p_storage_path text
)
returns setof public.documents
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Serialize quota reservations without granting service_role UPDATE on the
  -- profile table. The transaction-scoped key is derived only from user UUID.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 0)
  );
  perform 1 from public.profiles where id = p_user_id;
  if not found then
    raise exception 'document_owner_not_found' using errcode = '23503';
  end if;
  if (select count(*) from public.documents where user_id = p_user_id) >= 20 then
    raise exception 'document_quota_exceeded' using errcode = 'P0001';
  end if;

  return query
  insert into public.documents (
    id, user_id, original_filename, file_type, mime_type, size_bytes,
    status, storage_path
  ) values (
    p_document_id, p_user_id, p_original_filename, p_file_type, p_mime_type,
    p_size_bytes, 'processing', p_storage_path
  )
  returning *;
end;
$$;

revoke all on function public.create_document_upload(uuid, uuid, text, text, text, integer, text)
from public, anon, authenticated;
grant execute on function public.create_document_upload(uuid, uuid, text, text, text, integer, text)
to service_role;

create function public.complete_document_processing(
  p_user_id uuid,
  p_document_id uuid,
  p_page_count integer,
  p_chunks jsonb
)
returns setof public.documents
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if jsonb_typeof(p_chunks) <> 'array'
     or jsonb_array_length(p_chunks) not between 1 and 180 then
    raise exception 'invalid_document_chunks' using errcode = '22023';
  end if;

  perform 1
  from public.documents
  where id = p_document_id
    and user_id = p_user_id
    and status = 'processing'
  for update;
  if not found then
    raise exception 'document_processing_state_invalid' using errcode = 'P0002';
  end if;

  insert into public.document_chunks (document_id, ordinal, text, page_number)
  select p_document_id, item.ordinal, item.text, item.page_number
  from jsonb_to_recordset(p_chunks) as item(
    ordinal integer,
    text text,
    page_number integer
  );

  return query
  update public.documents
  set status = 'ready',
      page_count = p_page_count,
      processed_at = now(),
      failure_code = null
  where id = p_document_id and user_id = p_user_id
  returning *;
end;
$$;

revoke all on function public.complete_document_processing(uuid, uuid, integer, jsonb)
from public, anon, authenticated;
grant execute on function public.complete_document_processing(uuid, uuid, integer, jsonb)
to service_role;

-- Supabase Storage is private by default. The browser receives no
-- storage.objects policy for this bucket; uploads and deletion go through the
-- trusted backend and the Storage API, never direct SQL object mutation.
insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'engineerus-documents',
  'engineerus-documents',
  false,
  10485760,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown'
  ]::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
