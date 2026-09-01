-- These functions are invoked only by database triggers. No Data API role
-- needs direct EXECUTE, and leaving the PostgreSQL default PUBLIC grant in
-- place would expose their SECURITY DEFINER privileges as RPC endpoints.
--
-- Their bodies already use fully qualified relation/function names. Reassert
-- the empty search_path here so the hardening is reproducible from migrations
-- even if an older environment was configured manually.
alter function public.handle_new_auth_user()
set search_path = '';

alter function public.handle_new_user_progress()
set search_path = '';

revoke all on function public.handle_new_auth_user()
from public, anon, authenticated;

revoke all on function public.handle_new_user_progress()
from public, anon, authenticated;
