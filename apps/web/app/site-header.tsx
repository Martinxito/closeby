import Link from 'next/link';

export default function SiteHeader({ deal = false }: { deal?: boolean }) {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="wordmark" aria-label="Closeby, inicio">
          <span className="brand-mark" aria-hidden="true" />
          closeby<span className="brand-dot" aria-hidden="true">.</span>
        </Link>
        {deal ? (
          <Link href="/" className="nav-link">Volver al inicio <span aria-hidden="true">↗</span></Link>
        ) : (
          <nav aria-label="Navegación principal">
            <a href="#como-funciona" className="nav-link nav-explainer">Cómo funciona</a>
            <Link href="/vender" className="nav-link">Vender <span aria-hidden="true">↗</span></Link>
          </nav>
        )}
      </div>
    </header>
  );
}
