-- Closeby: digital goods (docs/decisions/0002-digital-goods-primary.md).
-- Run after 0002 in Supabase → SQL Editor (project "closeby").
--
-- Access model is unchanged (docs/decisions/0001): only the Next.js server, with the
-- secret key, touches these tables and buckets. anon/authenticated have no privileges.

-- ---------------------------------------------------------------------------
-- 1. deals: fields for digital goods
-- ---------------------------------------------------------------------------

alter table public.deals
  add column if not exists kind text not null default 'digital'
    check (kind in ('digital', 'physical')),
  -- SHA-256 of the file, lowercase hex. Must equal the order's content_hash on-chain.
  add column if not exists content_hash text
    check (content_hash ~ '^[0-9a-f]{64}$'),
  -- Path inside the private "files" bucket. Never sent to the browser.
  add column if not exists file_path text,
  add column if not exists file_name text check (char_length(file_name) <= 200),
  add column if not exists file_size bigint check (file_size > 0),
  add column if not exists file_type text check (char_length(file_type) <= 100),
  -- Public preview (image, audio clip, first page) in the "previews" bucket.
  add column if not exists preview_url text;

-- A digital deal must say which file it sells.
alter table public.deals drop constraint if exists deals_digital_has_file;
alter table public.deals add constraint deals_digital_has_file
  check (kind <> 'digital' or (content_hash is not null and file_path is not null));

-- ---------------------------------------------------------------------------
-- 2. Storage buckets
-- ---------------------------------------------------------------------------

-- Files for sale: PRIVATE. The server hands the buyer a short-lived signed URL only
-- after the on-chain order says they unlocked it. 50 MB is the Supabase free-plan cap.
insert into storage.buckets (id, name, public, file_size_limit)
values ('files', 'files', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- Previews: PUBLIC read by URL, so <img>/<audio>/<video> work without a key.
-- Uploads only through server-issued signed upload URLs (no insert policy for anon).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('previews', 'previews', true, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'audio/mpeg', 'audio/mp4', 'video/mp4', 'application/pdf'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. mock_orders: stand-in for the Solana program until it is on Devnet
-- ---------------------------------------------------------------------------
-- Mirrors the on-chain Order account (docs/escrow-changes.md) so the web can run the
-- full flow on Vercel, across two phones, before the program exists. Rules are applied
-- in apps/web/lib/escrow/rules.ts, not here. Drop this table once the program is live.

create table if not exists public.mock_orders (
  deal_id          text primary key check (deal_id ~ '^[0-9]{1,20}$'),
  kind             text not null check (kind in ('digital', 'physical')),
  seller           text not null,
  buyer            text,
  amount           bigint not null check (amount > 0),          -- USDC base units (6 decimals)
  content_hash     text check (content_hash ~ '^[0-9a-f]{64}$'),
  status           text not null check (status in ('Created', 'Funded', 'Delivered', 'Scheduled', 'Released', 'Refunded')),
  claim_deadline   bigint,                                       -- unix seconds
  release_deadline bigint,                                       -- unix seconds
  -- Fake "transaction signature" of the last action, for the "Ver comprobante" link in mock mode.
  last_signature   text,
  updated_at       timestamptz not null default now()
);

alter table public.mock_orders enable row level security;
revoke all on public.mock_orders from anon, authenticated;
grant  all on public.mock_orders to service_role;
