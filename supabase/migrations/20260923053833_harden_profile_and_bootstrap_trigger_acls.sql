revoke execute
on function public.handle_new_auth_user()
from service_role;

revoke execute
on function public.handle_new_user_progress()
from service_role;

revoke update
on table public.profiles
from service_role;
