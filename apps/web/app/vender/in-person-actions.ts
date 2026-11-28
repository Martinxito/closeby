'use server';

// Server Actions for publishing an in-person sale (docs/in-person-proposal.md).
// Same shape as ./actions.ts: the seller's wallet creates the order (kind: physical, no
// file hash), then publishPhysicalSale checks it on the escrow before saving the deal.

import { authenticateToken } from '@/lib/auth/server';
import { insertPhysicalDeal, isDealId } from '@/lib/deals';
import { newOrderId } from '@/lib/escrow/ids';
import { getOrder } from '@/lib/escrow/server';
import { clpToUsdcUnits } from '@/lib/format';
import { COMMUNES } from '@/lib/meeting-points';
import { MAX_PREVIEW_BYTES, PREVIEWS_BUCKET, createSignedUpload, publicUrl, safeFileName, storedFileExists, type SignedUpload } from '@/lib/storage';

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export async function preparePhysicalSale(input: {
  photo: { name: string; size: number; type: string } | null;
}): Promise<Result<{ dealId: string; photo: SignedUpload | null }>> {
  if (input.photo) {
    if (input.photo.size > MAX_PREVIEW_BYTES) return { ok: false, error: 'La foto puede pesar hasta 10 MB.' };
    if (!PHOTO_TYPES.includes(input.photo.type)) return { ok: false, error: 'La foto debe ser JPG, PNG o WebP.' };
  }
  const dealId = newOrderId();
  try {
    const photo = input.photo ? await createSignedUpload(PREVIEWS_BUCKET, `${dealId}/${safeFileName(input.photo.name)}`) : null;
    return { ok: true, dealId, photo };
  } catch (err) {
    console.error(err);
    return { ok: false, error: 'No pudimos preparar la publicación. Intenta de nuevo.' };
  }
}

export type PublishPhysicalInput = {
  dealId: string;
  accessToken: string | null;
  title: string;
  description: string;
  priceClp: number;
  communes: string[];
  availability: string;
  photoPath: string | null;
};

export async function publishPhysicalSale(input: PublishPhysicalInput): Promise<Result<{ dealId: string }>> {
  const title = input.title.trim();
  const description = input.description.trim();
  const availability = input.availability.trim();
  const communes = [...new Set(input.communes)].filter((c) => COMMUNES.includes(c));

  if (!isDealId(input.dealId)) return { ok: false, error: 'Venta no válida.' };
  if (title.length < 1 || title.length > 120) return { ok: false, error: 'El título debe tener entre 1 y 120 caracteres.' };
  if (description.length > 2000) return { ok: false, error: 'La descripción puede tener hasta 2.000 caracteres.' };
  if (!Number.isInteger(input.priceClp) || input.priceClp < 1000 || input.priceClp > 10_000_000) {
    return { ok: false, error: 'El precio debe estar entre $1.000 y $10.000.000.' };
  }
  if (communes.length === 0) return { ok: false, error: 'Elige al menos una comuna donde puedas juntarte.' };
  if (availability.length < 3 || availability.length > 200) return { ok: false, error: 'Cuéntale al comprador cuándo puedes juntarte.' };
  if (input.photoPath && !input.photoPath.startsWith(`${input.dealId}/`)) return { ok: false, error: 'Foto no válida.' };

  const seller = await authenticateToken(input.accessToken);
  if (!seller) return { ok: false, error: 'Tu sesión expiró. Vuelve a entrar.' };

  try {
    // The escrow order must exist, be in-person, belong to this seller and match the price.
    const order = await getOrder(input.dealId, seller);
    if (!order || order.seller !== seller || order.kind !== 'physical') return { ok: false, error: 'No encontramos tu venta. Intenta de nuevo.' };
    if (order.amount !== clpToUsdcUnits(input.priceClp)) return { ok: false, error: 'El precio no coincide con tu venta.' };

    let photoUrl: string | null = null;
    if (input.photoPath) {
      if (!(await storedFileExists(PREVIEWS_BUCKET, input.photoPath))) return { ok: false, error: 'La foto no terminó de subir. Intenta de nuevo.' };
      photoUrl = publicUrl(PREVIEWS_BUCKET, input.photoPath);
    }

    await insertPhysicalDeal({
      deal_id: input.dealId,
      seller,
      title,
      description,
      price_clp: input.priceClp,
      communes,
      time_slots: [{ label: availability }],
      photos: photoUrl ? [photoUrl] : [],
      preview_url: photoUrl,
    });
    return { ok: true, dealId: input.dealId };
  } catch (err) {
    console.error(err);
    return { ok: false, error: 'No pudimos publicar tu venta. Intenta de nuevo.' };
  }
}
