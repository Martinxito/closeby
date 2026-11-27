// Who is calling? Server-only. Every route that depends on the user (downloads, escrow
// actions in mock mode) must get the address from here, never from the request body.
//
// WALLET_MODE selects how tokens are verified:
//   - "mock" (default): tokens signed by our server at mock login (./mock-token.ts).
//   - "privy": Privy access tokens. Diego wires this in with the Privy provider:
//     verify the token with Privy's server SDK and return the user's Solana address.
import 'server-only';

import { verifyMockToken } from './mock-token';

export function walletMode(): 'mock' | 'privy' {
  return process.env.WALLET_MODE === 'privy' ? 'privy' : 'mock';
}

/** Address of the authenticated user, or null if the request has no valid token. */
export async function authenticate(request: Request): Promise<string | null> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  return authenticateToken(token);
}

/** Same as `authenticate`, for Server Actions, which receive the token as an argument. */
export async function authenticateToken(token: string | null | undefined): Promise<string | null> {
  if (!token) return null;

  if (walletMode() === 'privy') {
    // TODO(Diego, Privy): verify `token` with Privy's server SDK and return the
    // linked Solana embedded wallet address. Until then, fail closed.
    return null;
  }
  return verifyMockToken(token);
}
