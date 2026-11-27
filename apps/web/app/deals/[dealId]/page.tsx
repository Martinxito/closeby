import { notFound } from 'next/navigation';
import SiteHeader from '../../site-header';
import DevnetSigning from './devnet-signing';

export default async function DealPage({ params }: PageProps<'/deals/[dealId]'>) {
  const { dealId } = await params;

  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(dealId)) {
    notFound();
  }

  const isTest = dealId === 'devnet-signing';

  return (
    <>
      <SiteHeader deal />
      <main className="page-width deal-page">
        <p className="eyebrow">{isTest ? 'Devnet · Red de prueba' : 'Closeby · Trato'}</p>
        <h1>{isTest ? 'Prueba de firma.' : `Trato ${dealId}`}</h1>
        {isTest ? (
          <DevnetSigning />
        ) : (
          <p>La consulta de tratos todavía está en desarrollo.</p>
        )}
      </main>
    </>
  );
}
