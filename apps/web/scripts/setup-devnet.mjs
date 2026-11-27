// One-time Devnet setup for the web server. Safe to run again: it only fills what is missing.
//
//   pnpm --filter @closeby/web setup:devnet
//
// 1. Creates the fee payer keypair (pays fees and rent for users) if missing.
// 2. Makes sure it has Devnet SOL (airdrop; if the faucet is rate limited, it tells you
//    to fund it at https://faucet.solana.com and run the script again).
// 3. Creates the test USDC mint (6 decimals) with the fee payer as mint authority.
// It writes FEE_PAYER_SECRET_KEY, USDC_MINT and SOLANA_RPC_URL to apps/web/.env.local
// (git-ignored). It never prints the secret key. Devnet only.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createMint } from '@solana/spl-token';
import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';

const ENV_PATH = fileURLToPath(new URL('../.env.local', import.meta.url));
const DEFAULT_RPC = 'https://api.devnet.solana.com';
const MIN_SOL = 0.5;

const env = readEnv();
const rpc = env.SOLANA_RPC_URL || DEFAULT_RPC;
if (!rpc.includes('devnet')) {
  console.error(`Refusing to run against a non-Devnet RPC: ${rpc}`);
  process.exit(1);
}
const connection = new Connection(rpc, 'confirmed');
setEnv('SOLANA_RPC_URL', rpc);

// 1. Fee payer
let feePayer;
if (env.FEE_PAYER_SECRET_KEY) {
  feePayer = Keypair.fromSecretKey(bs58.decode(env.FEE_PAYER_SECRET_KEY));
  console.log(`Fee payer (existing): ${feePayer.publicKey.toBase58()}`);
} else {
  feePayer = Keypair.generate();
  setEnv('FEE_PAYER_SECRET_KEY', bs58.encode(feePayer.secretKey));
  console.log(`Fee payer (new):      ${feePayer.publicKey.toBase58()}`);
}

// 2. Devnet SOL
let sol = (await connection.getBalance(feePayer.publicKey)) / LAMPORTS_PER_SOL;
console.log(`Fee payer balance:    ${sol} SOL`);
if (sol < MIN_SOL) {
  try {
    console.log('Requesting a Devnet airdrop of 1 SOL…');
    const signature = await connection.requestAirdrop(feePayer.publicKey, LAMPORTS_PER_SOL);
    const latest = await connection.getLatestBlockhash();
    await connection.confirmTransaction({ signature, ...latest }, 'confirmed');
    sol = (await connection.getBalance(feePayer.publicKey)) / LAMPORTS_PER_SOL;
    console.log(`Fee payer balance:    ${sol} SOL`);
  } catch (err) {
    console.log(`\nAirdrop failed (${err.message?.split('\n')[0]}).`);
    console.log('Fund the fee payer by hand, then run this script again:');
    console.log(`  1. Open https://faucet.solana.com (log in with GitHub for a higher limit)`);
    console.log(`  2. Network: Devnet. Address: ${feePayer.publicKey.toBase58()}`);
    writeEnv();
    process.exit(0);
  }
}

// 3. Test USDC mint
if (env.USDC_MINT) {
  console.log(`Test USDC mint (existing): ${env.USDC_MINT}`);
} else {
  const mint = await createMint(connection, feePayer, feePayer.publicKey, null, 6);
  setEnv('USDC_MINT', mint.toBase58());
  console.log(`Test USDC mint (new):      ${mint.toBase58()}`);
}

writeEnv();
console.log('\nDone. Restart `pnpm --filter @closeby/web dev` to load the new values.');
console.log('Copy FEE_PAYER_SECRET_KEY, USDC_MINT and SOLANA_RPC_URL to Vercel (Production and Preview).');

// --- .env.local helpers: keep every other line as it is ---

function readEnv() {
  const values = {};
  if (!existsSync(ENV_PATH)) return values;
  for (const line of readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) values[match[1]] = match[2];
  }
  return values;
}

function setEnv(key, value) {
  env[key] = value;
}

function writeEnv() {
  const lines = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8').split(/\r?\n/) : [];
  const written = new Set();
  const out = lines.map((line) => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (match && match[1] in env) {
      written.add(match[1]);
      return `${match[1]}=${env[match[1]]}`;
    }
    return line;
  });
  while (out.length && out[out.length - 1] === '') out.pop();
  for (const key of ['SOLANA_RPC_URL', 'FEE_PAYER_SECRET_KEY', 'USDC_MINT']) {
    if (key in env && !written.has(key)) out.push(`${key}=${env[key]}`);
  }
  writeFileSync(ENV_PATH, out.join('\n') + '\n');
}
