import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatClp, getDeal, isDealId } from '@/lib/deals';

export default async function DealPage({ params }: PageProps<'/deals/[dealId]'>) {
  const { dealId } = await params;

  if (!isDealId(dealId)) {
    notFound();
  }

  const deal = await getDeal(dealId);
  if (!deal) {
    notFound();
  }

  return (
    <main>
      <Link href="/">Closeby</Link>
      {deal.photos[0] && (
        // Plain <img>: photos come from Supabase Storage and next/image would need remotePatterns config.
        <img src={deal.photos[0]} alt={deal.title} style={{ width: '100%', borderRadius: 12 }} />
      )}
      <h1>{deal.title}</h1>
      <p>
        <strong>{formatClp(deal.price_clp)}</strong>
      </p>
      {deal.description && <p>{deal.description}</p>}
      {deal.communes.length > 0 && <p>Encuentro en: {deal.communes.join(', ')}</p>}
      <p>El pago y el estado del trato se confirman en la siguiente etapa.</p>
    </main>
  );
}
