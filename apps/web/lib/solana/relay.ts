// Sponsored transactions: the user signs, our server pays the fee (and any rent).
// Server-only. Flow used by every user action on-chain (block 4: escrow instructions):
//
//   1. prepareSponsored(instructions, user)  → unsigned tx (base64) + ticket
//   2. the browser signs it with the user's embedded wallet (wallet.signTransaction)
//   3. submitSponsored(signedTx, ticket, user) → verifies (./ticket.ts), adds the fee
//      payer signature, sends and waits for confirmation → signature
//
// The user never needs SOL. Our fee payer never signs anything it did not build.
import 'server-only';

import {
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  type TransactionInstruction,
} from '@solana/web3.js';
import { getConnection, getFeePayer } from './config';
import { ticketFor, verifyUserSignedTransaction } from './ticket';

export type PreparedTransaction = {
  transaction: string; // base64, unsigned
  ticket: string;
};

export async function prepareSponsored(instructions: TransactionInstruction[], user: PublicKey): Promise<PreparedTransaction> {
  const feePayer = getFeePayer().publicKey;
  // The user must be a signer, or our server would be paying for a transaction nobody asked for.
  if (!instructions.some((ix) => ix.keys.some((k) => k.isSigner && k.pubkey.equals(user)))) {
    throw new Error('The user must sign at least one instruction.');
  }

  const { blockhash } = await getConnection().getLatestBlockhash('confirmed');
  const message = new TransactionMessage({ payerKey: feePayer, recentBlockhash: blockhash, instructions }).compileToV0Message();
  const tx = new VersionedTransaction(message);

  return {
    transaction: Buffer.from(tx.serialize()).toString('base64'),
    ticket: ticketFor(message.serialize()),
  };
}

export class RelayError extends Error {}

export async function submitSponsored(signedBase64: string, ticket: string, user: PublicKey): Promise<string> {
  let tx: VersionedTransaction;
  try {
    tx = VersionedTransaction.deserialize(Buffer.from(signedBase64, 'base64'));
  } catch {
    throw new RelayError('Invalid transaction.');
  }

  const feePayer = getFeePayer();
  const check = verifyUserSignedTransaction(tx, ticket, feePayer.publicKey, user);
  if (!check.ok) throw new RelayError(check.reason);

  tx.sign([feePayer]);
  const connection = getConnection();
  const signature = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 3 });

  // Wait until the cluster confirms it: the UI must never show "paid" from a callback alone.
  // The current block height limit is at or after the transaction's own, so this waits at
  // most a little longer than needed if the transaction is dropped.
  const latest = await connection.getLatestBlockhash('confirmed');
  const result = await connection.confirmTransaction(
    { signature, blockhash: tx.message.recentBlockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
    'confirmed',
  );
  if (result.value.err) throw new RelayError(`Transaction failed: ${JSON.stringify(result.value.err)}`);
  return signature;
}
