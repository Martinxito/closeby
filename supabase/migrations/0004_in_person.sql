-- Closeby: in-person sales (docs/in-person-proposal.md).
-- Run after 0003 in Supabase → SQL Editor (project "closeby").
--
-- `deals` already has what in-person sales need since 0001: communes, time_slots
-- (the seller's availability) and venue (the exact meeting place, set by the buyer).
-- The venue is only saved after the server checks its SHA-256 against the order's
-- place_hash, and only the buyer and the seller can read it.

-- mock_orders mirrors the on-chain Order, which already reserves these fields.
alter table public.mock_orders
  add column if not exists meeting_time    bigint,                                     -- unix seconds
  add column if not exists place_hash      text check (place_hash ~ '^[0-9a-f]{64}$'), -- SHA-256 of the venue
  add column if not exists accept_deadline bigint;                                     -- unix seconds
