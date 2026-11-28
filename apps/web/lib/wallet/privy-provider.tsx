'use client';

// Privy: login with email or Google, and a Solana embedded wallet created on first login.
// The user never installs anything, never sees a seed phrase and never approves a pop-up:
// transactions are signed in the background (showWalletUIs: false) and our server adds
// the fee payer's signature (lib/solana/relay.ts). Screens use the same `Wallet` shape
// as the mock (./types.ts), so nothing else changes.

import { PrivyProvider, usePrivy } from '@privy-io/react-auth';
import { useSignTransaction, useWallets } from '@privy-io/react-auth/solana';
import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { useCallback, useMemo, type ReactNode } from 'react';
import { UserError } from '../user-error';
import { WalletContext } from './context';
import type { Wallet } from './types';

export function PrivyWalletProvider({ children }: { children: ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) throw new Error('Missing NEXT_PUBLIC_PRIVY_APP_ID. See apps/web/.env.example.');

  return (
    <PrivyProvider
      appId={appId}
      config={{
        // Email first: Google blocks its login inside Instagram/WhatsApp in-app browsers,
        // which is where shared deal links usually open.
        loginMethods: ['email', 'google'],
        appearance: { theme: 'light', accentColor: '#4d47a7', showWalletLoginFirst: false },
        embeddedWallets: {
          solana: { createOnLogin: 'users-without-wallets' },
          ethereum: { createOnLogin: 'off' },
          // No confirmation modals: the buttons in our screens are the confirmation.
          showWalletUIs: false,
        },
      }}
    >
      <PrivyWalletBridge>{children}</PrivyWalletBridge>
    </PrivyProvider>
  );
}

/** Adapts Privy's hooks to our `Wallet` interface. */
function PrivyWalletBridge({ children }: { children: ReactNode }) {
  const privy = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { signTransaction: privySign } = useSignTransaction();

  // The Solana embedded wallet Privy created for this user (the only wallet we enable).
  const embedded = wallets[0] ?? null;
  const address = privy.authenticated ? (embedded?.address ?? null) : null;
  const label = privy.user?.email?.address ?? privy.user?.google?.email ?? null;

  const login = useCallback(async () => privy.login(), [privy]);
  const logout = useCallback(async () => privy.logout(), [privy]);

  const signTransaction = useCallback(
    async (transactionBase64: string): Promise<string> => {
      if (!embedded) throw new UserError('Entra para continuar.');
      const unsigned = Buffer.from(transactionBase64, 'base64');
      const { signedTransaction } = await privySign({
        transaction: new Uint8Array(unsigned),
        wallet: embedded,
        chain: 'solana:devnet',
        options: { uiOptions: { showWalletUIs: false } },
      });

      // Privy returns the whole signed transaction; some wallets return only the 64-byte
      // signature. Handle both: in that case, put the signature in the user's slot.
      if (signedTransaction.length === 64) {
        const tx = VersionedTransaction.deserialize(unsigned);
        const index = tx.message.staticAccountKeys.findIndex((k) => k.equals(new PublicKey(embedded.address)));
        if (index < 0) throw new Error('The user is not a signer of this transaction.');
        tx.signatures[index] = signedTransaction;
        return Buffer.from(tx.serialize()).toString('base64');
      }
      return Buffer.from(signedTransaction).toString('base64');
    },
    [embedded, privySign],
  );

  // Privy's access token (refreshed by the SDK). Our server verifies it and looks up
  // this user's embedded wallet (lib/auth/privy.ts).
  const getAccessToken = useCallback(async () => (privy.authenticated ? privy.getAccessToken() : null), [privy]);

  const wallet = useMemo<Wallet>(
    () => ({
      // Logged-out users are "ready" as soon as the SDK is; logged-in users once their wallet loads.
      ready: privy.ready && (!privy.authenticated || (walletsReady && address !== null)),
      address,
      label,
      login,
      logout,
      signTransaction,
      getAccessToken,
    }),
    [privy.ready, privy.authenticated, walletsReady, address, label, login, logout, signTransaction, getAccessToken],
  );

  return <WalletContext.Provider value={wallet}>{children}</WalletContext.Provider>;
}
