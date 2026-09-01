-- H2 AI Images: private, server-mediated image metadata and normalized image
-- storage. Browser roles receive no image mutation or Storage object surface.

create table public.ai_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  original_filename text not null
    check (
      char_length(original_filename) between 1 and 180
      and original_filename !~ '[[:cntrl:]/\\]'
    ),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes between 1 and 5242880),
  width integer not null check (width between 1 and 6000),
  height integer not null check (height between 1 and 6000),
  status text not null default 'processing' check (status in ('processing', 'ready', 'failed')),
  storage_path text not null unique
    check (
      char_length(storage_path) between 48 and 180
      and storage_path like user_id::text || '/images/%'
      and storage_path !~ '(^|/)\.\.(/|$)'
      and storage_path !~ '[[:cntrl:]\\]'
    ),
  failure_code text check (failure_code is null or char_length(failure_code) between 1 and 64),
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  check (
    (status = 'ready' and processed_at is not null and failure_code is null)
    or (status = 'failed' and processed_at is not null and failure_code is not null)
    or (status = 'processing' and processed_at is null and failure_code is null)
  )
);

create index ai_images_owner_created_idx
on public.ai_images (user_id, created_at desc, id desc);

alter table public.ai_images enable row level security;

revoke all on table public.ai_images
from public, anon, authenticated, service_role;

grant select (
  id, original_filename, mime_type, size_bytes, width, height, status,
  created_at, processed_at
) on public.ai_images to authenticated;

create policy ai_images_owner_select
on public.ai_images
for select
to authenticated
using ((select auth.uid()) = user_id);

grant select, insert, update, delete on table public.ai_images to service_role;

create function public.create_ai_image_upload(
  p_image_id uuid,
  p_user_id uuid,
  p_original_filename text,
  p_mime_type text,
  p_size_bytes integer,
  p_width integer,
  p_height integer,
  p_storage_path text
)
returns setof public.ai_images
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ai-image:' || p_user_id::text, 0)
  );
  perform 1 from public.profiles where id = p_user_id;
  if not found then
    raise exception 'image_owner_not_found' using errcode = '23503';
  end if;
  if (select count(*) from public.ai_images where user_id = p_user_id) >= 30 then
    raise exception 'image_quota_exceeded' using errcode = 'P0001';
  end if;

  return query
  insert into public.ai_images (
    id, user_id, original_filename, mime_type, size_bytes, width, height,
    status, storage_path
  ) values (
    p_image_id, p_user_id, p_original_filename, p_mime_type, p_size_bytes,
    p_width, p_height, 'processing', p_storage_path
  )
  returning *;
end;
$$;

revoke all on function public.create_ai_image_upload(uuid, uuid, text, text, integer, integer, integer, text)
from public, anon, authenticated;
grant execute on function public.create_ai_image_upload(uuid, uuid, text, text, integer, integer, integer, text)
to service_role;

create function public.complete_ai_image_processing(
  p_user_id uuid,
  p_image_id uuid
)
returns setof public.ai_images
language sql
security invoker
set search_path = ''
as $$
  update public.ai_images
  set status = 'ready', processed_at = now(), failure_code = null
  where id = p_image_id
    and user_id = p_user_id
    and status = 'processing'
  returning *;
$$;

revoke all on function public.complete_ai_image_processing(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.complete_ai_image_processing(uuid, uuid)
to service_role;

-- Reuse the existing private H1 bucket. Images have a separate owner-scoped
-- prefix and remain accessible only through the trusted backend.
update storage.buckets
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown',
      'image/jpeg',
      'image/png',
      'image/webp'
    ]::text[]
where id = 'engineerus-documents';
