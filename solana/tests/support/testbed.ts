// Shared setup and helpers for the escrow tests.
//
// Like in production, users hold no SOL: a separate fee payer (our server) pays every
// fee and rent, and the seller and buyer only sign as themselves. Windows are a few
// seconds so the deadline cases run quickly.

import * as anchor from '@anchor-lang/core';
import { BN, Program } from '@anchor-lang/core';
import {
  createAssociatedTokenAccount,
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  mintTo,
} from '@solana/spl-token';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, sendAndConfirmTransaction, Transaction } from '@solana/web3.js';
import { randomBytes } from 'node:crypto';
import { assert } from 'chai';
import type { ClosebyEscrow } from '../../target/types/closeby_escrow';

export const CLAIM_SECS = 5;
export const REVIEW_SECS = 5;
export const WAIT_PAST_WINDOW_MS = (CLAIM_SECS + 3) * 1000;
export const PRICE = new BN(315_789); // ≈ $300.000 CLP at 950 CLP per USDC, 6 decimals
export const FILE_HASH = Array.from(randomBytes(32));
const BPF_UPGRADEABLE_LOADER = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');

export type OrderRef = { order: PublicKey; vault: PublicKey };
type Builder = { transaction(): Promise<Transaction> };

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export const randomOrderId = () => new BN(randomBytes(8), 'le');

/** Expects the promise to fail for any reason (where the runtime, not our code, rejects it). */
export async function expectFailure(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
  } catch {
    return;
  }
  assert.fail('expected the transaction to fail');
}

function confirmedProvider(): anchor.AnchorProvider {
  const env = anchor.AnchorProvider.env();
  const connection = new Connection(env.connection.rpcEndpoint, 'confirmed');
  return new anchor.AnchorProvider(connection, env.wallet, { commitment: 'confirmed', preflightCommitment: 'confirmed' });
}

export class Testbed {
  // Everything at "confirmed": "processed" blockhashes can be rejected by a young validator.
  readonly provider = confirmedProvider();
  readonly program: Program<ClosebyEscrow>;
  readonly connection = this.provider.connection;
  readonly admin = (this.provider.wallet as anchor.Wallet).payer;

  readonly feePayer = Keypair.generate();
  readonly seller = Keypair.generate();
  readonly buyer = Keypair.generate();
  readonly stranger = Keypair.generate();

  // Set by setup().
  mint!: PublicKey;
  otherMint!: PublicKey;
  buyerToken!: PublicKey;
  sellerToken!: PublicKey;
  strangerToken!: PublicKey;

  readonly configPda: PublicKey;
  readonly programData: PublicKey;

  constructor() {
    anchor.setProvider(this.provider);
    this.program = anchor.workspace.ClosebyEscrow as Program<ClosebyEscrow>;
    [this.configPda] = PublicKey.findProgramAddressSync([Buffer.from('config')], this.program.programId);
    [this.programData] = PublicKey.findProgramAddressSync([this.program.programId.toBuffer()], BPF_UPGRADEABLE_LOADER);
  }

  /** Only the admin and our fee payer get SOL. Seller, buyer and stranger have none. */
  setup = async () => {
    // A fresh local validator rejects early transactions with "Blockhash not found".
    // Wait until it has some history, like Anchor's own test runner does.
    while ((await this.connection.getBlockHeight('confirmed')) < 25) await sleep(400);

    const sig = await this.connection.requestAirdrop(this.feePayer.publicKey, 10 * LAMPORTS_PER_SOL);
    await this.connection.confirmTransaction(sig, 'confirmed');

    this.mint = await createMint(this.connection, this.admin, this.admin.publicKey, null, 6);
    this.otherMint = await createMint(this.connection, this.admin, this.admin.publicKey, null, 6);

    // The web creates these with the idempotent ATA instruction, paid by our fee payer.
    this.buyerToken = await createAssociatedTokenAccount(this.connection, this.feePayer, this.mint, this.buyer.publicKey);
    this.sellerToken = await createAssociatedTokenAccount(this.connection, this.feePayer, this.mint, this.seller.publicKey);
    this.strangerToken = await createAssociatedTokenAccount(this.connection, this.feePayer, this.mint, this.stranger.publicKey);
    await mintTo(this.connection, this.admin, this.mint, this.buyerToken, this.admin, 100_000_000_000); // 100.000 test USDC
  };

  // --- Sending and checking -------------------------------------------------

  /** Sends a transaction paid by our fee payer, signed by the given users. */
  send = async (builder: Builder, signers: Keypair[]): Promise<string> => {
    const tx = await builder.transaction();
    tx.feePayer = this.feePayer.publicKey;
    return sendAndConfirmTransaction(this.connection, tx, [this.feePayer, ...signers], { commitment: 'confirmed' });
  };

