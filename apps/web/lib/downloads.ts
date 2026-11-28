// Browser helper for the buyer's "Descargar" button (Diego's deal screen).
import type { Wallet } from './wallet/types';
import { UserError } from './user-error';

/** Asks our server for a 5-minute download link and starts the download. */
export async function downloadPurchasedFile(dealId: string, wallet: Wallet): Promise<void> {
  const token = await wallet.getAccessToken();
  if (!token) throw new UserError('Entra para descargar tu archivo.');

  const response = await fetch(`/api/deals/${dealId}/download`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await response.json()) as { url: string } | { error: { message: string } };
  // Our download route answers in Spanish, written for the user.
  if ('error' in body) throw new UserError(body.error.message);

  // Navigating to the signed URL downloads the file (it is served as an attachment).
  window.location.assign(body.url);
}
