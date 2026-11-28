'use client';

// Buyer side of a digital deal (docs/flows/digital-sale.md, steps 3–5):
// buy → unlock (point of no return) → download → "Recibí el archivo" → seller paid.
// Every button comes from `availableActions`, so the screen never offers something the
// escrow rules would reject. After each action we re-render the server page, which
// re-reads the order: the screen trusts the escrow, not its own memory.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { downloadPurchasedFile } from '@/lib/downloads';
import { sendEscrowAction } from '@/lib/escrow/client';
import { availableActions, canDownload } from '@/lib/escrow/rules';
import { EscrowError, type EscrowActionType, type EscrowErrorCode, type Order } from '@/lib/escrow/types';
import { formatClp } from '@/lib/format';
import { useWallet } from '@/lib/wallet';
import { friendlyMessage } from '@/lib/user-error';

type Props = { dealId: string; priceClp: number; order: Order | null };

const ERRORS: Partial<Record<EscrowErrorCode, string>> = {
  BuyerIsSeller: 'No puedes comprar tu propia venta.',
  InvalidStatus: 'La venta cambió mientras tanto. Ya la actualizamos.',
  NotBuyer: 'Solo quien compró puede hacer esto.',
  ClaimWindowClosed: 'Se acabó el plazo para desbloquear el archivo.',
  InsufficientFunds: 'No tienes saldo suficiente. Carga saldo de prueba en la página de inicio.',
  DeadlineNotReached: 'Todavía no se cumple el plazo.',
  Unauthorized: 'Tu sesión expiró. Vuelve a entrar.',
};

