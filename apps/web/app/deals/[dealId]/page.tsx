import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AutoRefresh } from '@/components/auto-refresh';
import { getDeal, isDealId } from '@/lib/deals';
import { getOrder } from '@/lib/escrow/server';
import { formatClp, formatFileSize } from '@/lib/format';
import SiteHeader from '../../site-header';
import { BuyerPanel } from './buyer-panel';
import DevnetSigning from './devnet-signing';

export const metadata: Metadata = { title: 'Venta | Closeby' };

// Public page of a deal: what the buyer sees and acts on (docs/flows/digital-sale.md).
// The order comes from the escrow on every render; BuyerPanel only offers allowed actions.
export default async function DealPage({ params }: PageProps<'/deals/[dealId]'>) {
  const { dealId } = await params;

  // Phantom signing spike (README, "Devnet signing spike"). Kept until the Privy spike replaces it.
  if (dealId === 'devnet-signing') {
    return (
      <>
        <SiteHeader deal />
        <main className="page-width deal-page">
          <p className="eyebrow">Devnet · Red de prueba</p>
          <h1>Prueba de firma.</h1>
          <DevnetSigning />
        </main>
      </>
    );
  }

  if (!isDealId(dealId)) notFound();
  const [deal, order] = await Promise.all([getDeal(dealId), getOrder(dealId)]);
  if (!deal) notFound();
  const finished = order?.status === 'Released' || order?.status === 'Refunded';

  return (
    <>
      <SiteHeader deal />
      <main className="app-page stack">
        <p className="eyebrow">{deal.kind === 'digital' ? 'Archivo con pago protegido' : 'Compraventa en persona'}</p>
        <h1>{deal.title}</h1>
        <p>
          <strong>{formatClp(deal.price_clp)}</strong>
        </p>

        {deal.kind === 'digital' && <Preview url={deal.preview_url} type={previewType(deal.preview_url)} title={deal.title} />}
        {deal.kind === 'physical' && deal.photos[0] && (
          // Plain <img>: Supabase Storage URLs would need next/image remotePatterns config.
          <img className="preview-media" src={deal.photos[0]} alt={deal.title} />
        )}

        {deal.description && <p>{deal.description}</p>}
        {deal.kind === 'digital' && deal.file_name && (
          <p className="muted">
            Recibes: {deal.file_name}
            {deal.file_size ? ` · ${formatFileSize(deal.file_size)}` : ''}
          </p>
        )}
        {deal.communes.length > 0 && <p className="muted">Encuentro en: {deal.communes.join(', ')}</p>}

        {deal.kind === 'digital' && <BuyerPanel dealId={dealId} priceClp={deal.price_clp} order={order} />}
        {/* Picks up the other party's actions (e.g. the buyer paying while the seller watches). */}
        {!finished && <AutoRefresh />}
      </main>
    </>
  );
}

function Preview({ url, type, title }: { url: string | null; type: PreviewType; title: string }) {
  if (!url) return <p className="muted">El vendedor no agregó una vista previa.</p>;
  switch (type) {
    case 'image':
      // The preview is public by design (the seller uploads only a sample). These attributes
      // only remove the one-click download shortcuts; anything shown in a browser can be saved.
      return <img className="preview-media" src={url} alt={`Vista previa de ${title}`} draggable={false} />;
    case 'audio':
      return <audio className="preview-media" src={url} controls controlsList="nodownload" preload="metadata" />;
    case 'video':
      return <video className="preview-media" src={url} controls controlsList="nodownload noremoteplayback" disablePictureInPicture preload="metadata" playsInline />;
    case 'pdf':
      return (
        <a className="button" href={url} target="_blank" rel="noreferrer">
          Ver vista previa (PDF) <span aria-hidden="true">↗</span>
        </a>
      );
    default:
      return (
        <a className="button" href={url} target="_blank" rel="noreferrer">
          Ver vista previa <span aria-hidden="true">↗</span>
        </a>
      );
  }
}

type PreviewType = 'image' | 'audio' | 'video' | 'pdf' | 'other';

/** Preview kind from the file extension (the previews bucket only accepts these types). */
function previewType(url: string | null): PreviewType {
  const ext = url?.split('?')[0]?.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return 'image';
  if (['mp3', 'm4a'].includes(ext)) return 'audio';
  if (ext === 'mp4') return 'video';
  if (ext === 'pdf') return 'pdf';
  return 'other';
}