  /** Expects the transaction to fail with this program error code (or log text). */
  expectError = async (promise: Promise<unknown>, code: string): Promise<void> => {
    try {
      await promise;
    } catch (err: any) {
      const logs: string[] = err.logs ?? (typeof err.getLogs === 'function' ? await err.getLogs(this.connection) : []);
      const text = `${err.message ?? err}\n${(logs ?? []).join('\n')}`;
      assert.include(text, code, `expected ${code}, got:\n${text}`);
      return;
    }
    assert.fail(`expected the transaction to fail with ${code}`);
  };

  balance = async (account: PublicKey) => Number((await getAccount(this.connection, account, 'confirmed')).amount);
  fetchOrder = (order: PublicKey) => this.program.account.order.fetch(order, 'confirmed');
  fetchConfig = () => this.program.account.config.fetch(this.configPda, 'confirmed');

  orderAddresses = (sellerKey: PublicKey, orderId: BN, orderMint = this.mint): OrderRef => {
    const [order] = PublicKey.findProgramAddressSync(
      [Buffer.from('order'), sellerKey.toBuffer(), orderId.toArrayLike(Buffer, 'le', 8)],
      this.program.programId,
    );
    return { order, vault: getAssociatedTokenAddressSync(orderMint, order, true) };
  };

  // --- Instruction builders -------------------------------------------------

  initConfigTx = (who: Keypair) =>
    this.program.methods
      .initConfig(new BN(3600), new BN(3600), new BN(CLAIM_SECS), new BN(REVIEW_SECS))
      .accountsPartial({
        admin: who.publicKey,
        config: this.configPda,
        usdcMint: this.mint,
        program: this.program.programId,
        programData: this.programData,
      });

  createOrderTx = (orderId: BN, opts: { amount?: BN; kind?: 'digital' | 'physical'; hash?: number[]; mint?: PublicKey } = {}) => {
    const mint = opts.mint ?? this.mint;
    const { order, vault } = this.orderAddresses(this.seller.publicKey, orderId, mint);
    const kind = opts.kind === 'physical' ? { physical: {} } : { digital: {} };
    return this.program.methods
      .createOrder(orderId, opts.amount ?? PRICE, kind, opts.hash ?? FILE_HASH)
      .accountsPartial({ payer: this.feePayer.publicKey, seller: this.seller.publicKey, config: this.configPda, mint, order, vault });
  };

  fundTx = (o: OrderRef, who = this.buyer, from = this.buyerToken) =>
    this.program.methods
      .fund()
      .accountsPartial({ buyer: who.publicKey, config: this.configPda, order: o.order, mint: this.mint, buyerToken: from, vault: o.vault });

  openTx = (o: OrderRef, who = this.buyer) =>
    this.program.methods.openDelivery().accountsPartial({ buyer: who.publicKey, config: this.configPda, order: o.order });

  cancelTx = (o: OrderRef, who = this.buyer, to = this.buyerToken) =>
    this.program.methods.buyerCancel().accountsPartial(this.vaultAccounts(o, who, { buyerToken: to }));

  refundTx = (o: OrderRef, who = this.stranger, to = this.buyerToken) =>
    this.program.methods.refundAfterDeadline().accountsPartial(this.vaultAccounts(o, who, { buyerToken: to }));

  confirmTx = (o: OrderRef, who = this.buyer, to = this.sellerToken) =>
    this.program.methods.confirmHandover().accountsPartial(this.vaultAccounts(o, who, { sellerToken: to }));

  releaseTx = (o: OrderRef, who = this.stranger, to = this.sellerToken) =>
    this.program.methods.releaseAfterDeadline().accountsPartial(this.vaultAccounts(o, who, { sellerToken: to }));

  private vaultAccounts<T extends object>(o: OrderRef, who: Keypair, destination: T) {
    return { caller: who.publicKey, order: o.order, mint: this.mint, vault: o.vault, ...destination };
  }

  // --- Orders in a given state ----------------------------------------------

  createOrder = async (): Promise<OrderRef> => {
    const orderId = randomOrderId();
    await this.send(this.createOrderTx(orderId), [this.seller]);
    return this.orderAddresses(this.seller.publicKey, orderId);
  };

  funded = async (): Promise<OrderRef> => {
    const o = await this.createOrder();
    await this.send(this.fundTx(o), [this.buyer]);
    return o;
  };

  delivered = async (): Promise<OrderRef> => {
    const o = await this.funded();
    await this.send(this.openTx(o), [this.buyer]);
    return o;
  };
}
