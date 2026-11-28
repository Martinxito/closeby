// Addresses the program derives. They must match solana/programs/closeby_escrow/src/constants.rs.

import { BN } from '@anchor-lang/core';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import { IDL } from './program';

export const PROGRAM_ID = new PublicKey(IDL.address);
export const BPF_UPGRADEABLE_LOADER = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');

const CONFIG_SEED = Buffer.from('config');
const ORDER_SEED = Buffer.from('order');
const U64_MAX = (1n << 64n) - 1n;

/** Base58 string or PublicKey: the web keeps addresses as strings. */
export type Address = string | PublicKey;

export function toPublicKey(address: Address): PublicKey {
  return typeof address === 'string' ? new PublicKey(address) : address;
}

/**
 * The deal ID in /deals/[dealId] is the order_id: a u64 as a decimal string.
 * Parsed as a bigint, never through a JS number, which would lose precision above 2^53.
 */
export function dealIdToBN(dealId: string): BN {
  if (!/^[0-9]{1,20}$/.test(dealId) || BigInt(dealId) > U64_MAX) {
    throw new Error(`Invalid deal ID: ${dealId}`);
  }
  return new BN(dealId, 10);
}

/** `["config"]` */
export function configAddress(): PublicKey {
  return PublicKey.findProgramAddressSync([CONFIG_SEED], PROGRAM_ID)[0];
}

/** `["order", seller, order_id as u64 little-endian]` */
export function orderAddress(seller: Address, dealId: string): PublicKey {
  return PublicKey.findProgramAddressSync(
    [ORDER_SEED, toPublicKey(seller).toBuffer(), dealIdToBN(dealId).toArrayLike(Buffer, 'le', 8)],
    PROGRAM_ID,
  )[0];
}

/** The vault: the order's associated USDC account. Its owner is a PDA, hence `allowOwnerOffCurve`. */
export function vaultAddress(order: PublicKey, mint: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(mint, order, true);
}

/** A user's associated USDC account, where they pay from and get paid to. */
export function userTokenAddress(owner: Address, mint: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(mint, toPublicKey(owner), true);
}

/** The account that records the program's upgrade authority (checked by init_config). */
export function programDataAddress(): PublicKey {
  return PublicKey.findProgramAddressSync([PROGRAM_ID.toBuffer()], BPF_UPGRADEABLE_LOADER)[0];
}
