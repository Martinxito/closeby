// Session tokens for the mock wallet: "<address>.<hmac>", signed with a server secret.
// They make the mock behave like the real thing (the server learns who the user is
// from a token it can verify, never from an address the browser claims), so the
// download and escrow checks are the same code in mock and Privy mode.
import 'server-only';

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

function secret(): Buffer {
  // A dedicated secret if set; otherwise derived from the Supabase secret key, which
  // is already server-only. Changing either one logs every mock user out.
  const base = process.env.MOCK_AUTH_SECRET ?? process.env.SUPABASE_SECRET_KEY;
  if (!base) throw new Error('Missing MOCK_AUTH_SECRET or SUPABASE_SECRET_KEY.');
  return createHash('sha256').update(`closeby-mock-auth:${base}`).digest();
}

function mac(address: string): string {
  return createHmac('sha256', secret()).update(address).digest('base64url');
}

export function signMockToken(address: string): string {
  return `${address}.${mac(address)}`;
}

/** The address inside a valid token, or null. */
export function verifyMockToken(token: string): string | null {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const address = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(mac(address));
  // Constant-time comparison, so the check does not leak how much of the MAC matched.
  return given.length === expected.length && timingSafeEqual(given, expected) ? address : null;
}