export function BuyerPanel({ dealId, priceClp, order }: Props) {
  const wallet = useWallet();
  const router = useRouter();
  const now = useNow();
  const [busy, setBusy] = useState<EscrowActionType | 'download' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingUnlock, setConfirmingUnlock] = useState(false);

  // The login provider takes a few seconds to start (Privy): say so instead of a blank gap.
  if (!wallet.ready) return <p className="muted" aria-live="polite">Cargando…</p>;
  if (!order) return <p className="muted">Esta venta todavía no está lista. Recarga en unos segundos.</p>;

  const me = wallet.address;
  const isSeller = me === order.seller;
  const isBuyer = me !== null && me === order.buyer;
  const actions = new Set(availableActions(order, me, now));
  const price = formatClp(priceClp);

  async function run(type: Exclude<EscrowActionType, 'create_order'>) {
    setBusy(type);
    setError(null);
    try {
      await sendEscrowAction({ type, dealId }, wallet);
      setConfirmingUnlock(false);
    } catch (err) {
      setError(err instanceof EscrowError ? (ERRORS[err.code] ?? 'No pudimos completar la acción. Intenta de nuevo.') : friendlyMessage(err));
    } finally {
      setBusy(null);
      router.refresh(); // re-read the order from the escrow in every case
    }
  }

  async function download() {
    setBusy('download');
    setError(null);
    try {
      await downloadPurchasedFile(dealId, wallet);
    } catch (err) {
      setError(friendlyMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card stack" aria-live="polite">
      <Timeline status={order.status} />
      <Status order={order} isBuyer={isBuyer} isSeller={isSeller} price={price} now={now} />

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {/* Not logged in */}
      {!me && order.status === 'Created' && (
        <button type="button" className="button button-primary" onClick={() => wallet.login()}>
          Entrar para comprar
        </button>
      )}

      {/* Seller looking at their own deal */}
      {isSeller && <Link href={`/vender/${dealId}`}>Ver el estado de tu venta y compartirla</Link>}

      {actions.has('fund') && (
        <button type="button" className="button button-primary" disabled={busy !== null} onClick={() => run('fund')}>
          {busy === 'fund' ? 'Reservando tu pago…' : `Comprar con pago protegido · ${price}`}
        </button>
      )}

      {actions.has('open_delivery') && !confirmingUnlock && (
        <button type="button" className="button button-primary" disabled={busy !== null} onClick={() => setConfirmingUnlock(true)}>
          Desbloquear archivo
        </button>
      )}
      {actions.has('open_delivery') && confirmingUnlock && (
        <div className="stack">
          <p>
            <strong>Al desbloquear el archivo ya no podrás cancelar.</strong> Revisa la vista previa antes de seguir.
          </p>
          <button type="button" className="button button-primary" disabled={busy !== null} onClick={() => run('open_delivery')}>
            {busy === 'open_delivery' ? 'Desbloqueando…' : 'Sí, desbloquear'}
          </button>
          <button type="button" className="link-button" disabled={busy !== null} onClick={() => setConfirmingUnlock(false)}>
            Volver
          </button>
        </div>
      )}

      {isBuyer && canDownload(order, me) && (
        <button type="button" className="button" disabled={busy !== null} onClick={download}>
          {busy === 'download' ? 'Preparando descarga…' : 'Descargar archivo'} <span aria-hidden="true">↓</span>
        </button>
      )}

      {actions.has('confirm_handover') && (
        <button type="button" className="button button-primary" disabled={busy !== null} onClick={() => run('confirm_handover')}>
          {busy === 'confirm_handover' ? 'Pagando al vendedor…' : 'Recibí el archivo: pagar al vendedor'}
        </button>
      )}

      {actions.has('buyer_cancel') && !confirmingUnlock && (
        <button type="button" className="link-button" disabled={busy !== null} onClick={() => run('buyer_cancel')}>
          {busy === 'buyer_cancel' ? 'Cancelando…' : 'Cancelar compra y recuperar mi plata'}
        </button>
      )}

      {actions.has('refund_after_deadline') && (
        <button type="button" className="button button-primary" disabled={busy !== null} onClick={() => run('refund_after_deadline')}>
          {busy === 'refund_after_deadline' ? 'Devolviendo…' : 'Devolver la plata al comprador'}
        </button>
      )}

      {actions.has('release_after_deadline') && (
        <button type="button" className="button button-primary" disabled={busy !== null} onClick={() => run('release_after_deadline')}>
          {busy === 'release_after_deadline' ? 'Pagando…' : 'Pagar al vendedor (plazo cumplido)'}
        </button>
      )}

      {(order.status === 'Released' || order.status === 'Refunded') && order.lastSignature && <Receipt signature={order.lastSignature} />}
    </section>
  );
}

function Status({ order, isBuyer, isSeller, price, now }: { order: Order; isBuyer: boolean; isSeller: boolean; price: string; now: number }) {
  const line = (title: string, detail?: string) => (
    <div>
      <strong>{title}</strong>
      {detail && <p className="muted">{detail}</p>}
    </div>
  );

  switch (order.status) {
    case 'Created':
      return isSeller
        ? line('Esta es tu venta', 'Comparte el link con tu comprador.')
        : line('Disponible', 'Tu plata queda protegida: el vendedor recibe el pago solo cuando confirmes que recibiste el archivo.');
    case 'Funded': {
      const expired = now > (order.claimDeadline ?? 0);
      if (expired) return line('El plazo para desbloquear terminó', 'La plata vuelve completa al comprador.');
      if (isBuyer) return line('Plata reservada', `Tienes ${countdown(order.claimDeadline, now)} para desbloquear el archivo. Hasta entonces puedes cancelar.`);
      return line('Alguien ya compró este archivo');
    }
    case 'Delivered': {
      const expired = now > (order.releaseDeadline ?? 0);
      if (isBuyer && !expired) {
        return line('Archivo desbloqueado', `Descárgalo y confirma. Si no confirmas en ${countdown(order.releaseDeadline, now)}, se le paga al vendedor automáticamente.`);
      }
      if (expired) return line('Plazo de revisión cumplido', 'El comprador ya tiene el archivo: corresponde pagarle al vendedor.');
      return line('El comprador ya tiene el archivo');
    }
    case 'Released':
      return isBuyer ? line('✅ Trato hecho', `Le pagaste ${price} al vendedor. Puedes volver a descargar tu archivo.`) : line('✅ Trato hecho');
    case 'Refunded':
      return isBuyer ? line('Te devolvimos tu plata', `${price} volvieron a tu saldo.`) : line('Esta compra se canceló');
    default:
      return null;
  }
}

const STEPS = ['Pagado', 'Desbloqueado', 'Trato hecho'] as const;

function Timeline({ status }: { status: Order['status'] }) {
  if (status === 'Refunded') return null;
  const reached = { Created: 0, Funded: 1, Scheduled: 1, Delivered: 2, Released: 3 }[status];
  return (
    <ol className="timeline" aria-label="Avance de la compra">
      {STEPS.map((label, i) => (
        <li key={label} data-done={i < reached}>
          {label}
        </li>
      ))}
    </ol>
  );
}

function Receipt({ signature }: { signature: string }) {
  // In mock mode the signature is fake, so it cannot be opened in the Explorer.
  if (process.env.NEXT_PUBLIC_ESCROW_MODE === 'chain') {
    return (
      <a className="nav-link" href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`} target="_blank" rel="noreferrer">
        Ver comprobante <span aria-hidden="true">↗</span>
      </a>
    );
  }
  return <small className="muted">Comprobante de prueba: {signature.slice(0, 8)}…</small>;
}

/** Current time in unix seconds, ticking every second (for countdowns and deadline buttons). */
function useNow(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function countdown(deadline: number | null, now: number): string {
  const secs = Math.max(0, (deadline ?? now) - now);
  const minutes = Math.floor(secs / 60);
  const seconds = secs % 60;
  if (minutes >= 60) return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  return minutes > 0 ? `${minutes} min ${String(seconds).padStart(2, '0')} s` : `${seconds} s`;
}

