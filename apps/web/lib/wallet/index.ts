// Public wallet API for screens. NEXT_PUBLIC_WALLET_MODE picks the provider:
//   - "privy": email/Google login with a Solana embedded wallet (./privy-provider.tsx)
//   - anything else: the test wallet (./mock-provider.tsx)
// It must match the server's WALLET_MODE, which decides how session tokens are verified.
// It is public on purpose: it only says which login to show, it is not a secret.
import { MockWalletProvider } from './mock-provider';
import { PrivyWalletProvider } from './privy-provider';

export const WalletProvider = process.env.NEXT_PUBLIC_WALLET_MODE === 'privy' ? PrivyWalletProvider : MockWalletProvider;
export { useWallet } from './context';
export type { Wallet } from './types';
