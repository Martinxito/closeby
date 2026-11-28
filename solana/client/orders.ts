// Reading orders from the chain, in the same shape the web already uses for its mock
// (apps/web/lib/escrow/types.ts, `Order`), so screens do not change in chain mode.

import type { IdlAccounts } from '@anchor-lang/core';
import type { Connection, PublicKey } from '@solana/web3.js';
import type { ClosebyEscrow } from '../idl/closeby_escrow';
import { orderAddress, type Address } from './addresses';
import type { EscrowProgram } from './program';

export type OrderKind = 'digital' | 'physical';
export type OrderStatus = 'Created' | 'Funded' | 'Scheduled' | 'Delivered' | 'Released' | 'Refunded';

/** Same fields as the web's `Order`, except `lastSignature` (see `findLastSignature`). */
export type EscrowOrder = {
  dealId: string; // u64 order_id as a decimal string
  kind: OrderKind;
  seller: string; // base58
  buyer: string | null;
  amount: number; // USDC base units (6 decimals); safe as a number below 2^53
  contentHash: string | null; // SHA-256 of the file, lowercase hex
  status: OrderStatus;
  claimDeadline: number | null; // digital, unix seconds; null until funded
  releaseDeadline: number | null; // unix seconds; null until delivered (digital) or accepted (in-person)
  meetingTime: number | null; // in-person, unix seconds; null until the buyer proposes
  placeHash: string | null; // in-person, SHA-256 of the meeting place (hex); null until proposed
  acceptDeadline: number | null; // in-person, unix seconds; the seller must accept before it
};

type RawOrder = IdlAccounts<ClosebyEscrow>['order'];

/** The order behind a deal, or null if it does not exist on-chain (yet). */
export async function fetchOrder(program: EscrowProgram, seller: Address, dealId: string): Promise<EscrowOrder | null> {
  const raw = await program.account.order.fetchNullable(orderAddress(seller, dealId), 'confirmed');
  return raw ? toEscrowOrder(raw) : null;
}

export function toEscrowOrder(raw: RawOrder): EscrowOrder {
  const hash = Buffer.from(raw.contentHash);
  return {
    dealId: raw.orderId.toString(10),
    kind: 'digital' in raw.kind ? 'digital' : 'physical',
    seller: raw.seller.toBase58(),
    buyer: raw.buyer ? raw.buyer.toBase58() : null,
    amount: raw.amount.toNumber(),
    contentHash: hash.every((b) => b === 0) ? null : hash.toString('hex'),
    status: statusName(raw.status),
    claimDeadline: raw.claimDeadline.isZero() ? null : raw.claimDeadline.toNumber(),
    releaseDeadline: raw.releaseDeadline.isZero() ? null : raw.releaseDeadline.toNumber(),
    meetingTime: raw.meetingTime.isZero() ? null : raw.meetingTime.toNumber(),
    placeHash: Buffer.from(raw.placeHash).every((b) => b === 0) ? null : Buffer.from(raw.placeHash).toString('hex'),
    acceptDeadline: raw.acceptDeadline.isZero() ? null : raw.acceptDeadline.toNumber(),
  };
}

/** Anchor decodes enums as `{ funded: {} }`; the web uses `'Funded'`. */
function statusName(status: RawOrder['status']): OrderStatus {
  const key = Object.keys(status)[0]!;
  return (key[0]!.toUpperCase() + key.slice(1)) as OrderStatus;
}

/**
 * Signature of the latest successful transaction on this order, for the
 * "Ver comprobante" link. The program cannot store it: a program never knows the
 * signature of the transaction it runs in.
 */
export async function findLastSignature(connection: Connection, order: PublicKey): Promise<string | null> {
  const signatures = await connection.getSignaturesForAddress(order, { limit: 10 }, 'confirmed');
  return signatures.find((s) => s.err === null)?.signature ?? null;
}
