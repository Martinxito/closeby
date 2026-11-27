// The escrow rules for digital orders, as pure functions.
//
// Two uses:
// 1. The mock escrow applies them while the Solana program is not on Devnet.
// 2. The UI asks `availableActions` which buttons to show, so it never offers an action
//    the program would reject.
// They must match docs/flows/digital-sale.md and docs/escrow-changes.md. If the program
// and this file disagree, the program wins and this file is the bug.

import {
  EscrowError,
  type ActionResult,
  type EscrowAction,
  type EscrowActionType,
  type EscrowConfig,
  type Order,
} from './types';

const HEX_SHA256 = /^[0-9a-f]{64}$/;

/** Applies one instruction. Throws EscrowError when a rule forbids it. `now` is unix seconds. */
export function applyAction(
  order: Order | null,
  action: EscrowAction,
  now: number,
  config: EscrowConfig,
): ActionResult {
  if (action.type === 'create_order') {
    if (order) throw new EscrowError('OrderAlreadyExists', 'This deal already has an order.');
    if (!Number.isSafeInteger(action.amount) || action.amount <= 0) {
      throw new EscrowError('InvalidAmount', 'Amount must be a positive integer.');
    }
    if (action.kind === 'physical') {
      throw new EscrowError('PhysicalNotSupported', 'In-person orders are not implemented yet.');
    }
    if (!action.contentHash || !HEX_SHA256.test(action.contentHash) || /^0+$/.test(action.contentHash)) {
      throw new EscrowError('InvalidContentHash', 'A digital order needs the SHA-256 of its file.');
    }
    return {
      order: {
        dealId: action.dealId,
        kind: 'digital',
        seller: action.signer,
        buyer: null,
        amount: action.amount,
        contentHash: action.contentHash,
        status: 'Created',
        claimDeadline: null,
        releaseDeadline: null,
        lastSignature: null,
      },
      payout: null,
    };
  }

  if (!order) throw new EscrowError('OrderNotFound', 'No order for this deal.');
  if (order.kind !== 'digital') {
    throw new EscrowError('PhysicalNotSupported', 'In-person orders are not implemented yet.');
  }

  switch (action.type) {
    case 'fund': {
      requireStatus(order, 'Created');
      if (action.signer === order.seller) throw new EscrowError('BuyerIsSeller', 'The seller cannot buy their own deal.');
      return {
        order: { ...order, buyer: action.signer, status: 'Funded', claimDeadline: now + config.digitalClaimSecs },
        payout: null,
      };
    }

    case 'open_delivery': {
      requireStatus(order, 'Funded');
      requireBuyer(order, action.signer);
      // claimDeadline is always set once Funded; the fallback only satisfies the type checker.
      if (now > (order.claimDeadline ?? 0)) {
        throw new EscrowError('ClaimWindowClosed', 'The time to unlock the file has passed.');
      }
      return {
        order: { ...order, status: 'Delivered', releaseDeadline: now + config.digitalReviewSecs },
        payout: null,
      };
    }

    case 'buyer_cancel': {
      // Only before unlocking: once the buyer has the file, cancelling is not allowed.
      requireStatus(order, 'Funded');
      requireBuyer(order, action.signer);
      return refund(order);
    }

    case 'confirm_handover': {
      requireStatus(order, 'Delivered');
      requireBuyer(order, action.signer);
      return paySeller(order);
    }

    case 'refund_after_deadline': {
      // Anyone can trigger it: the money still goes to the buyer, never to the caller.
      requireStatus(order, 'Funded');
      if (now <= (order.claimDeadline ?? Infinity)) {
        throw new EscrowError('DeadlineNotReached', 'The buyer still has time to unlock the file.');
      }
      return refund(order);
    }

    case 'release_after_deadline': {
      // Anyone can trigger it: the money goes to the seller, never to the caller.
      requireStatus(order, 'Delivered');
      if (now <= (order.releaseDeadline ?? Infinity)) {
        throw new EscrowError('DeadlineNotReached', 'The buyer still has time to confirm.');
      }
      return paySeller(order);
    }
  }
}

/**
 * Actions the viewer can take right now. `viewer` is the logged-in user's address,
 * or null when nobody is logged in (deadline actions are open to anyone, but the UI
 * needs someone logged in to sign them).
 */
export function availableActions(order: Order | null, viewer: string | null, now: number): EscrowActionType[] {
  if (!order || !viewer || order.kind !== 'digital') return [];
  const isBuyer = viewer === order.buyer;
  const actions: EscrowActionType[] = [];

  switch (order.status) {
    case 'Created':
      if (viewer !== order.seller) actions.push('fund');
      break;
    case 'Funded':
      if (now > (order.claimDeadline ?? Infinity)) actions.push('refund_after_deadline');
      else if (isBuyer) actions.push('open_delivery', 'buyer_cancel');
      break;
    case 'Delivered':
      if (isBuyer) actions.push('confirm_handover');
      if (now > (order.releaseDeadline ?? Infinity)) actions.push('release_after_deadline');
      break;
  }
  return actions;
}

/**
 * Whether `viewer` may download the file of a digital order: only its buyer, and only
 * after unlocking it on-chain (Delivered) or after paying the seller (Released).
 * A refunded buyer never unlocked the file, so Refunded is not allowed.
 */
export function canDownload(order: Order | null, viewer: string | null): boolean {
  if (!order || !viewer || order.kind !== 'digital') return false;
  return viewer === order.buyer && (order.status === 'Delivered' || order.status === 'Released');
}

function requireStatus(order: Order, expected: Order['status']): void {
  if (order.status !== expected) {
    throw new EscrowError('InvalidStatus', `Expected status ${expected}, found ${order.status}.`);
  }
}

function requireBuyer(order: Order, signer: string): void {
  if (!order.buyer || signer !== order.buyer) throw new EscrowError('NotBuyer', 'Only the buyer can do this.');
}

function refund(order: Order): ActionResult {
  return {
    order: { ...order, status: 'Refunded' },
    payout: { to: 'buyer', address: order.buyer!, amount: order.amount },
  };
}

function paySeller(order: Order): ActionResult {
  return {
    order: { ...order, status: 'Released' },
    payout: { to: 'seller', address: order.seller, amount: order.amount },
  };
}
