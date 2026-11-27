# Closeby

Sell files (and in-person goods) with protected payment: the buyer pays into escrow first, and the seller is paid when the buyer confirms with one button.

| Path | Role |
| --- | --- |
| `apps/web` | Primary mobile-first Next.js application |
| `apps/api` | Deal metadata API (planned) |
| `solana` | [Proposed Devnet escrow interface and verification plan](solana/README.md) (in-person; digital changes in [docs/escrow-changes.md](docs/escrow-changes.md)) |
| `supabase` | Off-chain deal metadata schema (Supabase migrations) |
| `docs` | Product rules, flows, plan and decisions ([start here](docs/README.md)) |

## Web development

Use Node.js 24 and the pnpm version declared in the root package.json.

```sh
pnpm install --frozen-lockfile
pnpm --filter @closeby/web dev
pnpm --filter @closeby/web typecheck
pnpm --filter @closeby/web build
```

Open http://localhost:3000. Sellers publish at `/vender`; buyers open `/deals/[dealId]`.

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
| `WALLET_MODE` | `mock` (test users) until Privy is wired in, then `privy`. |
| `MOCK_AUTH_SECRET` | Optional. Signs mock session tokens; defaults to a secret derived from `SUPABASE_SECRET_KEY`. |
| `SOLANA_RPC_URL`, `FEE_PAYER_SECRET_KEY`, `USDC_MINT` | Devnet RPC, our fee payer and the test USDC mint. Created by the setup script below. Server-only. |

Set the same variables in the Vercel project (Production and Preview).

## Fees paid by us and test balance (Devnet)

Users never hold SOL: our server's fee payer pays fees and rent (`apps/web/lib/solana/relay.ts`). It only signs transactions the server built itself: each prepared transaction comes with a ticket (HMAC of the message), and the signed transaction is rejected if anything changed or the logged-in user did not sign it (`lib/solana/ticket.ts`).

Test USDC is our own SPL token (6 decimals). "Cargar saldo de prueba" (`POST /api/balance`) mints 500 test USDC to the user while their balance is under 100.

One-time setup (safe to re-run; writes to `apps/web/.env.local`, never prints the secret):

```sh
pnpm --filter @closeby/web setup:devnet
```

If the airdrop is refused, send Devnet SOL to the printed fee payer address at https://faucet.solana.com and run it again. Then copy the three Solana variables to Vercel.

## Escrow mock

Until the program is on Devnet, the web runs the full flow against a mock: orders live in the `mock_orders` table and `apps/web/lib/escrow/rules.ts` applies the same rules as the program ([docs/escrow-changes.md](docs/escrow-changes.md)). The mock wallet in `apps/web/lib/wallet/` creates a test user per browser, so a normal and a private window act as seller and buyer. Run the rule tests with `pnpm --filter @closeby/web test`.

## Hosted demo

For a hosted demo, import this repository into Vercel and set the Next.js project's root directory to `apps/web`. Use Solana Devnet and test tokens for the hackathon. See [the web handoff](CLOSEBY_CONTEXT.md) for the next implementation slice.

## Devnet signing spike

Open `/deals/devnet-signing` on a publicly reachable HTTPS preview of the web app.
On each physical phone, open the deal from a shared link and scan its QR to
verify both open the same URL. Then use **Abrir este
trato en Phantom**. In Phantom, switch to Solana Devnet and use a test account
with Devnet SOL for the network fee. No app environment variables are required
for this spike.

1. Tap **Firmar prueba en Phantom**, cancel, and verify the page reports cancellation.
2. Retry and approve the memo transaction. Verify the page reports **Firma de
   prueba confirmada en Devnet** and the Explorer link shows a successful Devnet
   transaction. The app checks the memo and signer against a confirmed Devnet
   transaction before displaying confirmation.
3. Reload the same deal in the same Phantom tab and verify confirmation returns.
4. Record the phone and OS, the deal URL, and the Explorer link for each run.

The memo contains a fixed test label and the transaction pays only the Devnet
network fee. This route exercises wallet approval and confirmation before the
escrow integration.
