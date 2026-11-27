import Link from 'next/link';
import { TestBalance } from '@/components/test-balance';

export default function HomePage() {
  return (
    <main className="stack">
      <h1>Closeby</h1>
      <p>Vende tus archivos con pago protegido. El comprador paga antes, y se te paga cuando confirma que lo recibió.</p>
      <Link className="button" href="/vender" style={{ textAlign: 'center', textDecoration: 'none' }}>
        Vender un archivo
      </Link>
      <p className="muted">Si te compartieron una venta, abre el link que recibiste.</p>
      <TestBalance />
    </main>
  );
}
