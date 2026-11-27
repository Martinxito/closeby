import type { Metadata } from 'next';
import SiteHeader from '../site-header';
import { SellForm } from './sell-form';

export const metadata: Metadata = { title: 'Vender | Closeby' };

export default function SellPage() {
  return (
    <>
      <SiteHeader deal />
      <main className="app-page stack">
        <p className="eyebrow">Vender</p>
        <h1>Vende tu archivo con pago protegido</h1>
        <p className="muted">Audio, video, imágenes, informes o cualquier archivo.</p>
        <SellForm />
      </main>
    </>
  );
}
