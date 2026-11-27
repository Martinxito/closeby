-- Closeby: close all public access to deal metadata.
-- Run after 0001_deals.sql in Supabase → SQL Editor (project "closeby").
--
-- After this migration the browser never talks to the database. Only the Next.js
-- server reads and writes, using the secret key (service_role), which bypasses RLS.
-- The publishable/anon key can still reach the Data API but has no privileges, so a
-- leaked or public key cannot read, create, edit or delete anything.
-- Writes will be validated on the server (wallet signature for new deals, on-chain
-- place_hash for the venue) before touching the table.

-- 1. deals: remove the public policies and every privilege for anon/authenticated.
--    RLS stays enabled with no policies, which denies everything to those roles
--    even if a grant is added by mistake later.
drop policy if exists "deals: read"         on public.deals;
drop policy if exists "deals: create"       on public.deals;
drop policy if exists "deals: update venue" on public.deals;

alter table public.deals enable row level security;
revoke all on public.deals from anon, authenticated;
grant  all on public.deals to service_role;

-- 2. Future tables in public: Supabase grants anon/authenticated access to new tables
--    by default. Turn that off for objects created by "postgres" (the SQL Editor role),
--    so a new table is private until someone grants access on purpose.
alter default privileges for role postgres in schema public revoke all on tables    from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;

-- 3. Storage: no more anonymous uploads. The server will hand out one-time signed
--    upload URLs instead. The bucket stays public for reading, so photo URLs work
--    in <img> tags without a key.
drop policy if exists "photos: upload" on storage.objects;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
