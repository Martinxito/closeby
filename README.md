# Closeby

Reserve funds before meeting, inspect the item in person, and release the payment when ready.

| Path | Role |
| --- | --- |
| `apps/web` | Primary mobile-first Next.js application |
| `apps/api` | Deal metadata API (planned) |
| `solana` | [Proposed Devnet escrow interface and verification plan](solana/README.md) |

## Web development

Use Node.js 24 and the pnpm version declared in the root package.json.

```sh
pnpm install --frozen-lockfile
pnpm --filter @closeby/web dev
pnpm --filter @closeby/web typecheck
pnpm --filter @closeby/web build
```

Open http://localhost:3000. The initial `/deals/[dealId]` route is a public URL scaffold. It does not read a deal or submit transactions yet.

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
