# Closeby

Reserve funds before meeting, inspect the item in person, and release the payment when ready.

| Path | Role |
| --- | --- |
| `apps/web` | Primary mobile-first Next.js application |
| `apps/api` | Deal metadata API (planned) |
| `solana` | On-chain escrow program (planned) |
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

For a hosted demo, import this repository into Vercel and set the Next.js project's root directory to `apps/web`. Use Solana Devnet and test tokens for the hackathon. See [the web handoff](CLOSEBY_CONTEXT.md) for the next implementation slice.
