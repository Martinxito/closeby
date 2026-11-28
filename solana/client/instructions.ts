// One builder per escrow action. Each returns the instructions to put in a single
// transaction, in order, ready for the web's relay (`prepareSponsored` in
// apps/web/lib/solana/relay.ts): our fee payer pays, the user signs as themselves.
//
// Before funding and before paying out, the builders prepend an idempotent
// "create associated token account" instruction paid by the fee payer, so the buyer's
// and seller's USDC accounts always exist (agreed in docs/escrow-changes.md).
//
// Every account is passed explicitly (`accountsStrict`), so what reaches the chain is
// exactly what is written here.

import { BN } from '@anchor-lang/core';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
} from '@solana/spl-token';
import { SystemProgram, type PublicKey, type TransactionInstruction } from '@solana/web3.js';
import {
  configAddress,
  dealIdToBN,
  orderAddress,
  programDataAddress,
  toPublicKey,
  userTokenAddress,
  vaultAddress,
  type Address,
} from './addresses';
import type { EscrowProgram } from './program';

/** Every order is found by its seller and deal ID. */
export type OrderRef = { seller: Address; dealId: string };

export type ConfigWindows = { acceptWindowSecs: number; graceSecs: number; claimSecs: number; reviewSecs: number };

export type EscrowBuilders = ReturnType<typeof createBuilders>;

