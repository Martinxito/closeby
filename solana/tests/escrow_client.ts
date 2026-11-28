// Tests for the web client in solana/client/: the same builders and readers the web
// will call in chain mode, run against the local validator.
// Runs after closeby_escrow.ts (see Anchor.toml), which initializes the config.

import { Keypair } from '@solana/web3.js';
import { assert } from 'chai';
import { randomBytes } from 'node:crypto';
import { createEscrowClient, dealIdToBN, escrowErrorName, userTokenAddress, type EscrowClient } from '../client';
import { PRICE, randomOrderId, testbed as t } from './support/testbed';

describe('escrow client', () => {
  const { buyer, stranger, sendInstructions, balance } = t;
  const contentHash = randomBytes(32).toString('hex');
  let escrow: EscrowClient;

  before(async () => {
    await t.setup();
    escrow = createEscrowClient({ connection: t.connection, usdcMint: t.mint, feePayer: t.feePayer.publicKey });
  });

  /** A seller with no USDC account yet: the payout must create it. */
  const newSeller = () => Keypair.generate();
  const newDealId = () => randomOrderId().toString(10);

  async function publish(seller: Keypair, dealId: string) {
    const ixs = await escrow.build.createOrder({ seller: seller.publicKey, dealId, amount: PRICE.toNumber(), contentHash });
    await sendInstructions(ixs, [seller]);
  }

  it('runs the digital flow and reads each state in the web’s Order shape', async () => {
    const seller = newSeller();
    const dealId = newDealId();
    const ref = { seller: seller.publicKey.toBase58(), dealId, buyer: buyer.publicKey.toBase58() };

    assert.isNull(await escrow.fetchOrder(ref.seller, dealId));

    await publish(seller, dealId);
    let order = await escrow.fetchOrder(ref.seller, dealId);
    assert.deepEqual(order, {
      dealId,
      kind: 'digital',
      seller: ref.seller,
      buyer: null,
      amount: PRICE.toNumber(),
      contentHash,
      status: 'Created',
      claimDeadline: null,
      releaseDeadline: null,
    });

    await sendInstructions(await escrow.build.fund(ref), [buyer]);
    order = await escrow.fetchOrder(ref.seller, dealId);
    assert.equal(order!.status, 'Funded');
    assert.equal(order!.buyer, ref.buyer);
    assert.isNumber(order!.claimDeadline);

    await sendInstructions(await escrow.build.openDelivery(ref), [buyer]);
    assert.equal((await escrow.fetchOrder(ref.seller, dealId))!.status, 'Delivered');

    const last = await sendInstructions(await escrow.build.confirmHandover(ref), [buyer]);
    order = await escrow.fetchOrder(ref.seller, dealId);
    assert.equal(order!.status, 'Released');
    // The seller had no USDC account: confirm_handover created it and paid into it.
    assert.equal(await balance(userTokenAddress(seller.publicKey, t.mint)), PRICE.toNumber());
    assert.equal(await escrow.findLastSignature(ref.seller, dealId), last);
  });

  it('refunds the buyer on buyer_cancel', async () => {
    const seller = newSeller();
    const dealId = newDealId();
    const ref = { seller: seller.publicKey, dealId, buyer: buyer.publicKey };
    await publish(seller, dealId);
    await sendInstructions(await escrow.build.fund(ref), [buyer]);

    const before = await balance(t.buyerToken);
    await sendInstructions(await escrow.build.buyerCancel(ref), [buyer]);
    assert.equal((await escrow.fetchOrder(seller.publicKey, dealId))!.status, 'Refunded');
    assert.equal(await balance(t.buyerToken), before + PRICE.toNumber());
  });

  it('names program errors the way the web expects', async () => {
    const seller = newSeller();
    const dealId = newDealId();
    await publish(seller, dealId);
    await sendInstructions(await escrow.build.fund({ seller: seller.publicKey, dealId, buyer: buyer.publicKey }), [buyer]);

    try {
      const ixs = await escrow.build.openDelivery({ seller: seller.publicKey, dealId, buyer: stranger.publicKey });
      await sendInstructions(ixs, [stranger]);
      assert.fail('a stranger must not unlock the file');
    } catch (err) {
      assert.equal(escrowErrorName(err), 'NotBuyer');
    }

    assert.equal(escrowErrorName(new Error('Transaction failed: {"InstructionError":[1,{"Custom":6003}]}')), 'InvalidStatus');
    assert.isNull(escrowErrorName(new Error('Blockhash not found')));
  });

  it('rejects invalid deal IDs and hashes before touching the chain', async () => {
    assert.throws(() => dealIdToBN('abc'));
    assert.throws(() => dealIdToBN('18446744073709551616')); // 2^64, one past u64
    assert.equal(dealIdToBN('18446744073709551615').toString(10), '18446744073709551615');

    let failed = false;
    await escrow.build.createOrder({ seller: newSeller().publicKey, dealId: newDealId(), amount: 1, contentHash: 'xyz' }).catch(() => (failed = true));
    assert.isTrue(failed);
  });
});
