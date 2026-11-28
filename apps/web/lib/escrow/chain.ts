// The Solana program in chain mode, through the client in solana/client (Aaron).
// Server-only: it is built with our fee payer, which pays fees and rent for users.
import 'server-only';

import { createEscrowClient, type EscrowClient } from '@closeby/solana/client';
import { getConnection, getFeePayer, getUsdcMint } from '../solana/config';
import type { Order } from './types';

let client: EscrowClient | undefined;

export function getEscrow(): EscrowClient {
  client ??= createEscrowClient({
    connection: getConnection(),
    usdcMint: getUsdcMint(),
    feePayer: getFeePayer().publicKey,
  });
  return client;
}

/**
 * The on-chain order, in the web's `Order` shape. The order's address is derived from
 * the seller and the deal ID, so both are needed.
 */
export async function fetchChainOrder(dealId: string, seller: string): Promise<Order | null> {
  const escrow = getEscrow();
  const order = await escrow.fetchOrder(seller, dealId);
  if (!order) return null;
  // Only finished deals show a receipt; skip the extra RPC call otherwise.
  const done = order.status === 'Released' || order.status === 'Refunded';
  const lastSignature = done ? await escrow.findLastSignature(seller, dealId) : null;
  return { ...order, lastSignature };
}
