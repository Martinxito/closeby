// The escrow rules, digital and in-person, as pure functions.
//
// Two uses:
// 1. The mock escrow applies them when ESCROW_MODE=mock.
// 2. The UI asks `availableActions` which buttons to show, so it never offers an action
//    the program would reject.
// They must match docs/flows/digital-sale.md, docs/in-person-proposal.md and the program
// (solana/programs/closeby_escrow). Checks run in the same order as in the program, so
// both return the same error for the same mistake. If they disagree, the program wins.

import {
  EscrowError,
  REJECT_WINDOW_SECS,
  type ActionResult,
  type EscrowAction,
  type EscrowActionType,
  type EscrowConfig,
  type Order,
} from './types';

const HEX_SHA256 = /^[0-9a-f]{64}$/;
const isZeroHash = (h: string) => /^0+$/.test(h);

const DIGITAL_ONLY: EscrowActionType[] = ['fund', 'open_delivery', 'buyer_cancel', 'release_after_deadline'];
const PHYSICAL_ONLY: EscrowActionType[] = [
  'fund_and_schedule',
  'accept_meeting',
  'decline_meeting',
  'refund_unaccepted',
  'reject_at_meeting',
  'seller_cancel',
];

/** Applies one instruction. Throws EscrowError when a rule forbids it. `now` is unix seconds. */
export function applyAction(order: Order | null, action: EscrowAction, now: number, config: EscrowConfig): ActionResult {
  if (action.type === 'create_order') return createOrder(order, action);

  if (!order) throw new EscrowError('OrderNotFound', 'No order for this deal.');
  if (order.kind === 'physical' && DIGITAL_ONLY.includes(action.type)) {
    throw new EscrowError('PhysicalNotSupported', 'This action is for digital orders.');
  }
  if (order.kind === 'digital' && PHYSICAL_ONLY.includes(action.type)) {
    throw new EscrowError('WrongOrderKind', 'This action is for in-person orders.');
  }
  return order.kind === 'digital' ? applyDigital(order, action, now, config) : applyPhysical(order, action, now, config);
}

function createOrder(order: Order | null, action: Extract<EscrowAction, { type: 'create_order' }>): ActionResult {
  if (order) throw new EscrowError('OrderAlreadyExists', 'This deal already has an order.');
  if (!Number.isSafeInteger(action.amount) || action.amount <= 0) {
    throw new EscrowError('InvalidAmount', 'Amount must be a positive integer.');
  }
  if (action.kind === 'digital') {
    if (!action.contentHash || !HEX_SHA256.test(action.contentHash) || isZeroHash(action.contentHash)) {
      throw new EscrowError('InvalidContentHash', 'A digital order needs the SHA-256 of its file.');
    }
  } else if (action.contentHash && !isZeroHash(action.contentHash)) {
    // In-person orders have no file; the meeting place is committed later by the buyer.
    throw new EscrowError('InvalidContentHash', 'An in-person order has no file hash.');
  }
  return {
    order: {
      dealId: action.dealId,
      kind: action.kind,
      seller: action.signer,
      buyer: null,
      amount: action.amount,
      contentHash: action.kind === 'digital' ? action.contentHash : null,
      status: 'Created',
      claimDeadline: null,
      releaseDeadline: null,
      meetingTime: null,
      placeHash: null,
      acceptDeadline: null,
      lastSignature: null,
    },
    payout: null,
  };
}

function applyDigital(order: Order, action: EscrowAction, now: number, config: EscrowConfig): ActionResult {
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

    default:
      throw new EscrowError('WrongOrderKind', 'This action is for in-person orders.');
  }
}

