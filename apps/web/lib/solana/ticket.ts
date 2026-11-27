// Pure parts of the sponsored-transaction relay, kept apart so they can be unit tested.
//
// The rule: our fee payer only signs a transaction message that our own server built.
// When the server builds one it returns a "ticket" = HMAC(server secret, message bytes).
// When the signed transaction comes back, the server recomputes the HMAC: if a single
// byte of the message changed (an extra instruction, another recipient, another fee
// payer), the ticket no longer matches and the server refuses to sign.
import 'server-only';

import { createHash, createHmac, createPublicKey, timingSafeEqual, verify } from 'node:crypto';
import { PublicKey, VersionedTransaction } from '@solana/web3.js';

function secret(): Buffer {
  const base = process.env.RELAY_TICKET_SECRET ?? process.env.FEE_PAYER_SECRET_KEY;
  if (!base) throw new Error('Missing RELAY_TICKET_SECRET or FEE_PAYER_SECRET_KEY.');
  return createHash('sha256').update(`closeby-relay-ticket:${base}`).digest();
}

export function ticketFor(message: Uint8Array): string {
  return createHmac('sha256', secret()).update(message).digest('base64url');
}

export type VerifyResult = { ok: true } | { ok: false; reason: string };

/**
 * Checks a transaction the user signed before our fee payer adds its signature:
 * 1. the message is exactly the one we built (ticket matches);
 * 2. our fee payer is the fee payer (first account key);
 * 3. `expectedSigner` (the authenticated user) is a required signer and its signature
 *    over the message is valid.
 */
export function verifyUserSignedTransaction(
  tx: VersionedTransaction,
  ticket: string,
  feePayer: PublicKey,
  expectedSigner: PublicKey,
): VerifyResult {
  const message = tx.message.serialize();

  const given = Buffer.from(ticket);
  const expected = Buffer.from(ticketFor(message));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: 'Transaction was not built by this server or was modified.' };
  }

  const keys = tx.message.staticAccountKeys;
  if (!keys[0]?.equals(feePayer)) return { ok: false, reason: 'Unexpected fee payer.' };

  const index = keys.findIndex((k) => k.equals(expectedSigner));
  if (index < 0 || index >= tx.message.header.numRequiredSignatures) {
    return { ok: false, reason: 'The user is not a signer of this transaction.' };
  }
  if (!verifyEd25519(message, tx.signatures[index]!, expectedSigner)) {
    return { ok: false, reason: 'Missing or invalid user signature.' };
  }
  return { ok: true };
}

/** Ed25519 signature check with Node's crypto (a raw 32-byte key, wrapped as a JWK). */
function verifyEd25519(message: Uint8Array, signature: Uint8Array, signer: PublicKey): boolean {
  if (signature.every((b) => b === 0)) return false; // empty slot: not signed yet
  const key = createPublicKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(signer.toBytes()).toString('base64url') },
    format: 'jwk',
  });
  return verify(null, message, key, signature);
}
