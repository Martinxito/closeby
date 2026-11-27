'use server';

// Server half of the mock wallet: creates a test user and signs its session token.
import { signMockToken } from '../auth/mock-token';
import { walletMode } from '../auth/server';

export async function startMockSession(): Promise<{ address: string; token: string }> {
  if (walletMode() !== 'mock') throw new Error('Mock login is disabled.');
  const address = randomAddress();
  return { address, token: signMockToken(address) };
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
