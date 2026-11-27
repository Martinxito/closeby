import Link from 'next/link';
import { notFound } from 'next/navigation';
import DevnetSigning from './devnet-signing';

export default async function DealPage({ params }: PageProps<'/deals/[dealId]'>) {
  const { dealId } = await params;

  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(dealId)) {
    notFound();
  }

  return (
    <main>
      <Link href="/">Closeby</Link>
      <h1>Trato {dealId}</h1>
      {dealId === 'devnet-signing' ? (
        <DevnetSigning />
      ) : (
        <p>La consulta de tratos todavía está en desarrollo.</p>
      )}
    </main>
  );
}
