// End-to-end check of the deployed program on Devnet, through the same client the web uses.
//
//   pnpm --filter @closeby/solana smoke:devnet [path/to/.env]
//
// Reads FEE_PAYER_SECRET_KEY, USDC_MINT and SOLANA_RPC_URL from apps/web/.env.local
// (created by `pnpm --filter @closeby/web setup:devnet`). Never prints the secret.
//
// It creates a throwaway seller and buyer with no SOL, gives the buyer 1 test USDC, and
// runs create_order → fund → open_delivery → confirm_handover, paid by our fee payer.
// Costs about 0.01 Devnet SOL. Prints an Explorer link for every step.

import { utils } from '@anchor-lang/core';
import { createAssociatedTokenAccountIdempotentInstruction, createMintToInstruction, getAccount } from '@solana/spl-token';
import { Connection, Keypair, Transaction, sendAndConfirmTransaction, type TransactionInstruction } from '@solana/web3.js';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createEscrowClient, userTokenAddress } from '../client';

const PRICE_UNITS = 1_000_000; // 1 test USDC (≈ $950 CLP)

const envPath = process.argv[2] ?? resolve(__dirname, '../../apps/web/.env.local');
const env = readEnv(envPath);
const rpc = env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
if (!rpc.includes('devnet')) fail(`Refusing to run against a non-Devnet RPC: ${rpc}`);
if (!env.FEE_PAYER_SECRET_KEY || !env.USDC_MINT) fail(`Missing FEE_PAYER_SECRET_KEY or USDC_MINT in ${envPath}`);

const connection = new Connection(rpc, 'confirmed');
const feePayer = Keypair.fromSecretKey(utils.bytes.bs58.decode(env.FEE_PAYER_SECRET_KEY));
const escrow = createEscrowClient({ connection, usdcMint: env.USDC_MINT, feePayer: feePayer.publicKey });

const seller = Keypair.generate();
const buyer = Keypair.generate();
const dealId = BigInt(`0x${randomBytes(8).toString('hex')}`).toString(10);
const contentHash = createHash('sha256').update(`closeby smoke test ${dealId}`).digest('hex');
const ref = { seller: seller.publicKey, dealId, buyer: buyer.publicKey };

async function main(): Promise<void> {
  console.log(`Program:   ${escrow.program.programId.toBase58()}`);
  console.log(`Fee payer: ${feePayer.publicKey.toBase58()} (${(await connection.getBalance(feePayer.publicKey)) / 1e9} SOL)`);
  console.log(`Deal ID:   ${dealId}\n`);

  // The web's "Cargar saldo de prueba" does the same: our fee payer is the mint authority.
  const buyerToken = userTokenAddress(buyer.publicKey, escrow.mint);
  await step('Test USDC for the buyer', [
    createAssociatedTokenAccountIdempotentInstruction(feePayer.publicKey, buyerToken, buyer.publicKey, escrow.mint),
    createMintToInstruction(escrow.mint, buyerToken, feePayer.publicKey, PRICE_UNITS),
  ], []);

  await step('create_order', await escrow.build.createOrder({ ...ref, amount: PRICE_UNITS, contentHash }), [seller]);
  await step('fund', await escrow.build.fund(ref), [buyer]);
  await step('open_delivery', await escrow.build.openDelivery(ref), [buyer]);
  await step('confirm_handover', await escrow.build.confirmHandover(ref), [buyer]);

  const order = await escrow.fetchOrder(seller.publicKey, dealId);
  const paid = Number((await getAccount(connection, userTokenAddress(seller.publicKey, escrow.mint), 'confirmed')).amount);
  if (order?.status !== 'Released' || paid !== PRICE_UNITS) fail(`Unexpected end state: ${order?.status}, seller got ${paid}`);

  console.log(`\nOK: the seller received ${paid / 1e6} test USDC. Seller and buyer never held SOL.`);
}

// --- helpers ---------------------------------------------------------------

async function step(label: string, instructions: TransactionInstruction[], signers: Keypair[]): Promise<void> {
  const tx = new Transaction().add(...instructions);
  tx.feePayer = feePayer.publicKey;
  const signature = await sendAndConfirmTransaction(connection, tx, [feePayer, ...signers], { commitment: 'confirmed' });
  const status = (await escrow.fetchOrder(seller.publicKey, dealId))?.status ?? '-';
  console.log(`${label.padEnd(24)} ${status.padEnd(10)} https://explorer.solana.com/tx/${signature}?cluster=devnet`);
}

function readEnv(path: string): Record<string, string> {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    fail(`Cannot read ${path}. Run \`pnpm --filter @closeby/web setup:devnet\` first, or pass another .env path.`);
  }
  const values: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]!] = match[2]!;
  }
  return values;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
