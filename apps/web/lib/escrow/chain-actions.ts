// Chain mode: turns an escrow action into the program instructions for one transaction.
// Server-only. The signer always comes from the session (lib/auth/server.ts); every other
// party (seller, buyer) comes from our deal row or from the on-chain order, never from
// the request body. The program enforces the rules; this only builds the accounts.
import 'server-only';

import type { TransactionInstruction } from '@solana/web3.js';
import { getDeal } from '../deals';
import { getEscrow } from './chain';
import { EscrowError, type EscrowAction } from './types';

export async function instructionsFor(action: EscrowAction): Promise<TransactionInstruction[]> {
  const build = getEscrow().build;
  const { dealId, signer } = action;

  if (action.type === 'create_order') {
    if (action.kind !== 'digital') throw new EscrowError('PhysicalNotSupported', 'In-person orders are not implemented yet.');
    if (!action.contentHash) throw new EscrowError('InvalidContentHash', 'A digital order needs the SHA-256 of its file.');
    // The deal row does not exist yet: the seller is whoever signs.
    return build.createOrder({ seller: signer, dealId, amount: action.amount, contentHash: action.contentHash });
  }

  const deal = await getDeal(dealId);
  if (!deal) throw new EscrowError('OrderNotFound', 'No order for this deal.');
  const ref = { seller: deal.seller, dealId };

  switch (action.type) {
    case 'fund':
      return build.fund({ ...ref, buyer: signer });
    case 'open_delivery':
      return build.openDelivery({ ...ref, buyer: signer });
    case 'buyer_cancel':
      return build.buyerCancel({ ...ref, buyer: signer });
    case 'confirm_handover':
      return build.confirmHandover({ ...ref, buyer: signer });
    case 'release_after_deadline':
      return build.releaseAfterDeadline({ ...ref, caller: signer });
    case 'refund_after_deadline': {
      // The refund goes to the order's buyer, read from the chain, not to the caller.
      const order = await getEscrow().fetchOrder(deal.seller, dealId);
      if (!order?.buyer) throw new EscrowError('InvalidStatus', 'Nobody has paid for this order.');
      return build.refundAfterDeadline({ ...ref, buyer: order.buyer, caller: signer });
    }
  }
}
