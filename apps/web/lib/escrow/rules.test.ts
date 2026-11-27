import { describe, expect, it } from 'vitest';
import { applyAction, availableActions, canDownload } from './rules';
import { EscrowError, type EscrowAction, type EscrowConfig, type Order } from './types';

const config: EscrowConfig = { digitalClaimSecs: 600, digitalReviewSecs: 300 };
const SELLER = 'S'.repeat(44);
const BUYER = 'B'.repeat(44);
const STRANGER = 'X'.repeat(44);
const HASH = 'ab'.repeat(32);
const T0 = 1_000_000;

function run(order: Order | null, action: EscrowAction, now = T0) {
  return applyAction(order, action, now, config);
}

function create(): Order {
  return run(null, { type: 'create_order', dealId: '1', signer: SELLER, amount: 315_789, kind: 'digital', contentHash: HASH })
    .order;
}
const funded = () => run(create(), { type: 'fund', dealId: '1', signer: BUYER }).order;
const delivered = () => run(funded(), { type: 'open_delivery', dealId: '1', signer: BUYER }, T0 + 60).order;

function expectCode(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(EscrowError);
    expect((err as EscrowError).code).toBe(code);
    return;
  }
  throw new Error(`Expected EscrowError ${code}`);
}

describe('happy path', () => {
  it('create → fund → open_delivery → confirm pays the seller', () => {
    const order = delivered();
    expect(order.status).toBe('Delivered');
    expect(order.releaseDeadline).toBe(T0 + 60 + 300);

    const { order: done, payout } = run(order, { type: 'confirm_handover', dealId: '1', signer: BUYER });
    expect(done.status).toBe('Released');
    expect(payout).toEqual({ to: 'seller', address: SELLER, amount: 315_789 });
  });

  it('fund sets the buyer and the claim deadline', () => {
    const order = funded();
    expect(order.buyer).toBe(BUYER);
    expect(order.claimDeadline).toBe(T0 + 600);
  });
});

describe('rules that must reject', () => {
  it('create_order without a valid hash, or with a zero hash', () => {
    const base = { type: 'create_order', dealId: '1', signer: SELLER, amount: 1, kind: 'digital' } as const;
    expectCode(() => run(null, { ...base, contentHash: null }), 'InvalidContentHash');
    expectCode(() => run(null, { ...base, contentHash: '0'.repeat(64) }), 'InvalidContentHash');
    expectCode(() => run(null, { ...base, contentHash: 'xyz' }), 'InvalidContentHash');
  });

  it('create_order with a non-positive amount, or twice', () => {
    const base = { type: 'create_order', dealId: '1', signer: SELLER, kind: 'digital', contentHash: HASH } as const;
    expectCode(() => run(null, { ...base, amount: 0 }), 'InvalidAmount');
    expectCode(() => run(create(), { ...base, amount: 1 }), 'OrderAlreadyExists');
  });

  it('the seller cannot buy their own deal', () => {
    expectCode(() => run(create(), { type: 'fund', dealId: '1', signer: SELLER }), 'BuyerIsSeller');
  });

  it('only the buyer can unlock, cancel or confirm', () => {
    for (const type of ['open_delivery', 'buyer_cancel'] as const) {
      expectCode(() => run(funded(), { type, dealId: '1', signer: STRANGER }), 'NotBuyer');
      expectCode(() => run(funded(), { type, dealId: '1', signer: SELLER }), 'NotBuyer');
    }
    expectCode(() => run(delivered(), { type: 'confirm_handover', dealId: '1', signer: SELLER }), 'NotBuyer');
    expectCode(() => run(delivered(), { type: 'confirm_handover', dealId: '1', signer: STRANGER }), 'NotBuyer');
  });

  it('open_delivery after the claim deadline', () => {
    expectCode(() => run(funded(), { type: 'open_delivery', dealId: '1', signer: BUYER }, T0 + 601), 'ClaimWindowClosed');
  });

  it('buyer_cancel after unlocking (the point of no return)', () => {
    expectCode(() => run(delivered(), { type: 'buyer_cancel', dealId: '1', signer: BUYER }), 'InvalidStatus');
  });

  it('deadline actions before their deadline', () => {
    expectCode(() => run(funded(), { type: 'refund_after_deadline', dealId: '1', signer: STRANGER }, T0 + 600), 'DeadlineNotReached');
    expectCode(
      () => run(delivered(), { type: 'release_after_deadline', dealId: '1', signer: STRANGER }, T0 + 60 + 300),
      'DeadlineNotReached',
    );
  });

  it('release_after_deadline on a Funded order, refund_after_deadline on a Delivered order', () => {
    expectCode(() => run(funded(), { type: 'release_after_deadline', dealId: '1', signer: STRANGER }, T0 + 9999), 'InvalidStatus');
    expectCode(() => run(delivered(), { type: 'refund_after_deadline', dealId: '1', signer: STRANGER }, T0 + 9999), 'InvalidStatus');
  });

  it('no double confirmation and no double refund', () => {
    const released = run(delivered(), { type: 'confirm_handover', dealId: '1', signer: BUYER }).order;
    expectCode(() => run(released, { type: 'confirm_handover', dealId: '1', signer: BUYER }), 'InvalidStatus');

    const refunded = run(funded(), { type: 'buyer_cancel', dealId: '1', signer: BUYER }).order;
    expectCode(() => run(refunded, { type: 'buyer_cancel', dealId: '1', signer: BUYER }), 'InvalidStatus');
    expectCode(() => run(refunded, { type: 'refund_after_deadline', dealId: '1', signer: STRANGER }, T0 + 9999), 'InvalidStatus');
  });

  it('any action on a missing order', () => {
    expectCode(() => run(null, { type: 'fund', dealId: '1', signer: BUYER }), 'OrderNotFound');
  });
});

