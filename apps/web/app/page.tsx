import Link from 'next/link';
import { TestBalance } from '@/components/test-balance';
import DealPreview from './deal-preview';
import SiteHeader from './site-header';

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="hero page-width" aria-labelledby="home-title">
          <div className="hero-copy">
            <p className="eyebrow" data-intro-copy>Archivos con pago protegido</p>
            <h1 id="home-title">
              <span className="hero-line"><span data-intro-line>Paga primero.</span></span>
              <span className="hero-line"><span data-intro-line>Libera al recibir<span className="hero-period">.</span></span></span>
            </h1>
            <p className="hero-description" data-intro-copy>
              Vende audio, video, imágenes o informes. El comprador paga antes y la plata queda protegida; el vendedor la recibe cuando el comprador confirma con un botón.
            </p>
            <div className="hero-actions" data-intro-copy>
              <Link className="button button-primary" href="/vender">Vender un archivo <span aria-hidden="true">→</span></Link>
              <a className="button" href="#demo">Ver un trato <span aria-hidden="true">↘</span></a>
            </div>
          </div>
          <DealPreview />
        </section>
        <section className="page-width" style={{ maxWidth: '28rem' }} aria-label="Tu cuenta">
          <TestBalance />
        </section>
        <section className="guide" id="como-funciona" aria-labelledby="guide-title">
          <div className="page-width guide-inner">
            <h2 id="guide-title">Cómo funciona</h2>
            <details>
              <summary>¿Cómo entro a una venta?</summary>
              <p>Abre el link que te compartieron por chat o escanea el QR. Los dos llevan a la misma página.</p>
            </details>
            <details>
              <summary>¿Cuándo recibe la plata el vendedor?</summary>
              <p>Cuando el comprador desbloquea el archivo y confirma que lo recibió. Si no confirma a tiempo, se le paga igual al vendedor.</p>
            </details>
            <details>
              <summary>¿Y si me arrepiento antes de abrir el archivo?</summary>
              <p>Mientras no desbloquees el archivo puedes cancelar, y te devolvemos toda la plata.</p>
            </details>
          </div>
        </section>
      </main>
      <footer className="page-width site-footer">
        <Link href="/" className="wordmark" aria-label="Closeby, inicio">closeby<span className="brand-dot" aria-hidden="true">.</span></Link>
        <Link href="/deals/devnet-signing" className="nav-link">Prueba de firma <span aria-hidden="true">↗</span></Link>
      </footer>
    </>
  );
}
