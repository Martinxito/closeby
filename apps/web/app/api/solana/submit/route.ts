// Second half of a sponsored transaction (lib/solana/relay.ts): the browser posts the
// transaction the user signed plus the ticket from the prepare step. We verify that it
// is exactly what we built and that the logged-in user signed it, add our fee payer
// signature, send it and wait for confirmation.
import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { authenticate } from '@/lib/auth/server';
import { isSolanaConfigured } from '@/lib/solana/config';
import { RelayError, submitSponsored } from '@/lib/solana/relay';

export async function POST(request: Request) {
  if (!isSolanaConfigured()) return error(503, 'Solana is not configured on this server.');
  const address = await authenticate(request);
  if (!address) return error(401, 'Log in first.');

  const body = (await request.json().catch(() => null)) as { transaction?: unknown; ticket?: unknown } | null;
  if (typeof body?.transaction !== 'string' || typeof body.ticket !== 'string') return error(400, 'Invalid request.');

  try {
    const signature = await submitSponsored(body.transaction, body.ticket, new PublicKey(address));
    return NextResponse.json({ signature }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    if (err instanceof RelayError) return error(400, err.message);
    console.error(err);
    return error(502, 'Could not send the transaction.');
  }
}

function error(status: number, message: string) {
  return NextResponse.json({ error: { message } }, { status });
}
