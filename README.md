# Closeby

Reserve funds before meeting, inspect the item in person, and release the payment when ready.

| Path | Role |
| --- | --- |
| `apps/mobile` | Expo app based on the official Solana Mobile template |
| `apps/api` | Deal metadata API (planned) |
| `solana` | On-chain escrow program (planned) |

## Android development

From the repository root, run `pnpm install`. From `apps/mobile`, follow the mobile README to install a development build and start Metro. Use a physical Android device to test wallet signing and NFC.

To use EAS Build, run these commands from `apps/mobile`:

```sh
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest build --platform android --profile development
pnpm exec expo start --dev-client
```

Install the APK from the build link on your Android phone and scan the Metro QR code. The mobile workspace starts from the official `expo-kit-wallet` template (Apache-2.0).