describe('deadline outcomes pay the right party, never the caller', () => {
  it('unclaimed after the deadline: refund to the buyer', () => {
    const { order, payout } = run(funded(), { type: 'refund_after_deadline', dealId: '1', signer: STRANGER }, T0 + 601);
    expect(order.status).toBe('Refunded');
    expect(payout).toEqual({ to: 'buyer', address: BUYER, amount: 315_789 });
  });

  it('unlocked and silent after the review window: pay the seller', () => {
    const { order, payout } = run(delivered(), { type: 'release_after_deadline', dealId: '1', signer: STRANGER }, T0 + 361);
    expect(order.status).toBe('Released');
    expect(payout).toEqual({ to: 'seller', address: SELLER, amount: 315_789 });
  });

  it('buyer cancels before unlocking: full refund', () => {
    const { payout } = run(funded(), { type: 'buyer_cancel', dealId: '1', signer: BUYER });
    expect(payout).toEqual({ to: 'buyer', address: BUYER, amount: 315_789 });
  });
});

describe('availableActions', () => {
  it('offers buy to anyone but the seller', () => {
    expect(availableActions(create(), BUYER, T0)).toEqual(['fund']);
    expect(availableActions(create(), SELLER, T0)).toEqual([]);
    expect(availableActions(create(), null, T0)).toEqual([]);
  });

  it('offers unlock and cancel to the buyer only, until the claim deadline', () => {
    expect(availableActions(funded(), BUYER, T0)).toEqual(['open_delivery', 'buyer_cancel']);
    expect(availableActions(funded(), SELLER, T0)).toEqual([]);
    expect(availableActions(funded(), SELLER, T0 + 601)).toEqual(['refund_after_deadline']);
  });

  it('offers confirm to the buyer, and release to anyone after the review window', () => {
    expect(availableActions(delivered(), BUYER, T0 + 60)).toEqual(['confirm_handover']);
    expect(availableActions(delivered(), SELLER, T0 + 60)).toEqual([]);
    expect(availableActions(delivered(), SELLER, T0 + 361)).toEqual(['release_after_deadline']);
  });
});

describe('canDownload', () => {
  it('only the buyer, only after unlocking', () => {
    expect(canDownload(create(), BUYER)).toBe(false);
    expect(canDownload(funded(), BUYER)).toBe(false); // paid but not unlocked yet
    expect(canDownload(delivered(), BUYER)).toBe(true);
    expect(canDownload(delivered(), SELLER)).toBe(false);
    expect(canDownload(delivered(), STRANGER)).toBe(false);
    expect(canDownload(delivered(), null)).toBe(false);
    expect(canDownload(null, BUYER)).toBe(false);
  });

  it('still allowed after paying the seller, never after a refund', () => {
    const released = run(delivered(), { type: 'confirm_handover', dealId: '1', signer: BUYER }).order;
    expect(canDownload(released, BUYER)).toBe(true);
    const refunded = run(funded(), { type: 'buyer_cancel', dealId: '1', signer: BUYER }).order;
    expect(canDownload(refunded, BUYER)).toBe(false);
  });
});