export function createBuilders(program: EscrowProgram, mint: PublicKey, feePayer: PublicKey) {
  const config = configAddress();
  const tokenProgram = TOKEN_PROGRAM_ID;

  // --- Shared pieces --------------------------------------------------------

  function orderAccounts({ seller, dealId }: OrderRef) {
    const order = orderAddress(seller, dealId);
    return { order, vault: vaultAddress(order, mint) };
  }

  /** Creates `owner`'s USDC account if it is missing; a no-op otherwise. Paid by our fee payer. */
  function ensureTokenAccount(owner: Address): TransactionInstruction {
    const key = toPublicKey(owner);
    return createAssociatedTokenAccountIdempotentInstruction(feePayer, userTokenAddress(key, mint), key, mint);
  }

  /** Accounts of `buyer_cancel` and `refund_after_deadline` (the program's `Refund` context). */
  function refundAccounts(ref: OrderRef, caller: Address, buyer: Address) {
    return { caller: toPublicKey(caller), ...orderAccounts(ref), mint, buyerToken: userTokenAddress(buyer, mint), tokenProgram };
  }

  /** Accounts of `confirm_handover` and `release_after_deadline` (the program's `Release` context). */
  function releaseAccounts(ref: OrderRef, caller: Address) {
    return { caller: toPublicKey(caller), ...orderAccounts(ref), mint, sellerToken: userTokenAddress(ref.seller, mint), tokenProgram };
  }

  // --- Builders -------------------------------------------------------------

  return {
    /**
     * Seller publishes a sale. `amount` in USDC base units.
     * Digital: `contentHash` is the file's SHA-256 in hex. In-person (`kind: 'physical'`):
     * no hash (the program requires all zeros; the meeting place is committed later).
     */
    async createOrder(
      ref: OrderRef & { amount: number | bigint; kind?: 'digital' | 'physical'; contentHash?: string | null },
    ): Promise<TransactionInstruction[]> {
      const physical = ref.kind === 'physical';
      let hash = new Array<number>(32).fill(0);
      if (!physical) {
        if (!ref.contentHash || !/^[0-9a-f]{64}$/.test(ref.contentHash)) throw new Error('contentHash must be 64 lowercase hex characters.');
        hash = [...Buffer.from(ref.contentHash, 'hex')];
      }
      const ix = await program.methods
        .createOrder(dealIdToBN(ref.dealId), new BN(ref.amount.toString()), physical ? { physical: {} } : { digital: {} }, hash)
        .accountsStrict({
          payer: feePayer,
          seller: toPublicKey(ref.seller),
          config,
          mint,
          ...orderAccounts(ref),
          tokenProgram,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();
      return [ix];
    },

    /** Buyer pays the order amount into the vault. */
    async fund(ref: OrderRef & { buyer: Address }): Promise<TransactionInstruction[]> {
      const buyer = toPublicKey(ref.buyer);
      const ix = await program.methods
        .fund()
        .accountsStrict({ buyer, config, ...orderAccounts(ref), mint, buyerToken: userTokenAddress(buyer, mint), tokenProgram })
        .instruction();
      return [ensureTokenAccount(buyer), ix];
    },

    /** Buyer unlocks the file: the point of no return. */
    async openDelivery(ref: OrderRef & { buyer: Address }): Promise<TransactionInstruction[]> {
      const ix = await program.methods
        .openDelivery()
        .accountsStrict({ buyer: toPublicKey(ref.buyer), config, order: orderAccounts(ref).order })
        .instruction();
      return [ix];
    },

    /** Buyer cancels before unlocking: refund to the buyer. */
    async buyerCancel(ref: OrderRef & { buyer: Address }): Promise<TransactionInstruction[]> {
      const ix = await program.methods.buyerCancel().accountsStrict(refundAccounts(ref, ref.buyer, ref.buyer)).instruction();
      return [ensureTokenAccount(ref.buyer), ix];
    },

    /** Anyone, after the claim deadline (digital) or meeting + grace (in-person): refund to the order's `buyer`. */
    async refundAfterDeadline(ref: OrderRef & { buyer: Address; caller: Address }): Promise<TransactionInstruction[]> {
      const ix = await program.methods.refundAfterDeadline().accountsStrict(refundAccounts(ref, ref.caller, ref.buyer)).instruction();
      return [ensureTokenAccount(ref.buyer), ix];
    },

    /** Buyer presses "Recibí el archivo" / "Recibí el producto": pay the seller. */
    async confirmHandover(ref: OrderRef & { buyer: Address }): Promise<TransactionInstruction[]> {
      const ix = await program.methods.confirmHandover().accountsStrict(releaseAccounts(ref, ref.buyer)).instruction();
      return [ensureTokenAccount(ref.seller), ix];
    },

    /** Anyone, after the review deadline: pay the seller. */
    async releaseAfterDeadline(ref: OrderRef & { caller: Address }): Promise<TransactionInstruction[]> {
      const ix = await program.methods.releaseAfterDeadline().accountsStrict(releaseAccounts(ref, ref.caller)).instruction();
      return [ensureTokenAccount(ref.seller), ix];
    },

    // --- In-person ----------------------------------------------------------------

    /**
     * Buyer pays and proposes the meeting. `meetingTime` in unix seconds; `placeHash` is
     * the SHA-256 (hex) of the meeting place text, which stays off-chain.
     */
    async fundAndSchedule(ref: OrderRef & { buyer: Address; meetingTime: number; placeHash: string }): Promise<TransactionInstruction[]> {
      if (!/^[0-9a-f]{64}$/.test(ref.placeHash)) throw new Error('placeHash must be 64 lowercase hex characters.');
      const buyer = toPublicKey(ref.buyer);
      const ix = await program.methods
        .fundAndSchedule(new BN(ref.meetingTime), [...Buffer.from(ref.placeHash, 'hex')])
        .accountsStrict({ buyer, config, ...orderAccounts(ref), mint, buyerToken: userTokenAddress(buyer, mint), tokenProgram })
        .instruction();
      return [ensureTokenAccount(buyer), ix];
    },

    /** Seller accepts the proposed meeting. */
    async acceptMeeting(ref: OrderRef): Promise<TransactionInstruction[]> {
      const ix = await program.methods
        .acceptMeeting()
        .accountsStrict({ seller: toPublicKey(ref.seller), config, order: orderAccounts(ref).order })
        .instruction();
      return [ix];
    },

    /** Seller declines the proposed meeting: refund to the buyer. */
    async declineMeeting(ref: OrderRef & { buyer: Address }): Promise<TransactionInstruction[]> {
      const ix = await program.methods.declineMeeting().accountsStrict(refundAccounts(ref, ref.seller, ref.buyer)).instruction();
      return [ensureTokenAccount(ref.buyer), ix];
    },

    /** Anyone, once the seller's accept window is over: refund to the order's `buyer`. */
    async refundUnaccepted(ref: OrderRef & { buyer: Address; caller: Address }): Promise<TransactionInstruction[]> {
      const ix = await program.methods.refundUnaccepted().accountsStrict(refundAccounts(ref, ref.caller, ref.buyer)).instruction();
      return [ensureTokenAccount(ref.buyer), ix];
    },

    /** Buyer rejects the item at the meeting (from 30 min before): refund. */
    async rejectAtMeeting(ref: OrderRef & { buyer: Address }): Promise<TransactionInstruction[]> {
      const ix = await program.methods.rejectAtMeeting().accountsStrict(refundAccounts(ref, ref.buyer, ref.buyer)).instruction();
      return [ensureTokenAccount(ref.buyer), ix];
    },

    /** Seller cancels after accepting: refund to the buyer. */
    async sellerCancel(ref: OrderRef & { buyer: Address }): Promise<TransactionInstruction[]> {
      const ix = await program.methods.sellerCancel().accountsStrict(refundAccounts(ref, ref.seller, ref.buyer)).instruction();
      return [ensureTokenAccount(ref.buyer), ix];
    },

    /** One-time setup, signed by the program's upgrade authority. */
    async initConfig(admin: Address, windows: ConfigWindows): Promise<TransactionInstruction[]> {
      const ix = await program.methods
        .initConfig(new BN(windows.acceptWindowSecs), new BN(windows.graceSecs), new BN(windows.claimSecs), new BN(windows.reviewSecs))
        .accountsStrict({
          admin: toPublicKey(admin),
          config,
          usdcMint: mint,
          program: program.programId,
          programData: programDataAddress(),
          systemProgram: SystemProgram.programId,
        })
        .instruction();
      return [ix];
    },
  };
}
