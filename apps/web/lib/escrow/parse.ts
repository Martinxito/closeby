// Parses an escrow action from a request body. The signer is never taken from the body:
// callers pass the authenticated address (lib/auth/server.ts) and it overrides anything sent.
import type { EscrowAction, EscrowActionType } from './types';

const ACTIONS: EscrowActionType[] = [
  'create_order',
  'fund',
  'open_delivery',
  'buyer_cancel',
  'confirm_handover',
  'refund_after_deadline',
  'release_after_deadline',
];

export function parseAction(body: unknown, signer: string): EscrowAction | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (!ACTIONS.includes(b.type as EscrowActionType)) return null;
  if (typeof b.dealId !== 'string' || !/^[0-9]{1,20}$/.test(b.dealId)) return null;
  if (BigInt(b.dealId) > (1n << 64n) - 1n) return null; // must fit in a u64

  if (b.type === 'create_order') {
    if (typeof b.amount !== 'number' || (b.kind !== 'digital' && b.kind !== 'physical')) return null;
    if (b.contentHash !== null && typeof b.contentHash !== 'string') return null;
    return {
      type: 'create_order',
      dealId: b.dealId,
      signer,
      amount: b.amount,
      kind: b.kind,
      contentHash: (b.contentHash as string | null) ?? null,
    };
  }
  return { type: b.type as Exclude<EscrowActionType, 'create_order'>, dealId: b.dealId, signer };
}
