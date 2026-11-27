import { beforeAll, describe, expect, it } from 'vitest';
import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { ticketFor, verifyUserSignedTransaction } from './ticket';

const MEMO = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const BLOCKHASH = '11111111111111111111111111111111';
const feePayer = Keypair.generate();
const user = Keypair.generate();
const attacker = Keypair.generate();

beforeAll(() => {
  process.env.RELAY_TICKET_SECRET = 'test-relay-secret';
});

function memo(signer: PublicKey, text = 'hola') {
  return new TransactionInstruction({ programId: MEMO, keys: [{ pubkey: signer, isSigner: true, isWritable: false }], data: Buffer.from(text) });
}

/** What our server builds: fee payer first, user as signer, plus its ticket. */
function build(instructions = [memo(user.publicKey)], payer = feePayer.publicKey) {
  const message = new TransactionMessage({ payerKey: payer, recentBlockhash: BLOCKHASH, instructions }).compileToV0Message();
  return { tx: new VersionedTransaction(message), ticket: ticketFor(message.serialize()) };
}

describe('verifyUserSignedTransaction', () => {
  it('accepts the exact transaction we built, signed by the user', () => {
    const { tx, ticket } = build();
    tx.sign([user]);
    expect(verifyUserSignedTransaction(tx, ticket, feePayer.publicKey, user.publicKey)).toEqual({ ok: true });
  });

  it('rejects a transaction modified after we built it (e.g. a transfer out of our fee payer)', () => {
    const { ticket } = build();
    const drain = SystemProgram.transfer({ fromPubkey: feePayer.publicKey, toPubkey: attacker.publicKey, lamports: 1_000_000 });
    const { tx: tampered } = build([memo(user.publicKey), drain]);
    tampered.sign([user]);
    const result = verifyUserSignedTransaction(tampered, ticket, feePayer.publicKey, user.publicKey);
    expect(result.ok).toBe(false);
  });

  it('rejects a ticket we did not issue', () => {
    const { tx } = build();
    tx.sign([user]);
    expect(verifyUserSignedTransaction(tx, 'forged-ticket', feePayer.publicKey, user.publicKey).ok).toBe(false);
  });

  it('rejects when the user has not signed', () => {
    const { tx, ticket } = build();
    expect(verifyUserSignedTransaction(tx, ticket, feePayer.publicKey, user.publicKey).ok).toBe(false);
  });

  it('rejects when the logged-in user is not the signer (someone else signed)', () => {
    const { tx, ticket } = build([memo(attacker.publicKey)]);
    tx.sign([attacker]);
    expect(verifyUserSignedTransaction(tx, ticket, feePayer.publicKey, user.publicKey).ok).toBe(false);
  });

  it('rejects a transaction whose fee payer is not ours', () => {
    const { tx, ticket } = build([memo(user.publicKey)], attacker.publicKey);
    tx.sign([user]);
    expect(verifyUserSignedTransaction(tx, ticket, feePayer.publicKey, user.publicKey).ok).toBe(false);
  });

  it('rejects a corrupted user signature', () => {
    const { tx, ticket } = build();
    tx.sign([user]);
    const index = tx.message.staticAccountKeys.findIndex((k) => k.equals(user.publicKey));
    tx.signatures[index]![0]! ^= 0xff;
    expect(verifyUserSignedTransaction(tx, ticket, feePayer.publicKey, user.publicKey).ok).toBe(false);
  });
});
