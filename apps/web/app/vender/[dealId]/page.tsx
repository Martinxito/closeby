import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { getDeal, isDealId } from '@/lib/deals';
import { formatClp } from '@/lib/format';
import { ShareActions } from './share-actions';

export const metadata: Metadata = { title: 'Comparte tu venta | Closeby' };

// Seller's screen after publishing (docs/flows/digital-sale.md, step 2).
// The link and the QR encode the same public URL, /deals/[dealId].
export default async function SharePage({ params }: PageProps<'/vender/[dealId]'>) {
  const { dealId } = await params;
  if (!isDealId(dealId)) notFound();

  const deal = await getDeal(dealId);
  if (!deal) notFound();

  const url = `${await origin()}/deals/${dealId}`;
  // Rendered on the server as inline SVG: no QR code library is shipped to the browser.
  const qrSvg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });

  return (
    <main className="stack">
      <Link href="/">Closeby</Link>
      <h1>¡Tu venta está publicada!</h1>
      <section className="card stack">
        <strong>{deal.title}</strong>
        <span>{formatClp(deal.price_clp)}</span>
        <small className="muted">
          Comparte el link con tu comprador. Paga con pago protegido y recibe el archivo; se te paga cuando confirma.
        </small>
      </section>

      <ShareActions url={url} title={deal.title} />

      <figure className="qr" aria-label="Código QR del link de tu venta" dangerouslySetInnerHTML={{ __html: qrSvg }} />

      <Link href={`/deals/${dealId}`}>Ver cómo la ve el comprador</Link>
    </main>
  );
}

/** Public origin of this request (works on localhost and on Vercel previews). */
async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}
