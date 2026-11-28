// Gives the buyer a short-lived link to the file they bought (docs/flows/digital-sale.md).
//
// The server decides, never the browser:
//   1. who is asking: from the session token (lib/auth/server.ts), not from the body;
//   2. whether they may download: the escrow order must be Delivered or Released and
//      the caller must be its buyer (canDownload in lib/escrow/rules.ts);
//   3. the file: taken from the deal row, never from the request.
// The link expires in 5 minutes and the file stays in a private bucket.
// POST (not GET) so link previews and prefetching never mint download links.
import { NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth/server';
import { getDeal, isDealId } from '@/lib/deals';
import { canDownload } from '@/lib/escrow/rules';
import { getOrder } from '@/lib/escrow/server';
import { FILES_BUCKET, createSignedDownload } from '@/lib/storage';

export async function POST(request: Request, { params }: RouteContext<'/api/deals/[dealId]/download'>) {
  const { dealId } = await params;
  if (!isDealId(dealId)) return error(404, 'NotFound', 'No encontramos esta venta.');

  const viewer = await authenticate(request);
  if (!viewer) return error(401, 'Unauthorized', 'Entra para descargar tu archivo.');

  try {
    // Deal first: in chain mode the order's address is derived from its seller.
    const deal = await getDeal(dealId);
    const order = deal ? await getOrder(dealId, deal.seller) : null;
    if (!deal || deal.kind !== 'digital' || !deal.file_path || !deal.file_name) {
      return error(404, 'NotFound', 'No encontramos esta venta.');
    }
    if (!canDownload(order, viewer)) {
      return error(403, 'Forbidden', 'Solo quien compró puede descargar el archivo, después de desbloquearlo.');
    }

    const url = await createSignedDownload(FILES_BUCKET, deal.file_path, deal.file_name);
    return NextResponse.json({ url, expiresInSecs: 300 }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error(err);
    return error(500, 'Internal', 'No pudimos preparar tu descarga. Intenta de nuevo.');
  }
}

function error(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { 'Cache-Control': 'no-store' } });
}
