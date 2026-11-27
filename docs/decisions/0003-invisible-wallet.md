# 0003: Users never see a wallet

- **Status:** Accepted, 27 Nov 2026. **Provider: Privy** (Pollar ruled out the same night; see "Provider choice").

## Context

Users must not notice the blockchain: no wallet install, no seed phrase, no SOL, no signing pop-ups. The original plan used Phantom through Solana Wallet Adapter, which requires all of that.

## Decision

1. **Login with Google or email** creates an embedded wallet for the user, held by a wallet provider. No seed phrase.
2. **We pay the fees.** A fee-payer key on our server (Vercel env var, never in the browser) pays transaction fees and rent. Users never hold SOL.
3. **Confirmation is one button.** The user's embedded wallet signs in the background. No QR/NFC confirmation.
4. **Demo balance:** a "Cargar saldo de prueba" button sends Devnet test USDC to the user. Amounts are shown in CLP.
5. Phantom and other external wallets may remain as an optional "advanced" login, never the default.

## Provider choice

The program needs users to sign **our own Anchor instructions** (`fund`, `open_delivery`, `confirm_handover`, …) with **our server as fee payer**, without any pop-up. Research on 27 Nov:

| Provider | Solana embedded wallet (Google/email) | Signs arbitrary program instructions | Sponsored fees | Notes |
| --- | --- | --- | --- | --- |
| **Pollar** (`@pollar/react`, `@pollar/core` 0.12.x) | Yes, Pollar-managed; Test mode = Devnet | **Not documented.** Solana is limited to `sendPayment`, swaps and bridge; low-level `buildTx`/`signTx`/`submitTx` are marked "n/a" for Solana | Only for SOL/SPL transfers and swaps, via a GAS wallet in their dashboard | Hackathon partner track. No Chile/CLP ramp. API v1 retires 30 Nov. |
| **Privy** | Yes | Yes (sign any transaction) | Yes, by setting our own fee payer on the transaction | Fallback with the lowest integration risk. |

**Pollar ruled out (source code, `pollar-xyz/pollar` main, 27 Nov):**

- Pollar-managed Solana wallets are co-signed by Pollar. The co-signer (`packages/core/src/cosign/solana.ts`) only approves transaction shapes it recognizes: SOL/SPL transfers, Jupiter/Titan swaps, Circle CCTP burns and Earn. Anything else is "not recognized" and "not approved", so our escrow instructions would be refused.
- `signSolanaTransaction` (`packages/core/src/client/client.ts`) signs arbitrary transactions only with an **external** wallet (Phantom, Solflare, Backpack), and the wallet shows its own approval prompt. That breaks rule 1 (no visible wallet).
- We could not get an answer from the Pollar team in time. Bending the program to fit (e.g. a server key acting for the buyer) would break "nobody can move the money outside the rules", so we did not.

**Decision:** use **Privy** embedded Solana wallets. Verify in the block 1 spike: Google/email login, signing a transaction with our server as fee payer and no UI prompt, on iPhone and Android. Pollar's partner track is dropped unless they ship custom-instruction support.

To keep the choice cheap, the web wraps the provider behind one module (`apps/web/lib/wallet/`) exposing `login()`, `logout()`, `useUser()` and `signTransaction(tx)`. Screens never import the provider directly.

## Sources

- https://github.com/pollar-xyz/pollar
- https://docs.pollar.xyz/docs/core-concepts/chain-support
- https://docs.pollar.xyz/docs/operator-guide/wallets/sponsorship
