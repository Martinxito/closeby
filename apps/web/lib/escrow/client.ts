// Browser-side entry point for escrow actions. Screens call `sendEscrowAction` and never
// care whether the backend is the mock or the real program.
//
// NEXT_PUBLIC_ESCROW_MODE must match the server's ESCROW_MODE ("mock" by default).
// It is public on purpose: it only says which backend to talk to, it is not a secret.
//
// Chain mode, one action:
//   1. POST /api/escrow/prepare → unsigned transaction (our fee payer pays) + ticket
//   2. wallet.signTransaction   → the user's embedded wallet signs, no pop-up
//   3. POST /api/escrow/submit  → our server checks it, adds the fee payer, sends, confirms
// Afterwards the screen re-reads the order on-chain (router.refresh): a wallet callback
// alone is never treated as confirmation.

import type { Wallet } from '../wallet/types';
import { EscrowError, type EscrowAction, type EscrowErrorCode } from './types';
import { UserError } from '../user-error';

const mode = process.env.NEXT_PUBLIC_ESCROW_MODE === 'chain' ? 'chain' : 'mock';

/** What a completed action returns: the transaction signature (fake in mock mode). */
export type ActionOutcome = { signature: string | null };

/**
 * Runs one escrow action as the logged-in user. The server takes the signer from the
 * session token, so a screen cannot act on behalf of someone else.
 */
export async function sendEscrowAction(
  action: DistributiveOmit<EscrowAction, 'signer'>,
  wallet: Wallet,
): Promise<ActionOutcome> {
  if (!wallet.address) throw new UserError('Entra para continuar.');
  const token = await wallet.getAccessToken();
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` };

  if (mode === 'chain') {
    const prepared = await post<{ transaction: string; ticket: string }>('/api/escrow/prepare', headers, action);
    const signed = await wallet.signTransaction(prepared.transaction);
    const { signature } = await post<{ signature: string }>('/api/escrow/submit', headers, {
      transaction: signed,
      ticket: prepared.ticket,
    });
    return { signature };
  }

  const result = await post<{ order: { lastSignature: string | null } }>('/api/escrow/mock', headers, action);
  return { signature: result.order.lastSignature };
}

async function post<T>(url: string, headers: Record<string, string>, body: unknown): Promise<T> {
  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const json = (await response.json().catch(() => ({ error: { code: 'Internal', message: 'Bad response' } }))) as
    | T
    | { error: { code: string; message: string } };
  if (json && typeof json === 'object' && 'error' in json) {
    throw new EscrowError(json.error.code as EscrowErrorCode, json.error.message);
  }
  return json as T;
}

// Omit that works on each member of a union (plain Omit collapses the union).
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
