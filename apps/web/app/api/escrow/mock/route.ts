// Mock escrow endpoint: stands in for sending a transaction to the Solana program.
// Only active when ESCROW_MODE is "mock" (the default until the program is on Devnet).
import { NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth/server';
import { escrowMode, runMockAction } from '@/lib/escrow/server';
import { parseAction } from '@/lib/escrow/parse';
import { EscrowError } from '@/lib/escrow/types';

export async function POST(request: Request) {
  if (escrowMode() !== 'mock') {
    return NextResponse.json({ error: { code: 'NotFound', message: 'Mock escrow is disabled.' } }, { status: 404 });
  }

  // The signer is whoever the session token says, like a real signature would prove.
  // The body's `signer` is ignored.
  const signer = await authenticate(request);
  if (!signer) {
    return NextResponse.json({ error: { code: 'Unauthorized', message: 'Log in first.' } }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const action = parseAction(body, signer);
  if (!action) {
    return NextResponse.json({ error: { code: 'BadRequest', message: 'Invalid action.' } }, { status: 400 });
  }

  try {
    return NextResponse.json(await runMockAction(action));
  } catch (err) {
    if (err instanceof EscrowError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: 409 });
    }
    console.error(err);
    return NextResponse.json({ error: { code: 'Internal', message: 'Something went wrong.' } }, { status: 500 });
  }
}
