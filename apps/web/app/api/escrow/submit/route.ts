// Chain mode, step 2 of an escrow action: relay the transaction the user signed.
// submitSponsored checks it is exactly what /prepare built and that the logged-in user
// signed it, adds our fee payer signature, sends it and waits for confirmation.
// Program errors come back with the same codes the UI already handles (EscrowErrorCode).
import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { escrowErrorName } from '@closeby/solana/client';
import { authenticate } from '@/lib/auth/server';
import { escrowMode } from '@/lib/escrow/server';
import { RelayError, submitSponsored } from '@/lib/solana/relay';

export async function POST(request: Request) {
  if (escrowMode() !== 'chain') return error(404, 'NotFound', 'Chain mode is disabled.');

  const signer = await authenticate(request);
  if (!signer) return error(401, 'Unauthorized', 'Log in first.');

  const body = (await request.json().catch(() => null)) as { transaction?: unknown; ticket?: unknown } | null;
  if (typeof body?.transaction !== 'string' || typeof body.ticket !== 'string') return error(400, 'BadRequest', 'Invalid request.');

  try {
    const signature = await submitSponsored(body.transaction, body.ticket, new PublicKey(signer));
    return NextResponse.json({ signature }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    // The program rejected it (e.g. NotBuyer, ClaimWindowClosed): same codes as the mock.
    const code = escrowErrorName(err);
    if (code) return error(409, code, code);
    if (insufficientFunds(err)) return error(409, 'InsufficientFunds', 'Not enough test USDC.');
    if (err instanceof RelayError) return error(400, 'RelayRejected', err.message);
    console.error(err);
    return error(502, 'Internal', 'Could not send the transaction.');
  }
}

/** The SPL Token program refuses a transfer above the balance ("insufficient funds", error 0x1). */
function insufficientFunds(err: unknown): boolean {
  const e = err as { message?: unknown; logs?: unknown; transactionLogs?: unknown } | null;
  const text = [String(e?.message ?? ''), ...[e?.logs, e?.transactionLogs].flatMap((l) => (Array.isArray(l) ? l : []))].join('\n');
  return /insufficient funds/i.test(text);
}

function error(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { 'Cache-Control': 'no-store' } });
}
