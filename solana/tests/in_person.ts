// In-person orders (docs/in-person-proposal.md). Runs after closeby_escrow.ts, which
// calls init_config (accept window 3600 s, grace GRACE_SECS).
//
// Money never gets stuck: unaccepted → refund, declined → refund, seller cancels →
// refund, rejected at the meeting → refund, nobody confirms after meeting + grace →
// refund. Only the buyer's "Recibí el producto" pays the seller.

import { assert } from 'chai';
import { FILE_HASH, GRACE_SECS, PLACE_HASH, PRICE, ZERO_HASH, randomOrderId, sleep, testbed } from './support/testbed';

describe('in-person orders', () => {
  const t = testbed;
  const { buyer, seller, stranger } = t;
  const { send, expectError, balance, fetchOrder } = t;

  before(t.setup);

  describe('outcomes', () => {
    it('create → fund_and_schedule → accept → confirm pays the seller', async () => {
      const buyerBefore = await balance(t.buyerToken);
      const sellerBefore = await balance(t.sellerToken);

      const o = await t.proposed();
      let order = await fetchOrder(o.order);
      assert.deepEqual(order.status, { funded: {} });
      assert.equal(order.meetingTime.toNumber(), o.meetingTime);
      assert.deepEqual(order.placeHash, PLACE_HASH);
      assert.ok(order.buyer?.equals(buyer.publicKey));
      // The seller must answer before the meeting at the latest.
      assert.isAtMost(order.acceptDeadline.toNumber(), o.meetingTime);
      assert.equal(await balance(o.vault), PRICE.toNumber());

      await send(t.acceptTx(o), [seller]);
      order = await fetchOrder(o.order);
      assert.deepEqual(order.status, { scheduled: {} });
      assert.equal(order.releaseDeadline.toNumber(), o.meetingTime + GRACE_SECS);

      await send(t.confirmTx(o), [buyer]);
      assert.deepEqual((await fetchOrder(o.order)).status, { released: {} });
      assert.equal(await balance(t.buyerToken), buyerBefore - PRICE.toNumber());
      assert.equal(await balance(t.sellerToken), sellerBefore + PRICE.toNumber());
      assert.equal(await balance(o.vault), 0);
    });

    it('decline_meeting: full refund to the buyer', async () => {
      const before = await balance(t.buyerToken);
      const o = await t.proposed();
      await send(t.declineTx(o), [seller]);
      assert.deepEqual((await fetchOrder(o.order)).status, { refunded: {} });
      assert.equal(await balance(t.buyerToken), before);
    });

    it('seller_cancel after accepting: full refund to the buyer', async () => {
      const before = await balance(t.buyerToken);
      const o = await t.scheduled();
      await send(t.sellerCancelTx(o), [seller]);
      assert.deepEqual((await fetchOrder(o.order)).status, { refunded: {} });
      assert.equal(await balance(t.buyerToken), before);
    });

    it('reject_at_meeting within 30 minutes of the meeting: full refund', async () => {
      const before = await balance(t.buyerToken);
      const o = await t.scheduled(10 * 60); // meeting in 10 minutes
      await send(t.rejectTx(o), [buyer]);
      assert.deepEqual((await fetchOrder(o.order)).status, { refunded: {} });
      assert.equal(await balance(t.buyerToken), before);
    });

    it('refund_unaccepted: the seller never answered, anyone refunds the buyer', async () => {
      const before = await balance(t.buyerToken);
      const o = await t.proposed(6); // accept deadline = meeting time, 6 s away
      await sleep(9000);
      await send(t.refundUnacceptedTx(o), [stranger]);
      assert.deepEqual((await fetchOrder(o.order)).status, { refunded: {} });
      assert.equal(await balance(t.buyerToken), before);
    });

    it('refund_after_deadline: nobody confirmed after meeting + grace, the buyer is refunded', async () => {
      const before = await balance(t.buyerToken);
      const o = await t.scheduled(6); // meeting in 6 s, refund opens GRACE_SECS later
      await sleep((6 + GRACE_SECS + 3) * 1000);
      await send(t.refundTx(o), [stranger]);
      assert.deepEqual((await fetchOrder(o.order)).status, { refunded: {} });
      assert.equal(await balance(t.buyerToken), before);
    });
  });

  describe('rules that must reject', () => {
    it('create_order in-person with a file hash', async () => {
      await expectError(send(t.createOrderTx(randomOrderId(), { kind: 'physical', hash: FILE_HASH }), [seller]), 'InvalidContentHash');
    });

    it('fund_and_schedule: meeting in the past, empty place, buyer = seller', async () => {
      const o = await t.createPhysical();
      const now = await t.chainNow();
      await expectError(send(t.scheduleTx(o, now - 60), [buyer]), 'MeetingInPast');
      await expectError(send(t.scheduleTx(o, now + 3600, ZERO_HASH), [buyer]), 'InvalidPlaceHash');
      await expectError(send(t.scheduleTx(o, now + 3600, PLACE_HASH, seller, t.sellerToken), [seller]), 'BuyerIsSeller');
    });

    it('a stranger or the seller confirms the handover', async () => {
      const o = await t.scheduled();
      await expectError(send(t.confirmTx(o, stranger), [stranger]), 'NotBuyer');
      await expectError(send(t.confirmTx(o, seller), [seller]), 'NotBuyer');
    });

    it('confirming before the seller accepted', async () => {
      const o = await t.proposed();
      await expectError(send(t.confirmTx(o), [buyer]), 'InvalidStatus');
    });

    it('only the seller accepts, declines or cancels', async () => {
      const p = await t.proposed();
      await expectError(send(t.acceptTx(p, buyer), [buyer]), 'NotSeller');
      await expectError(send(t.declineTx(p, stranger), [stranger]), 'NotSeller');
      const s = await t.scheduled();
      await expectError(send(t.sellerCancelTx(s, buyer), [buyer]), 'NotSeller');
    });

    it('the seller accepts after the accept deadline', async () => {
      const o = await t.proposed(6);
      await sleep(9000);
      await expectError(send(t.acceptTx(o), [seller]), 'AcceptWindowClosed');
    });

    it('refund_unaccepted before the accept deadline', async () => {
      const o = await t.proposed();
      await expectError(send(t.refundUnacceptedTx(o), [stranger]), 'DeadlineNotReached');
    });

    it('refund_after_deadline before meeting + grace', async () => {
      const o = await t.scheduled();
      await expectError(send(t.refundTx(o), [stranger]), 'DeadlineNotReached');
    });

    it('reject_at_meeting a day before the meeting, or by someone else', async () => {
      const o = await t.scheduled(24 * 3600);
      await expectError(send(t.rejectTx(o), [buyer]), 'TooEarlyToReject');
      const soon = await t.scheduled(10 * 60);
      await expectError(send(t.rejectTx(soon, stranger), [stranger]), 'NotBuyer');
    });

    it('double confirmation and double refund', async () => {
      const a = await t.scheduled();
      await send(t.confirmTx(a), [buyer]);
      await expectError(send(t.confirmTx(a), [buyer]), 'InvalidStatus');

      const b = await t.proposed();
      await send(t.declineTx(b), [seller]);
      await expectError(send(t.declineTx(b), [seller]), 'InvalidStatus');
    });

    it('in-person-only instructions on a digital order, and digital-only ones on an in-person order', async () => {
      const digital = await t.funded();
      await expectError(send(t.acceptTx(digital), [seller]), 'WrongOrderKind');
      await expectError(send(t.declineTx(digital), [seller]), 'WrongOrderKind');

      const physical = await t.createPhysical();
      await expectError(send(t.fundTx(physical), [buyer]), 'PhysicalNotSupported');
      const proposed = await t.proposed();
      await expectError(send(t.openTx(proposed), [buyer]), 'PhysicalNotSupported');
      await expectError(send(t.cancelTx(proposed), [buyer]), 'PhysicalNotSupported');
    });
  });
});
