import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDeal, isDealId } from '@/lib/deals';
import { formatClp, formatFileSize } from '@/lib/format';
import SiteHeader from '../../site-header';
import DevnetSigning from './devnet-signing';

export const metadata: Metadata = { title: 'Venta | Closeby' };

// Buyer's view of a deal (Diego). For now it shows the deal and its preview; buying,
// unlocking and confirming come with the buyer flow (docs/flows/digital-sale.md).
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
  const deal = await getDeal(dealId);
  if (!deal) notFound();

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

        <section className="card">
          <small className="muted">
            Pagas antes, pero la plata queda protegida: el vendedor la recibe solo cuando confirmas que recibiste el archivo.
          </small>
        </section>
      </main>
    </>
  );
}

function Preview({ url, type, title }: { url: string | null; type: PreviewType; title: string }) {
  if (!url) return <p className="muted">El vendedor no agregó una vista previa.</p>;
  switch (type) {
    case 'image':
      return <img className="preview-media" src={url} alt={`Vista previa de ${title}`} />;
    case 'audio':
      return <audio className="preview-media" src={url} controls preload="metadata" />;
    case 'video':
      return <video className="preview-media" src={url} controls preload="metadata" playsInline />;
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
