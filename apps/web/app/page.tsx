import Link from 'next/link';
import DealPreview from './deal-preview';
import SiteHeader from './site-header';

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="hero page-width" aria-labelledby="home-title">
          <div className="hero-copy">
            <p className="eyebrow" data-intro-copy>Compraventa en persona</p>
            <h1 id="home-title">
              <span className="hero-line"><span data-intro-line>Mira primero.</span></span>
              <span className="hero-line"><span data-intro-line>Paga después<span className="hero-period">.</span></span></span>
            </h1>
            <p className="hero-description" data-intro-copy>
              Reserva la plata antes de juntarte. Revisa el producto en persona y libera el pago cuando estés conforme.
            </p>
            <div className="hero-actions" data-intro-copy>
              <a className="button button-primary" href="#demo">Explorar un trato <span aria-hidden="true">↘</span></a>
            </div>
          </div>
          <DealPreview />
        </section>
        <section className="guide" id="como-funciona" aria-labelledby="guide-title">
          <div className="page-width guide-inner">
            <h2 id="guide-title">Cómo funciona</h2>
            <details>
              <summary>¿Cómo entro a mi trato?</summary>
              <p>Abre el enlace que te compartieron por chat o escanea el QR. Los dos llevan a la misma página del trato.</p>
            </details>
            <details>
              <summary>¿Cuándo recibe la plata el vendedor?</summary>
              <p>Cuando el comprador revisa el producto, aprueba el pago y Closeby confirma que se completó.</p>
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
