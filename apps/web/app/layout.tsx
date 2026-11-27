import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { WalletProvider } from '@/lib/wallet';
import './globals.css';

export const metadata: Metadata = {
  title: 'Closeby',
  description: 'Vende y compra archivos con pago protegido: el vendedor recibe la plata cuando el comprador confirma.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-CL" data-scroll-behavior="smooth">
      <body>
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
