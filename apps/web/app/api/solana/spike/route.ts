// Signing spike (docs/plan.md, block 1, Diego): proves that the embedded wallet can sign
// a transaction that our server pays for, with no pop-up, on a real phone.
// Returns a sponsored transaction with a single Memo instruction signed by the user.
// The browser signs it with wallet.signTransaction and posts it to /api/solana/submit.
import { NextResponse } from 'next/server';
import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import { authenticate } from '@/lib/auth/server';
import { isSolanaConfigured } from '@/lib/solana/config';
import { prepareSponsored } from '@/lib/solana/relay';

const MEMO_PROGRAM = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

export async function POST(request: Request) {
  if (!isSolanaConfigured()) return error(503, 'Solana is not configured on this server.');
  const address = await authenticate(request);
  if (!address) return error(401, 'Log in first.');

  try {
    const user = new PublicKey(address);
    const memo = new TransactionInstruction({
      programId: MEMO_PROGRAM,
      keys: [{ pubkey: user, isSigner: true, isWritable: false }],
      data: Buffer.from(`Closeby signing spike ${new Date().toISOString()}`),
    });
    return NextResponse.json(await prepareSponsored([memo], user), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error(err);
    return error(502, 'Could not prepare the transaction.');
  }
}

function error(status: number, message: string) {
  return NextResponse.json({ error: { message } }, { status });
}
