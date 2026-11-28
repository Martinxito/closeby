// In-person rules (docs/in-person-proposal.md). Mirrors solana/tests/in_person.ts so the
// mock and the program behave the same way.
import { describe, expect, it } from 'vitest';
import { applyAction, availableActions, canSeeMeetingPlace } from './rules';
import { EscrowError, type EscrowAction, type EscrowConfig, type Order } from './types';

const config: EscrowConfig = { digitalClaimSecs: 600, digitalReviewSecs: 300, acceptWindowSecs: 3600, graceSecs: 3600 };
const SELLER = 'S'.repeat(44);
const BUYER = 'B'.repeat(44);
const STRANGER = 'X'.repeat(44);
const PLACE = 'cd'.repeat(32);
const T0 = 1_000_000;
const MEETING = T0 + 2 * 24 * 3600; // in two days

const run = (order: Order | null, action: EscrowAction, now = T0) => applyAction(order, action, now, config);

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

const created = () =>
  run(null, { type: 'create_order', dealId: '1', signer: SELLER, amount: 315_789, kind: 'physical', contentHash: null }).order;
const proposed = (meeting = MEETING) =>
  run(created(), { type: 'fund_and_schedule', dealId: '1', signer: BUYER, meetingTime: meeting, placeHash: PLACE }).order;
const scheduled = (meeting = MEETING) => run(proposed(meeting), { type: 'accept_meeting', dealId: '1', signer: SELLER }).order;

describe('in-person happy path', () => {
  it('create → fund_and_schedule → accept → confirm pays the seller', () => {
    const p = proposed();
    expect(p.status).toBe('Funded');
    expect(p.meetingTime).toBe(MEETING);
    expect(p.placeHash).toBe(PLACE);
    expect(p.acceptDeadline).toBe(T0 + 3600);

    const s = scheduled();
    expect(s.status).toBe('Scheduled');
    expect(s.releaseDeadline).toBe(MEETING + 3600);

    const { order, payout } = run(s, { type: 'confirm_handover', dealId: '1', signer: BUYER });
    expect(order.status).toBe('Released');
    expect(payout).toEqual({ to: 'seller', address: SELLER, amount: 315_789 });
  });

  it('the accept deadline never goes past the meeting', () => {
    expect(proposed(T0 + 600).acceptDeadline).toBe(T0 + 600);
  });
});

describe('every refund goes to the buyer', () => {
  const refundToBuyer = { to: 'buyer', address: BUYER, amount: 315_789 };

  it('decline_meeting, seller_cancel, reject_at_meeting', () => {
    expect(run(proposed(), { type: 'decline_meeting', dealId: '1', signer: SELLER }).payout).toEqual(refundToBuyer);
    expect(run(scheduled(), { type: 'seller_cancel', dealId: '1', signer: SELLER }).payout).toEqual(refundToBuyer);
    const soon = scheduled(T0 + 600);
    expect(run(soon, { type: 'reject_at_meeting', dealId: '1', signer: BUYER }).payout).toEqual(refundToBuyer);
  });

  it('refund_unaccepted at the accept deadline, by anyone', () => {
    const p = proposed();
    expect(run(p, { type: 'refund_unaccepted', dealId: '1', signer: STRANGER }, T0 + 3600).payout).toEqual(refundToBuyer);
  });

  it('refund_after_deadline after meeting + grace, by anyone', () => {
    const s = scheduled();
    expect(run(s, { type: 'refund_after_deadline', dealId: '1', signer: STRANGER }, MEETING + 3601).payout).toEqual(refundToBuyer);
  });
});

