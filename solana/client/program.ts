// The Anchor program object, built from the IDL in solana/idl/. It is only used to
// encode instructions and decode accounts, so it needs a connection but no wallet:
// users sign elsewhere (their embedded wallet) and our server adds the fee payer.

import { Program } from '@anchor-lang/core';
import type { Connection } from '@solana/web3.js';
import idlJson from '../idl/closeby_escrow.json';
import type { ClosebyEscrow } from '../idl/closeby_escrow';

export type EscrowProgram = Program<ClosebyEscrow>;

export const IDL = idlJson as ClosebyEscrow;

export function createProgram(connection: Connection): EscrowProgram {
  return new Program<ClosebyEscrow>(IDL, { connection });
}
