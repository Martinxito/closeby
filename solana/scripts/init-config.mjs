// Calls init_config once on Devnet, signed by the program's upgrade authority.
//
//   node scripts/init-config.mjs <USDC_MINT> [keypair path]
//
// Windows: 10 min to unlock, 5 min to confirm (digital); 1 h reserved for in-person.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { AnchorProvider, BN, Program, Wallet } from '@anchor-lang/core';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';

const [mintArg, keypairPath = `${homedir()}/.config/solana/id.json`] = process.argv.slice(2);
if (!mintArg) {
  console.error('Usage: node scripts/init-config.mjs <USDC_MINT> [keypair path]');
  process.exit(1);
}

const idl = JSON.parse(readFileSync(new URL('../target/idl/closeby_escrow.json', import.meta.url), 'utf8'));
const admin = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keypairPath, 'utf8'))));
const connection = new Connection(process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com', 'confirmed');
const program = new Program(idl, new AnchorProvider(connection, new Wallet(admin), { commitment: 'confirmed' }));

const [config] = PublicKey.findProgramAddressSync([Buffer.from('config')], program.programId);
const [programData] = PublicKey.findProgramAddressSync(
  [program.programId.toBuffer()],
  new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111'),
);

const signature = await program.methods
  .initConfig(new BN(3600), new BN(3600), new BN(600), new BN(300))
  .accountsPartial({ admin: admin.publicKey, config, usdcMint: new PublicKey(mintArg), program: program.programId, programData })
  .rpc();

const saved = await program.account.config.fetch(config);
console.log(`Config:    ${config.toBase58()}`);
console.log(`Mint:      ${saved.usdcMint.toBase58()}`);
console.log(`Windows:   claim ${saved.digitalClaimSecs}s, review ${saved.digitalReviewSecs}s`);
console.log(`Signature: ${signature}`);
