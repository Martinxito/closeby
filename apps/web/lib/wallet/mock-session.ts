'use server';

// Server half of the mock wallet: creates a test user with a real Devnet keypair and
// signs its session token.
//
// The keypair is real so chain mode can be tested end to end before Privy: the browser
// signs transactions with it, like an embedded wallet would. It is a throwaway Devnet
// test key that lives only in this user's browser. Disabled when WALLET_MODE=privy.
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { signMockToken } from '../auth/mock-token';
import { walletMode } from '../auth/server';

export async function startMockSession(): Promise<{ address: string; secretKey: string; token: string }> {
  if (walletMode() !== 'mock') throw new Error('Mock login is disabled.');
  const keypair = Keypair.generate();
  const address = keypair.publicKey.toBase58();
  return { address, secretKey: bs58.encode(keypair.secretKey), token: signMockToken(address) };
}
