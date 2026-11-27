import type { Metadata } from 'next';
import Link from 'next/link';
import { SellForm } from './sell-form';

export const metadata: Metadata = { title: 'Vender | Closeby' };

export default function SellPage() {
  return (
    <main>
      <Link href="/">Closeby</Link>
      <h1>Vende tu archivo con pago protegido</h1>
      <p className="muted">Audio, video, imágenes, informes o cualquier archivo.</p>
      <SellForm />
    </main>
  );
}
