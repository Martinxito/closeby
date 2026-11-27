# Product

Closeby lets two people close a sale with the money held safely until the buyer is happy. The buyer pays, the money is held by a Solana program that nobody can move outside its rules, and the seller is paid when the buyer presses a button. If something fails, the rules return the money automatically. **Money is never stuck.**

Built for the Dev3pack Hackathon (Solana), Santiago hub, 27–29 November 2026. Submission: Saturday 28, 23:00 (hard close Sunday 29, 04:00, Chile time).

## What can be sold

| Kind | Examples | Status |
| --- | --- | --- |
| **Digital goods** | Audio, video, images, reports, any file | **Primary demo flow.** See [flows/digital-sale.md](flows/digital-sale.md). |
| In-person sales | Items from Marketplace, Yapo or Instagram, handed over at a meeting point | Secondary. Same program, built if time allows. |

Out of scope: shipping, disputes with a mediator, NFC.

## Who it is for

- **Sellers** of files (producers, photographers, designers, analysts) who are tired of buyers who never pay after receiving the file, or who ask for the file first.
- **Buyers** who don't want to pay a stranger upfront and receive nothing, or the wrong file.

## UX rules (non-negotiable)

1. **The user never notices the blockchain.** No wallet install, no seed phrase, no SOL, no signing pop-ups. Login with Google or email. Fees are paid by us. See [decisions/0003-invisible-wallet.md](decisions/0003-invisible-wallet.md).
2. **No crypto words on screen.** Say "plata reservada", "pago protegido", "trato cerrado". Never "wallet", "SOL", "USDC", "transacción", "token", "firma". The only exception is a small "Ver comprobante" link to Solana Explorer on the closed deal.
3. **Prices in CLP.** Fixed demo rate: 1 USDC = 950 CLP. On-chain amounts are USDC with 6 decimals.
4. **Confirmation is one button.** "Recibí el archivo: pagar al vendedor". No QR or NFC confirmation. (QR is only a way to share the deal link.)
5. **Mobile first, Chilean Spanish**, large buttons, one main action per screen.
6. **Personal data never goes on-chain.** On-chain we store only hashes (file content, meeting place) and amounts.

## Where data lives

| Data | Where | Who can access |
| --- | --- | --- |
| Escrow state, amounts, deadlines, content hash | Solana program (Devnet) | Public; source of truth for money |
| Title, description, price in CLP, preview | Supabase `deals` table and public `photos`/preview storage | Read through our server |
| The file being sold | Supabase private storage | Only the buyer, via a short-lived signed URL, after the program says they may |
| Keys | Wallet provider (users) and Vercel env vars (our fee payer, Supabase secret) | Never in the browser, never in the repo |
