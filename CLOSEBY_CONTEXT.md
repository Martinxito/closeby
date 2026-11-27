# Closeby web handoff

> **Partly superseded (27 Nov):** digital goods are now the primary flow and users never see a wallet (no Phantom by default). See [docs/README.md](docs/README.md), which takes precedence over this file.

Closeby is a mobile-first web app for in-person secondhand sales. The seller shares a link, the buyer funds the deal and proposes a meeting, the seller accepts, and the buyer releases payment after inspecting the item. The same URL opens from chat or from a QR code. Target iPhone and Android browsers, with everyday Chilean Spanish in the UI and English in code, documentation, and commits.

## Start with a signing spike

Read AGENTS.md and README.md. Verify a Devnet signature from the web flow on a physical iPhone and Android before building the full checkout. With Phantom, test opening the actual deal URL in its mobile in-app browser. Verify wallet cancellation, reloading the same deal, and independently reading the confirmed outcome. Keep all signing in the user's wallet.

## Implement the first complete deal

1. Agree with the program and API owners on the public deal ID, order PDA mapping, Devnet program address, IDL, test mint, and state transitions.
2. Implement seller creation and sharing, buyer funding and meeting proposal, seller acceptance, buyer release, and an eligible timeout refund. Link and QR should encode the same `/deals/[dealId]` URL.
3. Keep product details and exact venue off-chain. Derive funding and settlement status from the Solana program. Display pending, confirmed, and failed states distinctly. Never treat a screenshot or a wallet callback alone as confirmation.
4. Test two wallets, the two phone platforms, and a second deal that refunds after expiry. Keep a visible Devnet indicator and use test funds. Only offer actions permitted for the connected wallet and current order state.
5. Deploy the functional web flow to a public URL. Document setup, program addresses and the demo steps in the README. Preserve the Android Expo scaffold if the team pursues Solana Mobile separately.

Keep NFC, shipping, disputes, Pollar and AI integrations outside this first slice. Follow the Conventional Commits and SemVer policy in AGENTS.md.
