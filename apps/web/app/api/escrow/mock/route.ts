// Mock escrow endpoint: stands in for sending a transaction to the Solana program.
// Only active when ESCROW_MODE is "mock" (the default until the program is on Devnet).
import { NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth/server';
import { escrowMode, runMockAction } from '@/lib/escrow/server';
import { EscrowError, type EscrowAction, type EscrowActionType } from '@/lib/escrow/types';

const ACTIONS: EscrowActionType[] = [
  'create_order',
  'fund',
  'open_delivery',
  'buyer_cancel',
  'confirm_handover',
  'refund_after_deadline',
  'release_after_deadline',
];

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
  const action = parseAction(body && typeof body === 'object' ? { ...body, signer } : null);
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

function parseAction(body: unknown): EscrowAction | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (!ACTIONS.includes(b.type as EscrowActionType)) return null;
  if (typeof b.dealId !== 'string' || !/^[0-9]{1,20}$/.test(b.dealId)) return null;
  if (typeof b.signer !== 'string' || b.signer.length < 32 || b.signer.length > 44) return null;

  if (b.type === 'create_order') {
    if (typeof b.amount !== 'number' || (b.kind !== 'digital' && b.kind !== 'physical')) return null;
    if (b.contentHash !== null && typeof b.contentHash !== 'string') return null;
    return {
      type: 'create_order',
      dealId: b.dealId,
      signer: b.signer,
      amount: b.amount,
      kind: b.kind,
      contentHash: (b.contentHash as string | null) ?? null,
    };
  }
  return { type: b.type as Exclude<EscrowActionType, 'create_order'>, dealId: b.dealId, signer: b.signer };
}
