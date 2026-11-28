# Flow: digital sale (primary demo)

The seller sells a file. The buyer pays into escrow, unlocks the file, and confirms with one button. Rules decide every other outcome.

## Steps

| # | Who | Screen and button (UI text) | What happens |
| --- | --- | --- | --- |
| 1 | Seller | `/vender`: title, description, price in CLP, file, preview → **"Publicar"** | Server stores the file in **private** storage, computes its SHA-256, makes a preview (or takes the seller's), and stores metadata in `deals`. Seller's invisible wallet signs `create_order(kind = Digital, amount, content_hash)`. Server only saves the deal after it sees the order on-chain with that seller and hash. |
| 2 | Seller | Share screen → **"Copiar link"** / QR | Link: `/deals/[dealId]`. |
| 3 | Buyer | `/deals/[dealId]`: preview, price, seller → **"Comprar con pago protegido"** | Login (Google/email) if needed. Buyer signs `fund`. USDC moves into the order vault. Status `Funded`. Copy: "Tu plata está reservada. El vendedor recibe el pago solo cuando confirmes." |
| 4 | Buyer | **"Desbloquear archivo"** | Buyer signs `open_delivery`. Status `Delivered`, review deadline starts. Server checks the on-chain status and buyer, then returns a short-lived signed download URL. Copy before pressing: "Al desbloquear el archivo ya no podrás cancelar." |
| 5 | Buyer | **"Recibí el archivo: pagar al vendedor"** | Buyer signs `confirm_handover`. Vault pays the seller. Status `Released`. Screen: "✅ Trato hecho". |

## Rules (agreed 27 Nov)

| Situation | Outcome | Instruction |
| --- | --- | --- |
| Buyer paid but has **not** unlocked the file, and cancels | Full refund to the buyer | `buyer_cancel` |
| Buyer paid, never unlocked, and the claim window expires | Full refund to the buyer (anyone can trigger) | `refund_after_deadline` |
| Buyer **unlocked** the file and confirms | Seller is paid | `confirm_handover` |
| Buyer **unlocked** the file and does nothing until the review deadline | **Seller is paid** (anyone can trigger) | `release_after_deadline` |
| Buyer unlocked the file and is unhappy | No refund in this version (disputes are out of scope). The UI says so before unlocking. | — |

Why: once the file is downloaded it cannot be "returned". Unlocking is the point of no return, so it is an explicit, signed buyer action, and the preview exists so the buyer can judge before paying.

## Status shown to users

| On-chain status | Buyer sees | Seller sees |
| --- | --- | --- |
| `Created` | "Comprar con pago protegido" | "Esperando comprador" + link |
| `Funded` | "Plata reservada" + "Desbloquear archivo" + "Cancelar compra" | "Un comprador reservó $X. Se te paga cuando confirme." |
| `Delivered` | Download + "Recibí el archivo: pagar al vendedor" + countdown | "El comprador ya tiene el archivo. Se te paga al confirmar o el [fecha]." |
| `Released` | "✅ Trato hecho" | "✅ Te pagaron $X" |
| `Refunded` | "Te devolvimos tu plata" | "La compra se canceló" |

Show pending, confirmed and failed states distinctly. Never show "paid" from a wallet callback alone: re-read the order on-chain.

## Server checks (Next.js, never trust the browser)

- **Who is calling** comes from a session token verified on the server (`apps/web/lib/auth/server.ts`): Privy's access token, or a server-signed token in mock mode. Never from an address in the request body: addresses are public on-chain.

- Save a deal only if the on-chain order exists, `seller` matches and `content_hash` equals the SHA-256 of the stored file.
- Hand out a download URL (`POST /api/deals/[dealId]/download`) only if the on-chain order is `Delivered` or `Released` and the logged-in user's wallet is the order's `buyer`. URLs expire in minutes.
- The file is never in a public bucket and never in the client bundle.
- The preview **is** public (anyone can see and save it before paying). The seller is told to upload only a sample, and a preview identical to the file (same SHA-256) is deleted and the sale refused. Audio/video players hide the download button; that is only a deterrent.
