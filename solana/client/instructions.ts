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
    /** Seller publishes a digital sale. `amount` in USDC base units; `contentHash` is the file's SHA-256 in hex. */
    async createOrder(ref: OrderRef & { amount: number | bigint; contentHash: string }): Promise<TransactionInstruction[]> {
      if (!/^[0-9a-f]{64}$/.test(ref.contentHash)) throw new Error('contentHash must be 64 lowercase hex characters.');
      const ix = await program.methods
        .createOrder(dealIdToBN(ref.dealId), new BN(ref.amount.toString()), { digital: {} }, [...Buffer.from(ref.contentHash, 'hex')])
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

    /** Anyone, after the claim deadline: refund to the order's `buyer`. */
    async refundAfterDeadline(ref: OrderRef & { buyer: Address; caller: Address }): Promise<TransactionInstruction[]> {
      const ix = await program.methods.refundAfterDeadline().accountsStrict(refundAccounts(ref, ref.caller, ref.buyer)).instruction();
      return [ensureTokenAccount(ref.buyer), ix];
    },

    /** Buyer presses "Recibí el archivo": pay the seller. */
    async confirmHandover(ref: OrderRef & { buyer: Address }): Promise<TransactionInstruction[]> {
      const ix = await program.methods.confirmHandover().accountsStrict(releaseAccounts(ref, ref.buyer)).instruction();
      return [ensureTokenAccount(ref.seller), ix];
    },

    /** Anyone, after the review deadline: pay the seller. */
    async releaseAfterDeadline(ref: OrderRef & { caller: Address }): Promise<TransactionInstruction[]> {
      const ix = await program.methods.releaseAfterDeadline().accountsStrict(releaseAccounts(ref, ref.caller)).instruction();
      return [ensureTokenAccount(ref.seller), ix];
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
