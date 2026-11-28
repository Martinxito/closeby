// Browser helpers for the test balance (app/api/balance/route.ts).
import type { Wallet } from './wallet/types';
import { UserError } from './user-error';

export type Balance = { balanceUnits: number; balanceClp: number };

export async function fetchBalance(wallet: Wallet): Promise<Balance> {
  return call('GET', wallet);
}

/** "Cargar saldo de prueba": our server mints test funds and pays the fee. */
export async function addTestFunds(wallet: Wallet): Promise<Balance> {
  return call('POST', wallet);
}

async function call(method: 'GET' | 'POST', wallet: Wallet): Promise<Balance> {
  const token = await wallet.getAccessToken();
  if (!token) throw new UserError('Entra para ver tu saldo.');
  const response = await fetch('/api/balance', { method, headers: { Authorization: `Bearer ${token}` } });
  const body = (await response.json()) as Balance | { error: { message: string } };
  // Our balance route answers in Spanish, written for the user.
  if ('error' in body) throw new UserError(body.error.message);
  return body;
}
