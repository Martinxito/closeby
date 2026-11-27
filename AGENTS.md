# Closeby

Closeby lets buyers pay into escrow and release the money with one button once they receive what they bought. Digital goods (audio, video, images, reports, files) are the primary flow; in-person sales are secondary.

## Read first

Before changing anything, read [docs/README.md](docs/README.md). The `docs/` folder holds the agreed product rules, flows, program contract, plan and decisions, and takes precedence over `CLOSEBY_CONTEXT.md`. When you change a rule, a flow or the program contract, update `docs/` in the same pull request, and record new decisions in `docs/decisions/`.

Key rules:

- Users never notice the blockchain: social login, embedded wallet, fees paid by our server, no crypto words on screen, prices in CLP ([docs/product.md](docs/product.md)).
- Confirmation is one button. Unlocking a digital file is the point of no return ([docs/flows/digital-sale.md](docs/flows/digital-sale.md)).
- Supabase is accessed only from server code with the secret key ([docs/decisions/0001-supabase-server-only.md](docs/decisions/0001-supabase-server-only.md)).

## Repository layout

- `apps/web` is the primary Next.js app for mobile browsers on iOS and Android.
- `apps/mobile` contains the retained Expo scaffold for a possible Solana Mobile entry.
- `apps/api` is reserved for the deal metadata API.
- `solana` is reserved for the escrow program and its tests.

## Payment flow

- Treat Solana as the source of truth for escrow state. Verify the transaction before showing a confirmed payment.
- Require the buyer to explicitly approve release by pressing the confirmation button; their embedded wallet signs in the background.
- Share the same public `/deals/[dealId]` URL through links and QR codes. Verify the wallet-supplied signature and the on-chain order before displaying settlement.
- Keep private keys out of the API and personal data off-chain.

## Development

- Use pnpm for JavaScript dependencies and Devnet for integration tests.
- Test link opening and Devnet wallet signing on a physical iPhone and Android.
- Keep provider secrets server-side and keep test transactions on Devnet.
- When changing escrow logic, test authorized payment release and refunds after expiry.
- Update the README when setup commands or required environment variables change.

## Commits and releases

- Write commit messages in English using Conventional Commits: `type(scope): description`. The scope is optional. Use `web`, `mobile`, `api`, or `escrow` when the change belongs to one component.
- Use `feat` for features, `fix` for bug fixes, and `docs`, `test`, `refactor`, `build`, `ci`, or `chore` for other changes. Write the description in the imperative, for example `feat(web): open deals from QR codes`.
- Mark breaking changes with `!` or a `BREAKING CHANGE:` footer and describe the migration.
- Version repository-wide releases with SemVer and tag them as `vMAJOR.MINOR.PATCH`. For stable releases, use a patch for compatible fixes, a minor for compatible features, and a major for breaking changes. During initial development, use `0.y.z` and document breaking changes in the release notes.
