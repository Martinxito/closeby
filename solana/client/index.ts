// Closeby escrow client: everything the web needs to talk to the program, in one place.
//
//   const escrow = createEscrowClient({ connection, usdcMint, feePayer });
//   const order = await escrow.fetchOrder(seller, dealId);              // read
//   const ixs = await escrow.build.fund({ seller, dealId, buyer });     // act
//   // → prepareSponsored(ixs, buyer) → user signs → submitSponsored(...)
//
// Guide: docs/program-plan.md, "Connecting the web".

import type { Connection } from '@solana/web3.js';
import { orderAddress, toPublicKey, type Address } from './addresses';
import { createBuilders } from './instructions';
import { fetchOrder, findLastSignature } from './orders';
import { createProgram } from './program';

export * from './addresses';
export { escrowErrorName } from './errors';
export type { ConfigWindows, EscrowBuilders, OrderRef } from './instructions';
export { toEscrowOrder, type EscrowOrder, type OrderKind, type OrderStatus } from './orders';
export { IDL, createProgram, type EscrowProgram } from './program';

export type EscrowClientOptions = {
  connection: Connection;
  /** Test USDC mint the program was configured with (`USDC_MINT`). */
  usdcMint: Address;
  /** Our server's fee payer: pays fees, rent and the users' token accounts. */
  feePayer: Address;
};

export function createEscrowClient({ connection, usdcMint, feePayer }: EscrowClientOptions) {
  const program = createProgram(connection);
  const mint = toPublicKey(usdcMint);

  return {
    program,
    mint,
    /** Instruction builders, one per action. */
    build: createBuilders(program, mint, toPublicKey(feePayer)),
    /** The order behind a deal, in the web's `Order` shape, or null. */
    fetchOrder: (seller: Address, dealId: string) => fetchOrder(program, seller, dealId),
    /** Latest successful transaction on the order, for "Ver comprobante". */
    findLastSignature: (seller: Address, dealId: string) => findLastSignature(connection, orderAddress(seller, dealId)),
  };
}

export type EscrowClient = ReturnType<typeof createEscrowClient>;