function applyPhysical(order: Order, action: EscrowAction, now: number, config: EscrowConfig): ActionResult {
  switch (action.type) {
    case 'fund_and_schedule': {
      requireStatus(order, 'Created');
      if (action.signer === order.seller) throw new EscrowError('BuyerIsSeller', 'The seller cannot buy their own deal.');
      if (!(action.meetingTime > now)) throw new EscrowError('MeetingInPast', 'The meeting must be in the future.');
      if (!HEX_SHA256.test(action.placeHash) || isZeroHash(action.placeHash)) {
        throw new EscrowError('InvalidPlaceHash', 'An in-person order needs the SHA-256 of the meeting place.');
      }
      return {
        order: {
          ...order,
          buyer: action.signer,
          status: 'Funded',
          meetingTime: action.meetingTime,
          placeHash: action.placeHash,
          // The seller answers before the window ends, and never after the meeting started.
          acceptDeadline: Math.min(now + config.acceptWindowSecs, action.meetingTime),
        },
        payout: null,
      };
    }

    case 'accept_meeting': {
      requireStatus(order, 'Funded');
      requireSeller(order, action.signer);
      // Exclusive: refund_unaccepted opens at the deadline, so the two never overlap.
      if (!(now < (order.acceptDeadline ?? 0))) {
        throw new EscrowError('AcceptWindowClosed', 'The time to accept the meeting has passed.');
      }
      return {
        order: { ...order, status: 'Scheduled', releaseDeadline: (order.meetingTime ?? 0) + config.graceSecs },
        payout: null,
      };
    }

    case 'decline_meeting': {
      requireStatus(order, 'Funded');
      requireSeller(order, action.signer);
      return refund(order);
    }

    case 'refund_unaccepted': {
      // Anyone can trigger it: the money goes to the buyer.
      requireStatus(order, 'Funded');
      if (now < (order.acceptDeadline ?? Infinity)) {
        throw new EscrowError('DeadlineNotReached', 'The seller still has time to accept.');
      }
      return refund(order);
    }

    case 'confirm_handover': {
      // "Recibí el producto": only once the seller accepted the meeting.
      requireStatus(order, 'Scheduled');
      requireBuyer(order, action.signer);
      return paySeller(order);
    }

    case 'reject_at_meeting': {
      requireStatus(order, 'Scheduled');
      requireBuyer(order, action.signer);
      if (now < (order.meetingTime ?? Infinity) - REJECT_WINDOW_SECS) {
        throw new EscrowError('TooEarlyToReject', 'The item can only be rejected from 30 minutes before the meeting.');
      }
      return refund(order);
    }

    case 'seller_cancel': {
      requireStatus(order, 'Scheduled');
      requireSeller(order, action.signer);
      return refund(order);
    }

    case 'refund_after_deadline': {
      // Nobody confirmed by meeting time + grace: no proven exchange, so the buyer is
      // refunded (the opposite of digital, where silence pays the seller).
      requireStatus(order, 'Scheduled');
      if (now <= (order.releaseDeadline ?? Infinity)) {
        throw new EscrowError('DeadlineNotReached', 'The buyer can still confirm the meeting.');
      }
      return refund(order);
    }

    default:
      throw new EscrowError('PhysicalNotSupported', 'This action is for digital orders.');
  }
}

/**
 * Actions the viewer can take right now. `viewer` is the logged-in user's address,
 * or null when nobody is logged in (deadline actions are open to anyone, but the UI
 * needs someone logged in to sign them).
 */
export function availableActions(order: Order | null, viewer: string | null, now: number): EscrowActionType[] {
  if (!order || !viewer) return [];
  return order.kind === 'digital' ? digitalActions(order, viewer, now) : physicalActions(order, viewer, now);
}

function digitalActions(order: Order, viewer: string, now: number): EscrowActionType[] {
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

function physicalActions(order: Order, viewer: string, now: number): EscrowActionType[] {
  const isBuyer = viewer === order.buyer;
  const isSeller = viewer === order.seller;
  const actions: EscrowActionType[] = [];
  switch (order.status) {
    case 'Created':
      if (!isSeller) actions.push('fund_and_schedule');
      break;
    case 'Funded':
      if (now >= (order.acceptDeadline ?? Infinity)) actions.push('refund_unaccepted');
      else if (isSeller) actions.push('accept_meeting', 'decline_meeting');
      break;
    case 'Scheduled':
      if (isBuyer) {
        actions.push('confirm_handover');
        if (now >= (order.meetingTime ?? Infinity) - REJECT_WINDOW_SECS) actions.push('reject_at_meeting');
      }
      if (isSeller) actions.push('seller_cancel');
      if (now > (order.releaseDeadline ?? Infinity)) actions.push('refund_after_deadline');
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

/** In-person: whether `viewer` may see the exact meeting place (only the two parties). */
export function canSeeMeetingPlace(order: Order | null, viewer: string | null): boolean {
  if (!order || !viewer || order.kind !== 'physical' || !order.buyer) return false;
  return viewer === order.buyer || viewer === order.seller;
}

function requireStatus(order: Order, expected: Order['status']): void {
  if (order.status !== expected) {
    throw new EscrowError('InvalidStatus', `Expected status ${expected}, found ${order.status}.`);
  }
}

function requireBuyer(order: Order, signer: string): void {
  if (!order.buyer || signer !== order.buyer) throw new EscrowError('NotBuyer', 'Only the buyer can do this.');
}

function requireSeller(order: Order, signer: string): void {
  if (signer !== order.seller) throw new EscrowError('NotSeller', 'Only the seller can do this.');
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
