// Browser-side entry point for escrow actions. Screens call `sendEscrowAction` and never
// care whether the backend is the mock or the real program.
//
// NEXT_PUBLIC_ESCROW_MODE must match the server's ESCROW_MODE ("mock" by default).
// It is public on purpose: it only says which backend to talk to, it is not a secret.

import type { Wallet } from '../wallet/types';
import { EscrowError, type ActionResult, type EscrowAction, type EscrowErrorCode } from './types';

const mode = process.env.NEXT_PUBLIC_ESCROW_MODE === 'chain' ? 'chain' : 'mock';

/**
 * Runs one escrow action as the logged-in user. The action's `signer` is filled in
 * from the wallet, so a screen cannot act on behalf of someone else by mistake.
 */
export async function sendEscrowAction(
  action: DistributiveOmit<EscrowAction, 'signer'>,
  wallet: Wallet,
): Promise<ActionResult> {
  if (!wallet.address) throw new Error('Log in before acting on a deal.');
  const full = { ...action, signer: wallet.address } as EscrowAction;

  if (mode === 'chain') {
    // Block 4: build the Anchor instruction, have our server add the fee payer,
    // sign with wallet.signTransaction, send, then re-read the order on-chain.
    throw new Error('Chain mode is not implemented yet.');
  }

  const response = await fetch('/api/escrow/mock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(full),
  });
  const body = (await response.json()) as ActionResult | { error: { code: string; message: string } };
  if ('error' in body) throw new EscrowError(body.error.code as EscrowErrorCode, body.error.message);
  return body;
}

// Omit that works on each member of a union (plain Omit collapses the union).
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
