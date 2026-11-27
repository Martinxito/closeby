// Solana connection and our server keys. Server-only: the fee payer's secret key must
// never reach the browser (docs/decisions/0003-invisible-wallet.md).
//
// Env vars (apps/web/.env.local and Vercel), created by `pnpm --filter @closeby/web setup:devnet`:
//   SOLANA_RPC_URL          Devnet RPC (default https://api.devnet.solana.com)
//   FEE_PAYER_SECRET_KEY    base58 secret key of the account that pays fees and rent
//   USDC_MINT               test USDC mint (6 decimals); the fee payer is its mint authority
import 'server-only';

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';

export const USDC_DECIMALS = 6;

let connection: Connection | undefined;
let feePayer: Keypair | undefined;

export function getConnection(): Connection {
  connection ??= new Connection(process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com', 'confirmed');
  return connection;
}

export function getFeePayer(): Keypair {
  if (!feePayer) {
    const secret = process.env.FEE_PAYER_SECRET_KEY;
    if (!secret) throw new Error('Missing FEE_PAYER_SECRET_KEY. Run the devnet setup script (see README).');
    feePayer = Keypair.fromSecretKey(bs58.decode(secret.trim()));
  }
  return feePayer;
}

export function getUsdcMint(): PublicKey {
  const mint = process.env.USDC_MINT;
  if (!mint) throw new Error('Missing USDC_MINT. Run the devnet setup script (see README).');
  return new PublicKey(mint);
}

/** True when the server has what it needs to send transactions. */
export function isSolanaConfigured(): boolean {
  return Boolean(process.env.FEE_PAYER_SECRET_KEY && process.env.USDC_MINT);
}