describe('in-person rules that must reject', () => {
  it('an in-person order with a file hash', () => {
    expectCode(
      () => run(null, { type: 'create_order', dealId: '1', signer: SELLER, amount: 1, kind: 'physical', contentHash: 'ab'.repeat(32) }),
      'InvalidContentHash',
    );
  });

  it('fund_and_schedule: meeting in the past, empty place, buyer = seller', () => {
    const base = { type: 'fund_and_schedule', dealId: '1', placeHash: PLACE } as const;
    expectCode(() => run(created(), { ...base, signer: BUYER, meetingTime: T0 }), 'MeetingInPast');
    expectCode(() => run(created(), { ...base, signer: BUYER, meetingTime: MEETING, placeHash: '0'.repeat(64) }), 'InvalidPlaceHash');
    expectCode(() => run(created(), { ...base, signer: SELLER, meetingTime: MEETING }), 'BuyerIsSeller');
  });

  it('a stranger or the seller confirms; confirming before acceptance', () => {
    expectCode(() => run(scheduled(), { type: 'confirm_handover', dealId: '1', signer: STRANGER }), 'NotBuyer');
    expectCode(() => run(scheduled(), { type: 'confirm_handover', dealId: '1', signer: SELLER }), 'NotBuyer');
    expectCode(() => run(proposed(), { type: 'confirm_handover', dealId: '1', signer: BUYER }), 'InvalidStatus');
  });

  it('only the seller accepts, declines or cancels', () => {
    expectCode(() => run(proposed(), { type: 'accept_meeting', dealId: '1', signer: BUYER }), 'NotSeller');
    expectCode(() => run(proposed(), { type: 'decline_meeting', dealId: '1', signer: STRANGER }), 'NotSeller');
    expectCode(() => run(scheduled(), { type: 'seller_cancel', dealId: '1', signer: BUYER }), 'NotSeller');
  });

  it('accepting at or after the accept deadline', () => {
    expectCode(() => run(proposed(), { type: 'accept_meeting', dealId: '1', signer: SELLER }, T0 + 3600), 'AcceptWindowClosed');
  });

  it('deadline refunds before their deadline', () => {
    expectCode(() => run(proposed(), { type: 'refund_unaccepted', dealId: '1', signer: STRANGER }, T0 + 3599), 'DeadlineNotReached');
    expectCode(() => run(scheduled(), { type: 'refund_after_deadline', dealId: '1', signer: STRANGER }, MEETING + 3600), 'DeadlineNotReached');
  });

  it('reject_at_meeting a day before the meeting', () => {
    expectCode(() => run(scheduled(), { type: 'reject_at_meeting', dealId: '1', signer: BUYER }, MEETING - 24 * 3600), 'TooEarlyToReject');
  });

  it('double confirmation and double refund', () => {
    const released = run(scheduled(), { type: 'confirm_handover', dealId: '1', signer: BUYER }).order;
    expectCode(() => run(released, { type: 'confirm_handover', dealId: '1', signer: BUYER }), 'InvalidStatus');
    const refunded = run(proposed(), { type: 'decline_meeting', dealId: '1', signer: SELLER }).order;
    expectCode(() => run(refunded, { type: 'decline_meeting', dealId: '1', signer: SELLER }), 'InvalidStatus');
  });

  it('wrong kind both ways', () => {
    const digital = run(null, { type: 'create_order', dealId: '2', signer: SELLER, amount: 1, kind: 'digital', contentHash: 'ab'.repeat(32) }).order;
    expectCode(() => run(digital, { type: 'accept_meeting', dealId: '2', signer: SELLER }), 'WrongOrderKind');
    expectCode(() => run(created(), { type: 'fund', dealId: '1', signer: BUYER }), 'PhysicalNotSupported');
    expectCode(() => run(proposed(), { type: 'open_delivery', dealId: '1', signer: BUYER }), 'PhysicalNotSupported');
  });
});

describe('in-person availableActions and meeting place', () => {
  it('buyers propose, sellers answer until the deadline, then anyone refunds', () => {
    expect(availableActions(created(), BUYER, T0)).toEqual(['fund_and_schedule']);
    expect(availableActions(created(), SELLER, T0)).toEqual([]);
    expect(availableActions(proposed(), SELLER, T0)).toEqual(['accept_meeting', 'decline_meeting']);
    expect(availableActions(proposed(), BUYER, T0)).toEqual([]);
    expect(availableActions(proposed(), STRANGER, T0 + 3600)).toEqual(['refund_unaccepted']);
  });

  it('at the meeting: buyer confirms (and rejects from 30 min before), seller can cancel', () => {
    expect(availableActions(scheduled(), BUYER, T0)).toEqual(['confirm_handover']);
    expect(availableActions(scheduled(), BUYER, MEETING - 1800)).toEqual(['confirm_handover', 'reject_at_meeting']);
    expect(availableActions(scheduled(), SELLER, T0)).toEqual(['seller_cancel']);
    expect(availableActions(scheduled(), STRANGER, MEETING + 3601)).toEqual(['refund_after_deadline']);
  });

  it('only buyer and seller see the exact place', () => {
    expect(canSeeMeetingPlace(proposed(), BUYER)).toBe(true);
    expect(canSeeMeetingPlace(proposed(), SELLER)).toBe(true);
    expect(canSeeMeetingPlace(proposed(), STRANGER)).toBe(false);
    expect(canSeeMeetingPlace(created(), SELLER)).toBe(false);
  });
});
