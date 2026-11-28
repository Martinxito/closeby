// Parses an escrow action from a request body. The signer is never taken from the body:
// callers pass the authenticated address (lib/auth/server.ts) and it overrides anything sent.
import type { EscrowAction, EscrowActionType, SimpleActionType } from './types';

const ACTIONS: EscrowActionType[] = [
  'create_order',
  'fund',
  'open_delivery',
  'buyer_cancel',
  'confirm_handover',
  'refund_after_deadline',
  'release_after_deadline',
  'fund_and_schedule',
  'accept_meeting',
  'decline_meeting',
  'refund_unaccepted',
  'reject_at_meeting',
  'seller_cancel',
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
  if (b.type === 'fund_and_schedule') {
    if (typeof b.meetingTime !== 'number' || !Number.isSafeInteger(b.meetingTime)) return null;
    if (typeof b.placeHash !== 'string' || !/^[0-9a-f]{64}$/.test(b.placeHash)) return null;
    return { type: 'fund_and_schedule', dealId: b.dealId, signer, meetingTime: b.meetingTime, placeHash: b.placeHash };
  }
  return { type: b.type as SimpleActionType, dealId: b.dealId, signer };
}
