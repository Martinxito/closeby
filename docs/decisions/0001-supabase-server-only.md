# 0001: Supabase is accessed only from the Next.js server

- **Status:** Accepted, 27 Nov 2026. Implemented in PR #3.
- **Owner:** Martín

## Context

Off-chain metadata (titles, previews, files, meeting places) lives in Supabase. The first version let the browser use the publishable key with RLS policies. That allowed anyone with the key to create fake deals, change a deal's venue and upload files.

## Decision

- The browser never talks to the database. Only server code (`apps/web/lib/supabase.ts`, which imports `server-only`) uses the **secret key** (`SUPABASE_SECRET_KEY`).
- `anon` and `authenticated` have **no privileges** on `deals` (`supabase/migrations/0002_server_only_access.sql`). New tables in `public` are private by default.
- Every write is validated on the server against the chain before touching the table (seller owns the on-chain order, hashes match, the buyer is the on-chain buyer).
- Uploads use one-time signed URLs issued by the server. Files for sale live in a private bucket.

## Consequences

- Env vars are `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (no `NEXT_PUBLIC_`), locally and in Vercel.
- Any Supabase access from a `'use client'` component fails the build. Client-safe helpers go in `apps/web/lib/format.ts` or similar.
- Verified on 27 Nov: with the publishable key, select/insert/update/delete on `deals` and uploads to `photos` are denied.
