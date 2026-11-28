// Privy session verification. Server-only.
//
// 1. verifyAccessToken checks the token's signature and expiry (Privy's JWKS) → user ID.
// 2. The user's Solana embedded wallet is read from Privy with our app secret, so the
//    address comes from Privy, never from the browser.
// Addresses are cached per user ID: an embedded wallet address never changes.
import 'server-only';

import { PrivyClient } from '@privy-io/node';

let client: PrivyClient | undefined;
const addressByUser = new Map<string, string>();

function getPrivy(): PrivyClient {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) throw new Error('Missing NEXT_PUBLIC_PRIVY_APP_ID or PRIVY_APP_SECRET.');
  client ??= new PrivyClient({ appId, appSecret });
  return client;
}

/** Solana address of the user behind a Privy access token, or null if the token is not valid. */
export async function authenticatePrivy(accessToken: string): Promise<string | null> {
  const privy = getPrivy();

  let userId: string;
  try {
    ({ user_id: userId } = await privy.utils().auth().verifyAccessToken(accessToken));
  } catch {
    return null; // invalid or expired: the browser refreshes it and retries
  }

  const cached = addressByUser.get(userId);
  if (cached) return cached;

  const user = await privy.users()._get(userId);
  const wallet = user.linked_accounts.find(
    (a) => a.type === 'wallet' && 'chain_type' in a && a.chain_type === 'solana' && 'connector_type' in a && a.connector_type === 'embedded',
  );
  if (!wallet || !('address' in wallet)) return null; // wallet not created yet
  addressByUser.set(userId, wallet.address);
  return wallet.address;
}
