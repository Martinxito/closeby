# Plan until submission

Updated: Friday 27 Nov, 20:00 (Chile). Submission: **Saturday 28, 23:00**. Feature freeze: **Saturday 20:00**.

## Done

- Next.js app in `apps/web`, deployed on Vercel.
- Supabase `deals` table, server-only access ([decisions/0001](decisions/0001-supabase-server-only.md)). `/deals/[dealId]` reads a deal.
- CI on every pull request (typecheck and build).
- Product decisions: digital goods first ([0002](decisions/0002-digital-goods-primary.md)), invisible wallet ([0003](decisions/0003-invisible-wallet.md)).

## Biggest risks

1. **The program is not on Devnet yet** (`solana/` is empty). The web builds against a mock with the same interface (`apps/web/lib/escrow/`), swapped for the real client when the IDL arrives.
2. **Embedded wallet (Privy)** not yet proven on real phones with our fee payer. Spike first in block 1, hidden behind `apps/web/lib/wallet/`.

## Blocks

| Block | Martín (seller and server) | Diego (buyer and wallet) | Program (Alex, Aaron) |
| --- | --- | --- | --- |
| **1. Fri 20:00–22:30** | ✅ Shared base: `lib/escrow` (types, rules with tests, mock backed by `mock_orders`), `lib/wallet` interface + mock wallet, migration `0003` (digital fields, private `files`, public `previews`) | Privy spike behind `lib/wallet`: Google login + signing with our fee payer, no pop-up, on iPhone and Android | Agree on [escrow-changes.md](escrow-changes.md) |
| **2. Fri 22:30–01:00** | ✅ `/vender`: upload file, hash, preview, publish (mock), share link and QR | `/deals/[id]`: preview, buy (mock), status timeline per role | `create_order`, `fund`, `open_delivery` |
| **3. Sat 09:00–13:00** | ✅ (done Fri night) Server identity from session tokens; deal saved only if the order matches; buyer-only 5-minute download links; seller status page | Unlock, download, "Recibí el archivo" button, cancel, deadline actions, "Ver comprobante" | `confirm_handover`, deadlines, tests; deploy to Devnet, `init_config` |
| Sat 10:00–12:00 | Feedback session: show the full mocked flow | | |
| Sat 13:00 | **Sync:** IDL + program ID + mint. Decide in-person flow and AI agent (only if block 4 looks safe) | | |
| **4. Sat 13:00–18:00** | ✅ (done Fri night) Fee payer relay and test balance button. Pending: swap mock for the real program | End-to-end on Devnet with two accounts and two phones | Fix what integration finds |
| **5. Sat 18:00–20:00** | Error and pending states, no crypto words, CLP everywhere | Mobile polish, empty states | README program section, addresses |
| **6. Sat 20:00–23:00** | Freeze. README (problem, flow diagram, setup, program addresses, partner integration file), video (under 3 min), Dev3pack form, open every link in a private window, submit | | |

## Checkpoints

- **Fri 22:30:** login + signature works on a real phone; escrow-changes agreed.
- **Sat 10:00:** full digital flow works on mocks, on Vercel.
- **Sat 13:00:** program on Devnet with IDL.
- **Sat 18:00:** full digital flow on Devnet, two accounts.
- **Sat 20:00:** freeze.
