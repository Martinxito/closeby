'use client';

// Shared by every wallet provider (mock and Privy): screens call `useWallet()` and get
// the same `Wallet` shape whichever provider is mounted.
import { createContext, useContext } from 'react';
import type { Wallet } from './types';

export const WalletContext = createContext<Wallet | null>(null);

export function useWallet(): Wallet {
  const wallet = useContext(WalletContext);
  if (!wallet) throw new Error('useWallet must be used inside <WalletProvider>.');
  return wallet;
}
