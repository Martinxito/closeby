-- Closeby: off-chain deal metadata.
-- Run once in Supabase → SQL Editor (project "closeby"), or with `supabase db push`.
--
-- Solana is the source of truth for escrow state. This table only holds what people
-- see: title, photos, description and the exact venue. On-chain we store only the
-- SHA-256 hash of the venue. Never store personal data here (name, phone, RUT).

create table if not exists public.deals (
  -- Public deal ID used in /deals/[dealId]. It is the program's order_id (u64).
  -- Postgres has no u64 (bigint is a signed i64), so we keep it as a digit string.
  deal_id      text primary key check (deal_id ~ '^[0-9]{1,20}$'),

  -- Seller public key (base58). Needed to derive the order PDA:
  -- ["order", seller, order_id as u64 little-endian]. The deal ID alone is not enough.
  seller       text not null check (char_length(seller) between 32 and 44),

  title        text not null check (char_length(title) between 1 and 120),
  description  text not null default '' check (char_length(description) <= 2000),
  price_clp    integer not null check (price_clp > 0),
  photos       text[] not null default '{}',  -- public URLs from the "photos" bucket
  communes     text[] not null default '{}',  -- e.g. {'Providencia','Ñuñoa'}
  time_slots   jsonb  not null default '[]',  -- e.g. [{"date":"2026-11-28","from":"15:00","to":"19:00"}]

  -- Exact venue chosen by the buyer. Its SHA-256 must match the order's place_hash
  -- on-chain; the web app checks this before showing it.
  venue        text check (char_length(venue) <= 200),

  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Access (Row Level Security)
--
-- There is no Supabase login: identity is the wallet signature on Solana.
-- The "anon" role (the publishable key used by the web app) can:
--   * read any deal (the /deals/[dealId] link is public),
--   * create deals,
--   * update ONLY the "venue" column (column-level grant below).
-- It cannot delete deals or edit title, price, etc.
-- Accepted hackathon risk: anyone with the key could change a deal's venue; the web
-- app detects it because the hash would no longer match the on-chain place_hash.
-- ---------------------------------------------------------------------------

alter table public.deals enable row level security;

drop policy if exists "deals: read"         on public.deals;
drop policy if exists "deals: create"       on public.deals;
drop policy if exists "deals: update venue" on public.deals;

create policy "deals: read"         on public.deals for select to anon, authenticated using (true);
create policy "deals: create"       on public.deals for insert to anon, authenticated with check (true);
create policy "deals: update venue" on public.deals for update to anon, authenticated using (true) with check (true);

-- RLS filters rows, not columns. Postgres GRANTs limit WHICH columns can change:
-- revoke general update/delete and grant update on "venue" only.
revoke update, delete on public.deals from anon, authenticated;
grant  select, insert on public.deals to anon, authenticated;
grant  update (venue) on public.deals to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage: public bucket for item photos (max 5 MB, jpg/png/webp).
-- Public read by URL; the web app uploads with the publishable key.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "photos: upload" on storage.objects;
create policy "photos: upload" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'photos');
