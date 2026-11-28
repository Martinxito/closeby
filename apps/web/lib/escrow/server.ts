// Server-side escrow access: read an order, and (mock mode only) run an action.
//
// ESCROW_MODE selects the backend:
//   - "mock" (default until the program is on Devnet): orders live in Supabase
//     `mock_orders` and the rules in ./rules.ts are applied here.
//   - "chain": orders are read from the Solana program (./chain.ts). Actions are
//     transactions the user signs, built and relayed by /api/escrow/prepare and /submit.
import 'server-only';

import { getSupabase } from '../supabase';
import { fetchChainOrder } from './chain';
import { nowSecs } from './ids';
import { applyAction } from './rules';
import { DEMO_CONFIG, EscrowError, type ActionResult, type EscrowAction, type Order } from './types';

export type EscrowMode = 'mock' | 'chain';

export function escrowMode(): EscrowMode {
  return process.env.ESCROW_MODE === 'chain' ? 'chain' : 'mock';
}

/**
 * Current state of the order behind a deal, or null if there is none.
 * `seller` is required in chain mode: the order's address is derived from it. Pass it
 * from the deal row, or from the session when the deal row does not exist yet.
 */
export async function getOrder(dealId: string, seller: string | null): Promise<Order | null> {
  if (escrowMode() === 'chain') return seller ? fetchChainOrder(dealId, seller) : null;

  const { data, error } = await getSupabase()
    .from('mock_orders')
    .select('*')
    .eq('deal_id', dealId)
    .maybeSingle<MockOrderRow>();
  if (error) throw new Error(`Could not load order ${dealId}: ${error.message}`);
  return data ? fromRow(data) : null;
}

/**
 * Mock mode only: apply one action and persist it. The signer is trusted as given,
 * because in mock mode there is no real signature to verify. In chain mode the user's
 * wallet signs the transaction and the program enforces the rules instead.
 */
export async function runMockAction(action: EscrowAction): Promise<ActionResult> {
  if (escrowMode() !== 'mock') throw new Error('Mock actions are disabled outside mock mode.');

  const current = await getOrder(action.dealId, null); // mock rows are keyed by deal ID only
  const result = applyAction(current, action, nowSecs(), DEMO_CONFIG);
  const order = { ...result.order, lastSignature: fakeSignature() };
  const row = toRow(order);
  const db = getSupabase().from('mock_orders');

  // Compare-and-set on status: if two requests race (e.g. a double tap on "confirm"),
  // only the first one changes the row, like the program would only accept one.
  const { data, error } = current
    ? await db.update(row).eq('deal_id', order.dealId).eq('status', current.status).select('deal_id')
    : await db.insert(row).select('deal_id');

  if (error) throw new Error(`Could not save order ${order.dealId}: ${error.message}`);
  if (!data?.length) throw new EscrowError('InvalidStatus', 'The order changed in the meantime. Reload and try again.');
  return { order, payout: result.payout };
}

type MockOrderRow = {
  deal_id: string;
  kind: Order['kind'];
  seller: string;
  buyer: string | null;
  amount: number;
  content_hash: string | null;
  status: Order['status'];
  claim_deadline: number | null;
  release_deadline: number | null;
  last_signature: string | null;
};

function fromRow(row: MockOrderRow): Order {
  return {
    dealId: row.deal_id,
    kind: row.kind,
    seller: row.seller,
    buyer: row.buyer,
    amount: Number(row.amount),
    contentHash: row.content_hash,
    status: row.status,
    claimDeadline: row.claim_deadline === null ? null : Number(row.claim_deadline),
    releaseDeadline: row.release_deadline === null ? null : Number(row.release_deadline),
    lastSignature: row.last_signature,
  };
}

function toRow(order: Order): MockOrderRow & { updated_at: string } {
  return {
    deal_id: order.dealId,
    kind: order.kind,
    seller: order.seller,
    buyer: order.buyer,
    amount: order.amount,
    content_hash: order.contentHash,
    status: order.status,
    claim_deadline: order.claimDeadline,
    release_deadline: order.releaseDeadline,
    last_signature: order.lastSignature,
    updated_at: new Date().toISOString(),
  };
}

/** Looks like a Solana signature (base58, 88 chars) so the UI can be built against it. */
function fakeSignature(): string {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const bytes = new Uint8Array(88);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}
