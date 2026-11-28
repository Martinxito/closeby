// Chain mode, step 1 of an escrow action: build the transaction for the logged-in user.
// Returns it unsigned, with our fee payer as fee payer, plus the relay ticket
// (lib/solana/relay.ts). The browser signs it and posts it to /api/escrow/submit.
import { NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth/server';
import { instructionsFor } from '@/lib/escrow/chain-actions';
import { parseAction } from '@/lib/escrow/parse';
import { escrowMode } from '@/lib/escrow/server';
import { EscrowError } from '@/lib/escrow/types';
import { PublicKey } from '@solana/web3.js';
import { prepareSponsored } from '@/lib/solana/relay';

export async function POST(request: Request) {
  if (escrowMode() !== 'chain') return error(404, 'NotFound', 'Chain mode is disabled.');

  const signer = await authenticate(request);
  if (!signer) return error(401, 'Unauthorized', 'Log in first.');

  const action = parseAction(await request.json().catch(() => null), signer);
  if (!action) return error(400, 'BadRequest', 'Invalid action.');

  try {
    const instructions = await instructionsFor(action);
    const prepared = await prepareSponsored(instructions, new PublicKey(signer));
    return NextResponse.json(prepared, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    if (err instanceof EscrowError) return error(409, err.code, err.message);
    console.error(err);
    return error(502, 'Internal', 'Could not prepare the transaction.');
  }
}

function error(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { 'Cache-Control': 'no-store' } });
}
