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

1. In the Supabase dashboard, open SQL Editor and run [`supabase/migrations/0001_deals.sql`](supabase/migrations/0001_deals.sql). It creates the `deals` table, its RLS policies and the public `photos` storage bucket.
2. Copy `apps/web/.env.example` to `apps/web/.env.local` and fill in the values from Project Settings → API.

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable (anon) key. Never use the service_role key in the web app. |

Set the same variables in the Vercel project.

## Hosted demo

For a hosted demo, import this repository into Vercel and set the Next.js project's root directory to `apps/web`. Use Solana Devnet and test tokens for the hackathon. See [the web handoff](CLOSEBY_CONTEXT.md) for the next implementation slice.
