# Closeby

Reserve funds before meeting, inspect the item in person, and release the payment when ready.

| Path | Role |
| --- | --- |
| `apps/web` | Primary mobile-first Next.js application |
| `apps/api` | Deal metadata API (planned) |
| `solana` | On-chain escrow program (planned) |
| `supabase` | Off-chain deal metadata schema (Supabase migrations) |
| `apps/mobile` | Expo scaffold for a possible Solana Mobile entry |

## Web development

Use Node.js 24 and the pnpm version declared in the root package.json.

```sh
pnpm install --frozen-lockfile
pnpm --filter @closeby/web dev
pnpm --filter @closeby/web typecheck
pnpm --filter @closeby/web build
```

Open http://localhost:3000. The initial `/deals/[dealId]` route is a public URL scaffold. It does not read a deal or submit transactions yet.

## Deal metadata (Supabase)

Product details, photos and the exact venue live off-chain in Supabase; Solana only stores the venue's SHA-256 hash and the escrow state.

The browser never talks to the database. Only the Next.js server reads and writes, with the secret key; the anon and authenticated roles have no privileges, so the publishable key cannot access any data.

1. In Project Settings → Data API, enable the Data API with `public` as an exposed schema.
2. Open SQL Editor and run, in order:
   - [`supabase/migrations/0001_deals.sql`](supabase/migrations/0001_deals.sql): creates the `deals` table and the `photos` storage bucket.
   - [`supabase/migrations/0002_server_only_access.sql`](supabase/migrations/0002_server_only_access.sql): removes all public access to `deals` and anonymous photo uploads.
   - [`supabase/migrations/0003_digital_goods.sql`](supabase/migrations/0003_digital_goods.sql): digital-goods fields on `deals`, the private `files` and public `previews` buckets, and the `mock_orders` table.
3. Copy `apps/web/.env.example` to `apps/web/.env.local` and fill in:

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | Project URL (`https://<project-id>.supabase.co`) |
| `SUPABASE_SECRET_KEY` | Secret key (`sb_secret_...`). Server-only: never prefix it with `NEXT_PUBLIC_`. |
| `ESCROW_MODE`, `NEXT_PUBLIC_ESCROW_MODE` | `mock` until the Solana program is on Devnet, then `chain`. Same value in both. |

Set the same variables in the Vercel project (Production and Preview).

## Escrow mock

Until the program is on Devnet, the web runs the full flow against a mock: orders live in the `mock_orders` table and `apps/web/lib/escrow/rules.ts` applies the same rules as the program ([docs/escrow-changes.md](docs/escrow-changes.md)). The mock wallet in `apps/web/lib/wallet/` creates a test user per browser, so a normal and a private window act as seller and buyer. Run the rule tests with `pnpm --filter @closeby/web test`.

## Hosted demo

For a hosted demo, import this repository into Vercel and set the Next.js project's root directory to `apps/web`. Use Solana Devnet and test tokens for the hackathon. See [the web handoff](CLOSEBY_CONTEXT.md) for the next implementation slice.
