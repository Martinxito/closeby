import type { Metadata } from 'next';
import SiteHeader from '../site-header';
import { SaleKindChooser } from './sale-kind-chooser';

export const metadata: Metadata = { title: 'Vender | Closeby' };

export default function SellPage() {
  return (
    <>
      <SiteHeader deal />
      <main className="app-page stack">
        <p className="eyebrow">Vender</p>
        <h1>Vende con pago protegido</h1>
        <p className="muted">Un archivo (audio, video, imágenes, informes) o algo que entregas en persona.</p>
        <SaleKindChooser />
      </main>
    </>
  );
}
