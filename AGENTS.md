# Closeby

Closeby lets buyers reserve funds before an in-person sale and release them after inspecting the item.

## Repository layout

- `apps/mobile` contains the Expo app based on the official Solana Mobile template.
- `apps/api` is reserved for the deal metadata API.
- `solana` is reserved for the escrow program and its tests.

## Payment flow

- Treat Solana as the source of truth for escrow state. Verify the transaction before showing a confirmed payment.
- Require the buyer to explicitly approve release with their wallet.
- Have QR and NFC open the same deal screen using a deal identifier.
- Keep private keys out of the API and personal data off-chain.

## Development

- Use pnpm for JavaScript dependencies and Devnet for integration tests.
- Use an Android development build to test wallet signing and physical phones to test NFC.
- When changing escrow logic, test authorized payment release and refunds after expiry.
- Update the README when setup commands or required environment variables change.

## Commits and releases

- Write commit messages in English using Conventional Commits: `type(scope): description`. The scope is optional. Use `mobile`, `api`, or `escrow` when the change belongs to one component.
- Use `feat` for features, `fix` for bug fixes, and `docs`, `test`, `refactor`, `build`, `ci`, or `chore` for other changes. Write the description in the imperative, for example `feat(mobile): open deals from QR codes`.
- Mark breaking changes with `!` or a `BREAKING CHANGE:` footer and describe the migration.
- Version repository-wide releases with SemVer and tag them as `vMAJOR.MINOR.PATCH`. For stable releases, use a patch for compatible fixes, a minor for compatible features, and a major for breaking changes. During initial development, use `0.y.z` and document breaking changes in the release notes.
