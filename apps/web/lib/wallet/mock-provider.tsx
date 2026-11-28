'use client';

// Mock wallet: lets us build and demo every screen before Privy is wired in.
// "Login" asks our server for a test user (a real Devnet test keypair) and a signed
// session token, and keeps them in this browser, so two browsers (or a normal and a
// private window) act as two users. It signs real Devnet transactions in chain mode.
// Diego replaces this file with the Privy provider, keeping the Wallet type.

import { Keypair, VersionedTransaction } from '@solana/web3.js';
import { Buffer } from 'buffer';
import bs58 from 'bs58';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { startMockSession } from './mock-session';
import type { Wallet } from './types';
import { UserError } from '../user-error';

// v3: sessions now carry a Devnet test keypair (older sessions are logged out).
const STORAGE_KEY = 'closeby.mockWallet.v3';
const WalletContext = createContext<Wallet | null>(null);

type StoredUser = { address: string; label: string; token: string; secretKey: string };

export function WalletProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<StoredUser | null>(null);

  // Restore the session after mount (localStorage does not exist on the server).
  useEffect(() => {
    setUser(readStored());
    setReady(true);
  }, []);

  const login = useCallback(async () => {
    const label = window.prompt('Modo de prueba: ¿cómo te llamas?')?.trim() || 'Invitado';
    const session = await startMockSession();
    const next = { ...session, label };
    writeStored(next);
    setUser(next);
  }, []);

  const logout = useCallback(async () => {
    writeStored(null);
    setUser(null);
  }, []);

  const secretKey = user?.secretKey ?? null;
  // Signs in the background with the test keypair, like an embedded wallet: no pop-up.
  // Only the user's own signature is added; our server adds the fee payer's.
  const signTransaction = useCallback(
    async (transactionBase64: string): Promise<string> => {
      if (!secretKey) throw new UserError('Entra para continuar.');
      const tx = VersionedTransaction.deserialize(Buffer.from(transactionBase64, 'base64'));
      tx.sign([Keypair.fromSecretKey(bs58.decode(secretKey))]);
      return Buffer.from(tx.serialize()).toString('base64');
    },
    [secretKey],
  );

  const token = user?.token ?? null;
  const getAccessToken = useCallback(async () => token, [token]);

  const wallet = useMemo<Wallet>(
    () => ({
      ready,
      address: user?.address ?? null,
      label: user?.label ?? null,
      login,
      logout,
      signTransaction,
      getAccessToken,
    }),
    [ready, user, login, logout, signTransaction, getAccessToken],
  );

  return <WalletContext.Provider value={wallet}>{children}</WalletContext.Provider>;
}

export function useWallet(): Wallet {
  const wallet = useContext(WalletContext);
  if (!wallet) throw new Error('useWallet must be used inside <WalletProvider>.');
  return wallet;
}

function readStored(): StoredUser | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredUser) : null;
  } catch {
    return null; // private mode or blocked storage: start logged out
  }
}

function writeStored(user: StoredUser | null): void {
  try {
    if (user) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable: the session lasts until the tab closes.
  }
}
