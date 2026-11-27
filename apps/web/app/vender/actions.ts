'use server';

// Server Actions for publishing a digital sale (docs/flows/digital-sale.md, step 1).
//
// Order of the flow, driven by sell-form.tsx:
//   1. prepareSale   → new deal ID + one-time upload URLs (file is private, preview public)
//   2. the browser uploads straight to Supabase and computes the file's SHA-256
//   3. the seller's wallet runs create_order(amount, content_hash) on the escrow
//   4. publishSale   → we re-check everything against storage and the escrow, then save
//
// Nothing the browser says is trusted in step 4: the hash is recomputed from the stored
// file, and the order must exist with this seller, amount and hash.
// Actions return { ok: false, error } instead of throwing, because Next.js hides thrown
// error messages in production and the seller needs to read what went wrong.

import { authenticateToken } from '@/lib/auth/server';
import { insertDigitalDeal, isDealId } from '@/lib/deals';
import { newOrderId } from '@/lib/escrow/ids';
import { getOrder } from '@/lib/escrow/server';
import { clpToUsdcUnits } from '@/lib/format';
import {
  FILES_BUCKET,
  MAX_FILE_BYTES,
  MAX_PREVIEW_BYTES,
  PREVIEWS_BUCKET,
  PREVIEW_TYPES,
  createSignedUpload,
  hashStoredFile,
  publicUrl,
  safeFileName,
  storedFileExists,
  type SignedUpload,
} from '@/lib/storage';

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

export type PrepareSaleInput = {
  file: { name: string; size: number };
  preview: { name: string; size: number; type: string } | null;
};

export async function prepareSale(input: PrepareSaleInput): Promise<Result<{ dealId: string; file: SignedUpload; preview: SignedUpload | null }>> {
  if (!input.file || input.file.size <= 0) return { ok: false, error: 'Elige el archivo que quieres vender.' };
  if (input.file.size > MAX_FILE_BYTES) return { ok: false, error: 'El archivo puede pesar hasta 50 MB.' };
  if (input.preview) {
    if (input.preview.size > MAX_PREVIEW_BYTES) return { ok: false, error: 'La vista previa puede pesar hasta 10 MB.' };
    if (!PREVIEW_TYPES.includes(input.preview.type)) {
      return { ok: false, error: 'La vista previa debe ser una imagen, un audio, un video MP4 o un PDF.' };
    }
  }

  const dealId = newOrderId();
  try {
    const file = await createSignedUpload(FILES_BUCKET, `${dealId}/${safeFileName(input.file.name)}`);
    const preview = input.preview
      ? await createSignedUpload(PREVIEWS_BUCKET, `${dealId}/${safeFileName(input.preview.name)}`)
      : null;
    return { ok: true, dealId, file, preview };
  } catch (err) {
    console.error(err);
    return { ok: false, error: 'No pudimos preparar la subida. Intenta de nuevo.' };
  }
}

export type PublishSaleInput = {
  dealId: string;
  /** Session token from wallet.getAccessToken(); the seller is whoever it proves. */
  accessToken: string | null;
  title: string;
  description: string;
  priceClp: number;
  filePath: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  contentHash: string;
  previewPath: string | null;
};

export async function publishSale(input: PublishSaleInput): Promise<Result<{ dealId: string }>> {
  const title = input.title.trim();
  const description = input.description.trim();

  if (!isDealId(input.dealId)) return { ok: false, error: 'Venta no válida.' };
  if (title.length < 1 || title.length > 120) return { ok: false, error: 'El título debe tener entre 1 y 120 caracteres.' };
  if (description.length > 2000) return { ok: false, error: 'La descripción puede tener hasta 2.000 caracteres.' };
  if (!Number.isInteger(input.priceClp) || input.priceClp < 1000 || input.priceClp > 10_000_000) {
    return { ok: false, error: 'El precio debe estar entre $1.000 y $10.000.000.' };
  }
  // Paths must belong to this deal, so nobody can publish someone else's upload.
  const prefix = `${input.dealId}/`;
  if (!input.filePath.startsWith(prefix) || (input.previewPath && !input.previewPath.startsWith(prefix))) {
    return { ok: false, error: 'Archivo no válido.' };
  }

  const seller = await authenticateToken(input.accessToken);
  if (!seller) return { ok: false, error: 'Tu sesión expiró. Vuelve a entrar.' };

  try {
    // 1. The escrow order must exist, belong to this seller, and match price and file.
    const order = await getOrder(input.dealId);
    if (!order || order.seller !== seller) return { ok: false, error: 'No encontramos tu venta. Intenta de nuevo.' };
    if (order.amount !== clpToUsdcUnits(input.priceClp)) return { ok: false, error: 'El precio no coincide con tu venta.' };

    // 2. Recompute the hash from what is actually stored, and compare with the order.
    const storedHash = await hashStoredFile(FILES_BUCKET, input.filePath);
    if (!storedHash) return { ok: false, error: 'El archivo no terminó de subir. Intenta de nuevo.' };
    if (storedHash !== order.contentHash) return { ok: false, error: 'El archivo cambió durante la subida. Intenta de nuevo.' };

    let previewUrl: string | null = null;
    if (input.previewPath) {
      if (!(await storedFileExists(PREVIEWS_BUCKET, input.previewPath))) {
        return { ok: false, error: 'La vista previa no terminó de subir. Intenta de nuevo.' };
      }
      previewUrl = publicUrl(PREVIEWS_BUCKET, input.previewPath);
    }

    await insertDigitalDeal({
      deal_id: input.dealId,
      seller: order.seller,
      title,
      description,
      price_clp: input.priceClp,
      content_hash: storedHash,
      file_path: input.filePath,
      file_name: input.fileName.slice(0, 200),
      file_size: input.fileSize,
      file_type: (input.fileType || 'application/octet-stream').slice(0, 100),
      preview_url: previewUrl,
    });
    return { ok: true, dealId: input.dealId };
  } catch (err) {
    console.error(err);
    return { ok: false, error: 'No pudimos publicar tu venta. Intenta de nuevo.' };
  }
}
