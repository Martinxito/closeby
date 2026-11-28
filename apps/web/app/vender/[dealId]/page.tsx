import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { getDeal, isDealId } from '@/lib/deals';
import { getOrder } from '@/lib/escrow/server';
import type { Order } from '@/lib/escrow/types';
import { formatClp } from '@/lib/format';
import { AutoRefresh } from '@/components/auto-refresh';
import { ShareActions } from './share-actions';
import SiteHeader from '../../site-header';

export const metadata: Metadata = { title: 'Comparte tu venta | Closeby' };

// Seller's screen after publishing (docs/flows/digital-sale.md, step 2).
// The link and the QR encode the same public URL, /deals/[dealId].
export default async function SharePage({ params }: PageProps<'/vender/[dealId]'>) {
  const { dealId } = await params;
  if (!isDealId(dealId)) notFound();

  // Deal first: in chain mode the order's address is derived from its seller.
  const deal = await getDeal(dealId);
  const order = deal ? await getOrder(dealId, deal.seller) : null;
  if (!deal) notFound();
  const status = sellerStatus(order, deal.price_clp);
  const finished = order?.status === 'Released' || order?.status === 'Refunded';

  const url = `${await origin()}/deals/${dealId}`;
  // Rendered on the server as inline SVG: no QR code library is shipped to the browser.
  const qrSvg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });

  return (
    <>
      <SiteHeader deal />
      <main className="app-page stack">
        <h1>{order?.status === 'Created' ? '¡Tu venta está publicada!' : 'Tu venta'}</h1>
        <section className="card stack">
          <strong>{deal.title}</strong>
          <span>{formatClp(deal.price_clp)}</span>
        </section>

        <section className="card stack" aria-live="polite">
          <strong>{status.title}</strong>
          <small className="muted">{status.detail}</small>
        </section>
        {!finished && <AutoRefresh />}

        {order?.status === 'Created' && <ShareActions url={url} title={deal.title} />}

        {order?.status === 'Created' && (
          <figure className="qr" aria-label="Código QR del link de tu venta" dangerouslySetInnerHTML={{ __html: qrSvg }} />
        )}

        <Link href={`/deals/${dealId}`}>Ver cómo la ve el comprador</Link>
      </main>
    </>
  );
}

/** What the seller sees for each escrow status (docs/flows/digital-sale.md, "Status shown to users"). */
function sellerStatus(order: Order | null, priceClp: number): { title: string; detail: string } {
  const price = formatClp(priceClp);
  switch (order?.status) {
    case 'Created':
      return { title: 'Esperando comprador', detail: 'Comparte el link. Te avisamos aquí cuando alguien compre.' };
    case 'Funded':
      return {
        title: `Un comprador reservó ${price}`,
        detail: `Su plata está protegida. Se te paga cuando confirme que recibió el archivo. Si no lo desbloquea antes del ${formatDeadline(order.claimDeadline)}, se le devuelve.`,
      };
    case 'Delivered':
      return {
        title: 'El comprador ya tiene tu archivo',
        detail: `Se te paga cuando confirme, o automáticamente el ${formatDeadline(order.releaseDeadline)}.`,
      };
    case 'Released':
      return { title: `✅ Te pagaron ${price}`, detail: 'Trato hecho.' };
    case 'Refunded':
      return { title: 'La compra se canceló', detail: 'Le devolvimos la plata al comprador antes de que recibiera el archivo.' };
    default:
      return { title: 'Preparando tu venta…', detail: 'Recarga en unos segundos.' };
  }
}

function formatDeadline(unixSecs: number | null): string {
  if (!unixSecs) return '—';
  return new Intl.DateTimeFormat('es-CL', {
    weekday: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Santiago',
  }).format(new Date(unixSecs * 1000));
}

/** Public origin of this request (works on localhost and on Vercel previews). */
async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}
