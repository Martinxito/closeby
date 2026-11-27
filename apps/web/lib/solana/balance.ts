// Test USDC balance and the "Cargar saldo de prueba" faucet. Server-only.
//
// On Devnet we use our own SPL token with 6 decimals as test USDC (docs/product.md).
// The fee payer is its mint authority, so the faucet can mint test funds to any user,
// and it also pays the fee and the rent of the user's token account.
import 'server-only';

import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { getConnection, getFeePayer, getUsdcMint, USDC_DECIMALS } from './config';

const UNIT = 10 ** USDC_DECIMALS;
/** Each top-up: 500 test USDC (≈ $475.000 CLP at the demo rate). */
export const FAUCET_AMOUNT_UNITS = 500 * UNIT;
/** Top-ups are refused above this balance, so nobody drains the faucet in a loop. */
export const FAUCET_MAX_BALANCE_UNITS = 100 * UNIT;

/** Test USDC balance in base units (0 if the user has no token account yet). */
export async function getUsdcBalanceUnits(owner: PublicKey): Promise<number> {
  const ata = getAssociatedTokenAddressSync(getUsdcMint(), owner, true);
  try {
    const { value } = await getConnection().getTokenAccountBalance(ata, 'confirmed');
    return Number(value.amount);
  } catch {
    return 0; // account does not exist yet
  }
}

export class FaucetError extends Error {}

/** Mints test USDC to the user. Our fee payer signs alone: it is fee payer and mint authority. */
export async function sendTestFunds(owner: PublicKey): Promise<{ signature: string; balanceUnits: number }> {
  const balance = await getUsdcBalanceUnits(owner);
  if (balance > FAUCET_MAX_BALANCE_UNITS) throw new FaucetError('Ya tienes saldo de prueba suficiente.');

  const connection = getConnection();
  const feePayer = getFeePayer();
  const mint = getUsdcMint();
  const ata = getAssociatedTokenAddressSync(mint, owner, true);

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  const message = new TransactionMessage({
    payerKey: feePayer.publicKey,
    recentBlockhash: blockhash,
    instructions: [
      // Creates the user's test USDC account if missing; our fee payer pays its rent.
      createAssociatedTokenAccountIdempotentInstruction(feePayer.publicKey, ata, owner, mint),
      createMintToInstruction(mint, ata, feePayer.publicKey, FAUCET_AMOUNT_UNITS),
    ],
  }).compileToV0Message();

  const tx = new VersionedTransaction(message);
  tx.sign([feePayer]);
  const signature = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
  const result = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
  if (result.value.err) throw new Error(`Faucet transaction failed: ${JSON.stringify(result.value.err)}`);

  return { signature, balanceUnits: balance + FAUCET_AMOUNT_UNITS };
}
