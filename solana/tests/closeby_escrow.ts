// Tests for the Closeby escrow program (docs/escrow-changes.md).
//
// Like in production, users hold no SOL: a separate fee payer (our server) pays every
// fee and rent, and the seller and buyer only sign as themselves. Windows are a few
// seconds here so the deadline cases run quickly.
//
// Run with `anchor test` from solana/.

import * as anchor from '@anchor-lang/core';
import { BN, Program } from '@anchor-lang/core';
import {
  createAssociatedTokenAccount,
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  mintTo,
} from '@solana/spl-token';
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
} from '@solana/web3.js';
import { randomBytes } from 'node:crypto';
import { assert } from 'chai';
import type { ClosebyEscrow } from '../target/types/closeby_escrow';

const CLAIM_SECS = 5;
const REVIEW_SECS = 5;
const WAIT_PAST_WINDOW_MS = (CLAIM_SECS + 3) * 1000;
const PRICE = new BN(315_789); // ≈ $300.000 CLP at 950 CLP per USDC, 6 decimals
const FILE_HASH = Array.from(randomBytes(32));
const BPF_UPGRADEABLE_LOADER = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');

describe('closeby_escrow', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.ClosebyEscrow as Program<ClosebyEscrow>;
  const connection = provider.connection;
  const admin = (provider.wallet as anchor.Wallet).payer;

  const feePayer = Keypair.generate();
  const seller = Keypair.generate();
  const buyer = Keypair.generate();
  const stranger = Keypair.generate();

  let mint: PublicKey;
  let otherMint: PublicKey;
  let buyerToken: PublicKey;
  let sellerToken: PublicKey;
  let strangerToken: PublicKey;

  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('config')], program.programId);
  const [programData] = PublicKey.findProgramAddressSync([program.programId.toBuffer()], BPF_UPGRADEABLE_LOADER);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Sends a transaction paid by our fee payer, signed by the given users. */
  async function send(builder: { transaction(): Promise<Transaction> }, signers: Keypair[]): Promise<string> {
    const tx = await builder.transaction();
    tx.feePayer = feePayer.publicKey;
    return sendAndConfirmTransaction(connection, tx, [feePayer, ...signers], { commitment: 'confirmed' });
  }

  /** Expects the transaction to fail with this program error code (or log text). */
  async function expectError(promise: Promise<unknown>, code: string): Promise<void> {
    try {
      await promise;
    } catch (err: any) {
      const logs: string[] = err.logs ?? (typeof err.getLogs === 'function' ? await err.getLogs(connection) : []);
      const text = `${err.message ?? err}\n${(logs ?? []).join('\n')}`;
      assert.include(text, code, `expected ${code}, got:\n${text}`);
      return;
    }
    assert.fail(`expected the transaction to fail with ${code}`);
  }

  /** Expects the transaction to fail for any reason (used where the runtime, not our code, rejects it). */
  async function expectFailure(promise: Promise<unknown>): Promise<void> {
    try {
      await promise;
    } catch {
      return;
    }
    assert.fail('expected the transaction to fail');
  }

  const balance = async (account: PublicKey) => Number((await getAccount(connection, account, 'confirmed')).amount);
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const fetchOrder = (order: PublicKey) => program.account.order.fetch(order, 'confirmed');

  function orderAddresses(sellerKey: PublicKey, orderId: BN, orderMint = mint) {
    const [order] = PublicKey.findProgramAddressSync(
      [Buffer.from('order'), sellerKey.toBuffer(), orderId.toArrayLike(Buffer, 'le', 8)],
      program.programId,
    );
    return { order, vault: getAssociatedTokenAddressSync(orderMint, order, true) };
  }

  function randomOrderId(): BN {
    return new BN(randomBytes(8), 'le');
  }

  function createOrderTx(
    orderId: BN,
    opts: { amount?: BN; kind?: 'digital' | 'physical'; hash?: number[]; mint?: PublicKey } = {},
  ) {
    const orderMint = opts.mint ?? mint;
    const { order, vault } = orderAddresses(seller.publicKey, orderId, orderMint);
    const kind = opts.kind === 'physical' ? { physical: {} } : { digital: {} };
    return program.methods
      .createOrder(orderId, opts.amount ?? PRICE, kind, opts.hash ?? FILE_HASH)
      .accountsPartial({ payer: feePayer.publicKey, seller: seller.publicKey, config: configPda, mint: orderMint, order, vault });
  }

  async function createOrder(): Promise<{ order: PublicKey; vault: PublicKey }> {
    const orderId = randomOrderId();
    await send(createOrderTx(orderId), [seller]);
    return orderAddresses(seller.publicKey, orderId);
  }

  const fundTx = (o: { order: PublicKey; vault: PublicKey }, who = buyer, from = buyerToken) =>
    program.methods
      .fund()
      .accountsPartial({ buyer: who.publicKey, config: configPda, order: o.order, mint, buyerToken: from, vault: o.vault });

  const openTx = (o: { order: PublicKey }, who = buyer) =>
    program.methods.openDelivery().accountsPartial({ buyer: who.publicKey, config: configPda, order: o.order });

  const refundAccounts = (o: { order: PublicKey; vault: PublicKey }, who: Keypair, to: PublicKey) => ({
    caller: who.publicKey,
    order: o.order,
    mint,
    vault: o.vault,
    buyerToken: to,
  });

  const releaseAccounts = (o: { order: PublicKey; vault: PublicKey }, who: Keypair, to: PublicKey) => ({
    caller: who.publicKey,
    order: o.order,
    mint,
    vault: o.vault,
    sellerToken: to,
  });

  const cancelTx = (o: { order: PublicKey; vault: PublicKey }, who = buyer, to = buyerToken) =>
    program.methods.buyerCancel().accountsPartial(refundAccounts(o, who, to));
  const refundTx = (o: { order: PublicKey; vault: PublicKey }, who = stranger, to = buyerToken) =>
    program.methods.refundAfterDeadline().accountsPartial(refundAccounts(o, who, to));
  const confirmTx = (o: { order: PublicKey; vault: PublicKey }, who = buyer, to = sellerToken) =>
    program.methods.confirmHandover().accountsPartial(releaseAccounts(o, who, to));
  const releaseTx = (o: { order: PublicKey; vault: PublicKey }, who = stranger, to = sellerToken) =>
    program.methods.releaseAfterDeadline().accountsPartial(releaseAccounts(o, who, to));

  async function funded() {
    const o = await createOrder();
    await send(fundTx(o), [buyer]);
    return o;
  }

  async function delivered() {
    const o = await funded();
    await send(openTx(o), [buyer]);
    return o;
  }

  const initConfigTx = (who: Keypair) =>
    program.methods
      .initConfig(new BN(3600), new BN(3600), new BN(CLAIM_SECS), new BN(REVIEW_SECS))
      .accountsPartial({ admin: who.publicKey, config: configPda, usdcMint: mint, program: program.programId, programData });

  // ---------------------------------------------------------------------------
  // Setup: only the admin and our fee payer have SOL. Seller, buyer and stranger have none.
  // ---------------------------------------------------------------------------

  before(async () => {
    const sig = await connection.requestAirdrop(feePayer.publicKey, 10 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, 'confirmed');

    mint = await createMint(connection, admin, admin.publicKey, null, 6);
    otherMint = await createMint(connection, admin, admin.publicKey, null, 6);

    // The web creates these with the idempotent ATA instruction, paid by our fee payer.
    buyerToken = await createAssociatedTokenAccount(connection, feePayer, mint, buyer.publicKey);
    sellerToken = await createAssociatedTokenAccount(connection, feePayer, mint, seller.publicKey);
    strangerToken = await createAssociatedTokenAccount(connection, feePayer, mint, stranger.publicKey);
    await mintTo(connection, admin, mint, buyerToken, admin, 100_000_000_000); // 100.000 test USDC
  });

  describe('init_config', () => {
    it('rejects anyone who is not the upgrade authority', async () => {
      // feePayer has SOL to pay the rent, but did not deploy the program.
      await expectError(initConfigTx(feePayer).signers([feePayer]).rpc(), 'Unauthorized');
    });

    it('lets the upgrade authority set the mint and windows, once', async () => {
      await initConfigTx(admin).rpc();
      const config = await program.account.config.fetch(configPda);
      assert.ok(config.admin.equals(admin.publicKey));
      assert.ok(config.usdcMint.equals(mint));
      assert.equal(config.digitalClaimSecs.toNumber(), CLAIM_SECS);
      assert.equal(config.digitalReviewSecs.toNumber(), REVIEW_SECS);

      // A second init must fail (the account already exists) and leave the config untouched.
      await expectFailure(initConfigTx(admin).rpc());
      assert.ok((await program.account.config.fetch(configPda)).usdcMint.equals(mint));
    });
  });

  // ---------------------------------------------------------------------------
  // Happy path and the outcomes decided by rules
  // ---------------------------------------------------------------------------

  describe('outcomes', () => {
    it('create → fund → open_delivery → confirm pays the seller, users never need SOL', async () => {
      const buyerBefore = await balance(buyerToken);
      const sellerBefore = await balance(sellerToken);

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
      assert.equal(await balance(buyerToken), buyerBefore - PRICE.toNumber());

      await send(openTx(o), [buyer]);
      order = await fetchOrder(o.order);
      assert.deepEqual(order.status, { delivered: {} });
      assert.isAbove(order.releaseDeadline.toNumber(), 0);

      await send(confirmTx(o), [buyer]);
      order = await fetchOrder(o.order);
      assert.deepEqual(order.status, { released: {} });
      assert.equal(await balance(o.vault), 0);
      assert.equal(await balance(sellerToken), sellerBefore + PRICE.toNumber());

      // Our fee payer paid everything.
      assert.equal(await connection.getBalance(seller.publicKey), 0);
      assert.equal(await connection.getBalance(buyer.publicKey), 0);
    });

    it('buyer_cancel before unlocking: full refund to the buyer', async () => {
      const before = await balance(buyerToken);
      const o = await funded();
      await send(cancelTx(o), [buyer]);
      assert.deepEqual((await fetchOrder(o.order)).status, { refunded: {} });
      assert.equal(await balance(buyerToken), before);
      assert.equal(await balance(o.vault), 0);
    });

    it('never unlocked after the claim window: anyone triggers, the buyer is refunded', async () => {
      const before = await balance(buyerToken);
      const o = await funded();
      await sleep(WAIT_PAST_WINDOW_MS);
      await send(refundTx(o), [stranger]);
      assert.deepEqual((await fetchOrder(o.order)).status, { refunded: {} });
      assert.equal(await balance(buyerToken), before);
      assert.equal(await balance(strangerToken), 0);
    });

    it('unlocked and silent after the review window: anyone triggers, the seller is paid', async () => {
      const sellerBefore = await balance(sellerToken);
      const o = await delivered();
      await sleep(WAIT_PAST_WINDOW_MS);
      await send(releaseTx(o), [stranger]);
      assert.deepEqual((await fetchOrder(o.order)).status, { released: {} });
      assert.equal(await balance(sellerToken), sellerBefore + PRICE.toNumber());
      assert.equal(await balance(strangerToken), 0);
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
      await expectError(send(createOrderTx(randomOrderId(), { mint: otherMint }), [seller]), 'WrongMint');
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
      await expectError(send(fundTx(o, seller, sellerToken), [seller]), 'BuyerIsSeller');
    });

    it('paying twice', async () => {
      const o = await funded();
      await expectError(send(fundTx(o), [buyer]), 'InvalidStatus');
    });

    it('paying from someone else’s account', async () => {
      const o = await createOrder();
      await expectError(send(fundTx(o, stranger, buyerToken), [stranger]), 'WrongTokenAccount');
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
      await expectError(send(confirmTx(o, buyer, strangerToken), [buyer]), 'WrongTokenAccount');
      assert.equal(await balance(o.vault), PRICE.toNumber());
      assert.equal(await balance(strangerToken), 0);
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
      await expectError(send(refundTx(o, stranger, strangerToken), [stranger]), 'WrongTokenAccount');
      assert.equal(await balance(o.vault), PRICE.toNumber());
      assert.equal(await balance(strangerToken), 0);
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
