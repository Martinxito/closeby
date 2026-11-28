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

// Paying (on-chain) and saving the place (our server) are two requests. If the connection
// drops between them, the buyer has paid but the seller does not know where to meet. So
// the buyer's browser keeps the place until the server has it, and retries from there.
// localStorage, not sessionStorage: it survives closing the tab or the in-app browser.
const pendingKey = (dealId: string) => `closeby:pending-place:${dealId}`;

/** Keeps the place in this browser until the server confirms it saved it. */
export function rememberPendingPlace(dealId: string, venue: string): void {
  try {
    localStorage.setItem(pendingKey(dealId), venue.trim());
  } catch {
    // Storage blocked (private mode): the first save attempt is all we get.
  }
}

/**
 * Saves the place kept in this browser, if it matches the order's on-chain hash.
 * Returns the saved place, or null if this browser has no matching place.
 */
export async function savePendingPlace(dealId: string, expectedHash: string, wallet: Wallet): Promise<string | null> {
  const venue = readPendingPlace(dealId);
  if (!venue) return null;
  if ((await placeHash(venue)) !== expectedHash) {
    forgetPendingPlace(dealId); // left over from an attempt that did not go through
    return null;
  }
  await saveMeetingPlace(dealId, venue, wallet);
  forgetPendingPlace(dealId);
  return venue;
}

export function forgetPendingPlace(dealId: string): void {
  try {
    localStorage.removeItem(pendingKey(dealId));
  } catch {
    // Nothing to clean up if storage is blocked.
  }
}

function readPendingPlace(dealId: string): string | null {
  try {
    return localStorage.getItem(pendingKey(dealId));
  } catch {
    return null;
  }
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
