// The logged-in user's test balance, in USDC units and CLP.
// POST: "Cargar saldo de prueba" (mints test USDC, our server pays the fee).
// GET:  current balance.
import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { authenticate } from '@/lib/auth/server';
import { CLP_PER_USDC } from '@/lib/format';
import { FaucetError, getUsdcBalanceUnits, sendTestFunds } from '@/lib/solana/balance';
import { isSolanaConfigured } from '@/lib/solana/config';

export async function GET(request: Request) {
  const owner = await ownerOf(request);
  if (owner instanceof NextResponse) return owner;
  try {
    return json(toBalance(await getUsdcBalanceUnits(owner)));
  } catch (err) {
    console.error(err);
    return error(502, 'No pudimos revisar tu saldo. Intenta de nuevo.');
  }
}

export async function POST(request: Request) {
  const owner = await ownerOf(request);
  if (owner instanceof NextResponse) return owner;
  try {
    const { signature, balanceUnits } = await sendTestFunds(owner);
    return json({ ...toBalance(balanceUnits), signature });
  } catch (err) {
    if (err instanceof FaucetError) return error(409, err.message);
    console.error(err);
    return error(502, 'No pudimos cargar tu saldo de prueba. Intenta de nuevo en un rato.');
  }
}

async function ownerOf(request: Request): Promise<PublicKey | NextResponse> {
  if (!isSolanaConfigured()) return error(503, 'El saldo de prueba no está configurado en este servidor.');
  const address = await authenticate(request);
  if (!address) return error(401, 'Entra para ver tu saldo.');
  try {
    return new PublicKey(address);
  } catch {
    return error(400, 'Cuenta no válida.');
  }
}

function toBalance(units: number) {
  return { balanceUnits: units, balanceClp: Math.floor((units / 1_000_000) * CLP_PER_USDC) };
}

function json(body: unknown) {
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}

function error(status: number, message: string) {
  return NextResponse.json({ error: { message } }, { status, headers: { 'Cache-Control': 'no-store' } });
}
