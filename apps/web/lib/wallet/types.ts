// The only wallet API screens may use (docs/decisions/0003-invisible-wallet.md).
// Screens import `useWallet` from '@/lib/wallet' and never the provider SDK directly,
// so swapping the mock for Privy (block 1, Diego) touches only this folder.

export type Wallet = {
  /** True once the provider has restored any existing session. Render nothing wallet-related before. */
  ready: boolean;
  /** Base58 Solana address of the logged-in user, or null when logged out. */
  address: string | null;
  /** Something to greet the user with (email or name). Never show the address on screen. */
  label: string | null;
  /** Opens the provider's login (Google or email). Resolves when logged in. */
  login: () => Promise<void>;
  logout: () => Promise<void>;
  /**
   * Signs a serialized Solana transaction (base64) in the background, with no pop-up,
   * and returns it signed (base64). Our server adds the fee payer signature.
   * Used only in chain mode; the mock escrow does not need it.
   */
  signTransaction: (transactionBase64: string) => Promise<string>;
  /**
   * Proof of who the user is, for our own server (sent as `Authorization: Bearer <token>`).
   * An address alone proves nothing: addresses are public on-chain. Privy: its access
   * token, verified in lib/auth/server.ts. Mock: a token signed by our server at login.
   * Null when logged out.
   */
  getAccessToken: () => Promise<string | null>;
};
