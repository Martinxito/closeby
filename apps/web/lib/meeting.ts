// Browser helpers for the in-person meeting place (app/api/deals/[dealId]/meeting).
import { UserError } from './user-error';
import type { Wallet } from './wallet/types';

/** SHA-256 (hex) of the meeting place text: what goes on-chain instead of the place. */
export async function placeHash(venue: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new UserError('Abre Closeby desde su dirección segura (https) para reservar.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(venue.trim()));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function saveMeetingPlace(dealId: string, venue: string, wallet: Wallet): Promise<void> {
  await call('POST', dealId, wallet, { venue: venue.trim() });
}

/** The place, for the buyer and the seller only; null if it is not set yet. */
export async function fetchMeetingPlace(dealId: string, wallet: Wallet): Promise<string | null> {
  return (await call('GET', dealId, wallet)).venue;
}

async function call(method: 'GET' | 'POST', dealId: string, wallet: Wallet, body?: unknown): Promise<{ venue: string | null }> {
  const token = await wallet.getAccessToken();
  if (!token) throw new UserError('Entra para continuar.');
  const response = await fetch(`/api/deals/${dealId}/meeting`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await response.json()) as { venue: string | null } | { error: { message: string } };
  // Our route answers in Spanish, written for the user.
  if ('error' in json) throw new UserError(json.error.message);
  return json;
}
