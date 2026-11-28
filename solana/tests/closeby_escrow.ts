// Tests for the Closeby escrow program (docs/escrow-changes.md).
// Setup, helpers and instruction builders live in ./support/testbed.ts.
//
// Run with `pnpm --filter @closeby/solana test`.

import { BN } from '@anchor-lang/core';
import { assert } from 'chai';
import {
  CLAIM_SECS,
  FILE_HASH,
  PRICE,
  REVIEW_SECS,
  WAIT_PAST_WINDOW_MS,
  Testbed,
  expectFailure,
  randomOrderId,
  sleep,
} from './support/testbed';

describe('closeby_escrow', () => {
  const t = new Testbed();
  const { admin, buyer, seller, stranger, feePayer, connection } = t;
  const { send, expectError, balance, fetchOrder, fetchConfig, orderAddresses } = t;
  const { initConfigTx, createOrderTx, fundTx, openTx, cancelTx, refundTx, confirmTx, releaseTx } = t;
  const { createOrder, funded, delivered } = t;

  before(t.setup);

  describe('init_config', () => {
    it('rejects anyone who is not the upgrade authority', async () => {
      // feePayer has SOL to pay the rent, but did not deploy the program.
      await expectError(initConfigTx(feePayer).signers([feePayer]).rpc(), 'Unauthorized');
    });

    it('lets the upgrade authority set the mint and windows, once', async () => {
      await initConfigTx(admin).rpc();
      const config = await fetchConfig();
      assert.ok(config.admin.equals(admin.publicKey));
      assert.ok(config.usdcMint.equals(t.mint));
      assert.equal(config.digitalClaimSecs.toNumber(), CLAIM_SECS);
      assert.equal(config.digitalReviewSecs.toNumber(), REVIEW_SECS);

      // A second init must fail (the account already exists) and leave the config untouched.
      await expectFailure(initConfigTx(admin).rpc());
      assert.ok((await fetchConfig()).usdcMint.equals(t.mint));
    });
  });

  // ---------------------------------------------------------------------------
  // Happy path and the outcomes decided by rules
  // ---------------------------------------------------------------------------

  describe('outcomes', () => {
    it('create → fund → open_delivery → confirm pays the seller, users never need SOL', async () => {
      const buyerBefore = await balance(t.buyerToken);
      const sellerBefore = await balance(t.sellerToken);

      const o = await createOrder();
      let order = await fetchOrder(o.order);
      assert.deepEqual(order.status, { created: {} });
      assert.deepEqual(order.contentHash, FILE_HASH);
      assert.isNull(order.buyer);

      await send(fundTx(o), [buyer]);
      order = await fetchOrder(o.order);
      assert.deepEqual(order.status, { funded: {} });
      assert.ok(order.buyer!.equals(buyer.publicKey));
      assert.equal(await balance(o.vault), PRICE.toNumber());
      assert.equal(await balance(t.buyerToken), buyerBefore - PRICE.toNumber());

      await send(openTx(o), [buyer]);
      order = await fetchOrder(o.order);
      assert.deepEqual(order.status, { delivered: {} });
      assert.isAbove(order.releaseDeadline.toNumber(), 0);

      await send(confirmTx(o), [buyer]);
      order = await fetchOrder(o.order);
      assert.deepEqual(order.status, { released: {} });
      assert.equal(await balance(o.vault), 0);
      assert.equal(await balance(t.sellerToken), sellerBefore + PRICE.toNumber());

      // Our fee payer paid everything.
      assert.equal(await connection.getBalance(seller.publicKey), 0);
      assert.equal(await connection.getBalance(buyer.publicKey), 0);
    });

    it('buyer_cancel before unlocking: full refund to the buyer', async () => {
      const before = await balance(t.buyerToken);
      const o = await funded();
      await send(cancelTx(o), [buyer]);
      assert.deepEqual((await fetchOrder(o.order)).status, { refunded: {} });
      assert.equal(await balance(t.buyerToken), before);
      assert.equal(await balance(o.vault), 0);
    });

    it('never unlocked after the claim window: anyone triggers, the buyer is refunded', async () => {
      const before = await balance(t.buyerToken);
      const o = await funded();
      await sleep(WAIT_PAST_WINDOW_MS);
      await send(refundTx(o), [stranger]);
      assert.deepEqual((await fetchOrder(o.order)).status, { refunded: {} });
      assert.equal(await balance(t.buyerToken), before);
      assert.equal(await balance(t.strangerToken), 0);
    });

    it('unlocked and silent after the review window: anyone triggers, the seller is paid', async () => {
      const sellerBefore = await balance(t.sellerToken);
      const o = await delivered();
      await sleep(WAIT_PAST_WINDOW_MS);
      await send(releaseTx(o), [stranger]);
      assert.deepEqual((await fetchOrder(o.order)).status, { released: {} });
      assert.equal(await balance(t.sellerToken), sellerBefore + PRICE.toNumber());
      assert.equal(await balance(t.strangerToken), 0);
    });
  });

  // ---------------------------------------------------------------------------
  // Cases that must fail (docs/escrow-changes.md and the original spec)
  // ---------------------------------------------------------------------------

  describe('create_order rejects', () => {
    it('an all-zero content hash', async () => {
      await expectError(send(createOrderTx(randomOrderId(), { hash: new Array(32).fill(0) }), [seller]), 'InvalidContentHash');
    });

    it('a zero amount', async () => {
      await expectError(send(createOrderTx(randomOrderId(), { amount: new BN(0) }), [seller]), 'InvalidAmount');
    });

    it('in-person orders (not in this version)', async () => {
      await expectError(send(createOrderTx(randomOrderId(), { kind: 'physical' }), [seller]), 'PhysicalNotSupported');
    });

    it('a token other than the configured USDC', async () => {
      await expectError(send(createOrderTx(randomOrderId(), { mint: t.otherMint }), [seller]), 'WrongMint');
    });

    it('reusing an order ID (an order can never be overwritten)', async () => {
      const orderId = randomOrderId();
      await send(createOrderTx(orderId), [seller]);
      // Same ID with another price must fail and leave the original order untouched.
      await expectFailure(send(createOrderTx(orderId, { amount: new BN(1) }), [seller]));
      const { order } = orderAddresses(seller.publicKey, orderId);
      assert.equal((await fetchOrder(order)).amount.toNumber(), PRICE.toNumber());
    });
  });

  describe('fund rejects', () => {
    it('the seller buying their own deal', async () => {
      const o = await createOrder();
      await expectError(send(fundTx(o, seller, t.sellerToken), [seller]), 'BuyerIsSeller');
    });

    it('paying twice', async () => {
      const o = await funded();
      await expectError(send(fundTx(o), [buyer]), 'InvalidStatus');
    });

    it('paying from someone else’s account', async () => {
      const o = await createOrder();
      await expectError(send(fundTx(o, stranger, t.buyerToken), [stranger]), 'WrongTokenAccount');
    });
  });

  describe('open_delivery rejects', () => {
    it('anyone other than the buyer', async () => {
      const o = await funded();
      await expectError(send(openTx(o, stranger), [stranger]), 'NotBuyer');
      await expectError(send(openTx(o, seller), [seller]), 'NotBuyer');
    });

    it('unlocking after the claim deadline', async () => {
      const o = await funded();
      await sleep(WAIT_PAST_WINDOW_MS);
      await expectError(send(openTx(o), [buyer]), 'ClaimWindowClosed');
    });
  });

  describe('buyer_cancel rejects', () => {
    it('cancelling after unlocking (the point of no return)', async () => {
      const o = await delivered();
      await expectError(send(cancelTx(o), [buyer]), 'InvalidStatus');
    });

    it('anyone other than the buyer', async () => {
      const o = await funded();
      await expectError(send(cancelTx(o, stranger), [stranger]), 'NotBuyer');
    });
  });

  describe('confirm_handover rejects', () => {
    it('the seller or a stranger confirming', async () => {
      const o = await delivered();
      await expectError(send(confirmTx(o, seller), [seller]), 'NotBuyer');
      await expectError(send(confirmTx(o, stranger), [stranger]), 'NotBuyer');
    });

    it('confirming before unlocking', async () => {
      const o = await funded();
      await expectError(send(confirmTx(o), [buyer]), 'InvalidStatus');
    });

    it('sending the payment anywhere but the seller, leaving balances unchanged', async () => {
      const o = await delivered();
      await expectError(send(confirmTx(o, buyer, t.strangerToken), [buyer]), 'WrongTokenAccount');
      assert.equal(await balance(o.vault), PRICE.toNumber());
      assert.equal(await balance(t.strangerToken), 0);
    });

    it('confirming twice', async () => {
      const o = await delivered();
      await send(confirmTx(o), [buyer]);
      await expectError(send(confirmTx(o), [buyer]), 'InvalidStatus');
    });
  });

  describe('deadline actions reject', () => {
    it('refund_after_deadline before the claim deadline', async () => {
      const o = await funded();
      await expectError(send(refundTx(o), [stranger]), 'DeadlineNotReached');
    });

    it('release_after_deadline before the review deadline', async () => {
      const o = await delivered();
      await expectError(send(releaseTx(o), [stranger]), 'DeadlineNotReached');
    });

    it('refund_after_deadline on a Delivered order, release_after_deadline on a Funded order', async () => {
      const unlocked = await delivered();
      const paid = await funded();
      await sleep(WAIT_PAST_WINDOW_MS);
      await expectError(send(refundTx(unlocked), [stranger]), 'InvalidStatus');
      await expectError(send(releaseTx(paid), [stranger]), 'InvalidStatus');
    });

    it('redirecting a refund to the caller, leaving balances unchanged', async () => {
      const o = await funded();
      await sleep(WAIT_PAST_WINDOW_MS);
      await expectError(send(refundTx(o, stranger, t.strangerToken), [stranger]), 'WrongTokenAccount');
      assert.equal(await balance(o.vault), PRICE.toNumber());
      assert.equal(await balance(t.strangerToken), 0);
    });

    it('refunding twice', async () => {
      const o = await funded();
      await send(cancelTx(o), [buyer]);
      await expectError(send(cancelTx(o), [buyer]), 'InvalidStatus');
      await sleep(WAIT_PAST_WINDOW_MS);
      await expectError(send(refundTx(o), [stranger]), 'InvalidStatus');
    });
  });
});
