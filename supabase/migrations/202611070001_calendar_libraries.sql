-- One private library per account. Device-only calendars remain in the browser.
-- Run in the Supabase SQL Editor as the project administrator.
begin;

create table public.calendar_libraries (
  user_id uuid primary key references auth.users(id) on delete cascade,
  calendars jsonb not null default '[]'::jsonb,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  constraint calendars_is_array check (jsonb_typeof(calendars) = 'array'),
  constraint calendars_count check (jsonb_array_length(calendars) <= 200),
  constraint calendars_size check (octet_length(calendars::text) <= 2097152)
);

alter table public.calendar_libraries enable row level security;

revoke all on public.calendar_libraries from anon, authenticated;
grant select, insert, update, delete on public.calendar_libraries to authenticated;

create policy "Read own calendar library"
on public.calendar_libraries for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Create own calendar library"
on public.calendar_libraries for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Update own calendar library"
on public.calendar_libraries for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Delete own calendar library"
on public.calendar_libraries for delete to authenticated
using ((select auth.uid()) = user_id);

-- A client updates with WHERE revision = <last loaded revision>, preventing
-- stale devices from silently overwriting a newer library. Zero updated rows
-- means the client must reload/merge and retry; it must not blindly upsert.
create function public.advance_calendar_library_revision()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.advance_calendar_library_revision() from public;
create trigger advance_calendar_library_revision
before update on public.calendar_libraries
for each row execute function public.advance_calendar_library_revision();

commit;

-- Verification (read-only): expect rowsecurity=true and four owner policies.
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename = 'calendar_libraries';
select policyname, cmd, roles, qual, with_check from pg_policies
where schemaname = 'public' and tablename = 'calendar_libraries';
