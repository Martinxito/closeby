'use client';

// Mock wallet: lets us build and demo every screen before Privy is wired in.
// "Login" creates a random address and keeps it in this browser, so two browsers
// (or a normal and a private window) act as two different users.
// Diego replaces this file with the Privy provider, keeping the Wallet type.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Wallet } from './types';

const STORAGE_KEY = 'closeby.mockWallet';
const WalletContext = createContext<Wallet | null>(null);

type StoredUser = { address: string; label: string };

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
    const next = { address: randomAddress(), label };
    writeStored(next);
    setUser(next);
  }, []);

  const logout = useCallback(async () => {
    writeStored(null);
    setUser(null);
  }, []);

  const signTransaction = useCallback(async (): Promise<string> => {
    throw new Error('The mock wallet cannot sign real transactions. Use ESCROW_MODE=mock.');
  }, []);

  const wallet = useMemo<Wallet>(
    () => ({ ready, address: user?.address ?? null, label: user?.label ?? null, login, logout, signTransaction }),
    [ready, user, login, logout, signTransaction],
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

/** A random 32-byte key encoded in base58, shaped like a real Solana address. */
function randomAddress(): string {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = '';
  while (n > 0n) {
    out = alphabet[Number(n % 58n)] + out;
    n /= 58n;
  }
  return out.padStart(32, '1');
}
