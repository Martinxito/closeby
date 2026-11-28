'use client';

// In-person deal (docs/in-person-proposal.md), for both sides:
//   buyer proposes time + place and pays → seller accepts or declines → at the meeting the
//   buyer confirms ("Recibí el producto") or rejects; deadlines refund the buyer.
// Buttons come from `availableActions`, like the digital panel. The exact place is only
// fetched for the buyer and the seller, from our server, which checks it against the
// order's on-chain place_hash.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { sendEscrowAction } from '@/lib/escrow/client';
import { availableActions } from '@/lib/escrow/rules';
import { EscrowError, type EscrowErrorCode, type Order, type SimpleActionType } from '@/lib/escrow/types';
import { formatClp } from '@/lib/format';
import { fetchMeetingPlace, forgetPendingPlace, placeHash, rememberPendingPlace, saveMeetingPlace, savePendingPlace } from '@/lib/meeting';
import { MEETING_POINTS, mapsUrl } from '@/lib/meeting-points';
import { UserError, friendlyMessage } from '@/lib/user-error';
import { useWallet } from '@/lib/wallet';

type Props = { dealId: string; priceClp: number; order: Order | null; communes: string[]; availability: string | null };

const ERRORS: Partial<Record<EscrowErrorCode, string>> = {
  BuyerIsSeller: 'No puedes comprar tu propia venta.',
  InvalidStatus: 'La venta cambió mientras tanto. Ya la actualizamos.',
  NotBuyer: 'Solo quien reservó puede hacer esto.',
  NotSeller: 'Solo el vendedor puede hacer esto.',
  MeetingInPast: 'Elige un día y hora en el futuro.',
  AcceptWindowClosed: 'Se acabó el plazo para aceptar el encuentro.',
  TooEarlyToReject: 'Podrás rechazar el producto desde 30 minutos antes del encuentro.',
  DeadlineNotReached: 'Todavía no se cumple el plazo.',
  InsufficientFunds: 'No tienes saldo suficiente. Carga saldo de prueba en la página de inicio.',
  Unauthorized: 'Tu sesión expiró. Vuelve a entrar.',
};

const OTHER_PLACE = '__other__';

export function MeetingPanel({ dealId, priceClp, order, communes, availability }: Props) {
  const wallet = useWallet();
  const router = useRouter();
  const now = useNow();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [venue, setVenue] = useState<string | null>(null);
  // True once we know the server has no place for this order (see savePendingPlace).
  const [placeMissing, setPlaceMissing] = useState(false);

  const me = wallet.address;
  const isSeller = me !== null && me === order?.seller;
  const isBuyer = me !== null && me === order?.buyer;
  const isParty = isSeller || isBuyer;
  const placeKey = order?.placeHash ?? null;

  // The exact place: only for the two parties, once the buyer proposed it.
  useEffect(() => {
    if (!isParty || !placeKey) return;
    let cancelled = false;
    (async () => {
      let place = await fetchMeetingPlace(dealId, wallet).catch(() => null);
      // Paid, but the place never reached our server (e.g. the connection dropped right
      // after paying): the buyer's browser still has it, so save it now.
      if (!place && isBuyer) place = await savePendingPlace(dealId, placeKey, wallet).catch(() => null);
      if (cancelled) return;
      setVenue(place);
      setPlaceMissing(!place);
    })();
    return () => {
      cancelled = true;
    };
  }, [isParty, isBuyer, placeKey, dealId, wallet]);

  if (!wallet.ready) return <p className="muted" aria-live="polite">Cargando…</p>;
  if (!order) return <p className="muted">Esta venta todavía no está lista. Recarga en unos segundos.</p>;

  const actions = new Set(availableActions(order, me, now));
  const price = formatClp(priceClp);

  async function run(type: SimpleActionType) {
    setBusy(type);
    setError(null);
    try {
      await sendEscrowAction({ type, dealId }, wallet);
    } catch (err) {
      setError(err instanceof EscrowError ? (ERRORS[err.code] ?? 'No pudimos completar la acción. Intenta de nuevo.') : friendlyMessage(err));
    } finally {
      setBusy(null);
      router.refresh();
    }
  }

  async function propose(meetingTime: number, place: string) {
    setBusy('fund_and_schedule');
    setError(null);
    let paid = false;
    try {
      const hash = await placeHash(place);
      // Kept in this browser until our server has it, in case step 2 fails.
      rememberPendingPlace(dealId, place);
      // 1. Pay and commit to time + place (only the hash goes on-chain).
      await sendEscrowAction({ type: 'fund_and_schedule', dealId, meetingTime, placeHash: hash }, wallet);
      paid = true;
      // 2. Save the place itself off-chain; the server checks it matches the hash.
      await saveMeetingPlace(dealId, place, wallet);
      forgetPendingPlace(dealId);
      setVenue(place.trim());
      setPlaceMissing(false);
    } catch (err) {
      if (paid) {
        // The money is reserved: say so, and offer to retry saving the place.
        setPlaceMissing(true);
        setError('Tu plata quedó reservada, pero no pudimos guardar el lugar del encuentro. Toca «Guardar el lugar» para intentarlo de nuevo.');
      } else {
        setError(err instanceof EscrowError ? (ERRORS[err.code] ?? 'No pudimos reservar. Intenta de nuevo.') : friendlyMessage(err));
      }
    } finally {
      setBusy(null);
      router.refresh();
    }
  }

  async function retrySavePlace() {
    if (!placeKey) return;
    setBusy('save_place');
    setError(null);
    try {
      const saved = await savePendingPlace(dealId, placeKey, wallet);
      if (!saved) throw new UserError('No encontramos el lugar en este dispositivo. Coordínalo con el vendedor.');
      setVenue(saved);
      setPlaceMissing(false);
    } catch (err) {
      setError(friendlyMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const when = order.meetingTime ? formatWhen(order.meetingTime) : null;
  const meetingOpen = order.status === 'Funded' || order.status === 'Scheduled';

  return (
    <section className="card stack" aria-live="polite">
      <Timeline status={order.status} />

      <Status order={order} isBuyer={isBuyer} isSeller={isSeller} price={price} now={now} when={when} />

      {/* The meeting, for the two parties */}
      {isParty && when && (
        <div className="stack" style={{ gap: '0.35rem' }}>
          <strong>
            📍 {when}
            {venue ? ` · ${venue}` : ''}
          </strong>
          {venue && (
            <a className="nav-link" href={mapsUrl(venue)} target="_blank" rel="noreferrer">
              Ver en el mapa <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>
      )}

      {/* Paid, but the place did not reach our server */}
      {isParty && meetingOpen && placeMissing &&
        (isBuyer ? (
          <button type="button" className="button" disabled={busy !== null} onClick={retrySavePlace}>
            {busy === 'save_place' ? 'Guardando…' : 'Guardar el lugar'}
          </button>
        ) : (
          <p className="muted">El comprador todavía no termina de guardar el lugar del encuentro.</p>
        ))}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {!me && order.status === 'Created' && (
        <button type="button" className="button button-primary" onClick={() => wallet.login()}>
          Entrar para reservar
        </button>
      )}

      {isSeller && order.status === 'Created' && <Link href={`/vender/${dealId}`}>Ver el estado de tu venta y compartirla</Link>}

      {actions.has('fund_and_schedule') && (
        <ProposeForm communes={communes} availability={availability} price={price} busy={busy !== null} onSubmit={propose} />
      )}

      {actions.has('accept_meeting') && (
        <button type="button" className="button button-primary" disabled={busy !== null} onClick={() => run('accept_meeting')}>
          {busy === 'accept_meeting' ? 'Aceptando…' : 'Aceptar el encuentro'}
        </button>
      )}
      {actions.has('decline_meeting') && (
        <button type="button" className="button" disabled={busy !== null} onClick={() => run('decline_meeting')}>
          {busy === 'decline_meeting' ? 'Rechazando…' : 'Rechazar (le devolvemos la plata)'}
        </button>
      )}

      {actions.has('confirm_handover') && (
        <button type="button" className="button button-primary" disabled={busy !== null} onClick={() => run('confirm_handover')}>
          {busy === 'confirm_handover' ? 'Pagando al vendedor…' : 'Recibí el producto: cerrar trato'}
        </button>
      )}
      {actions.has('reject_at_meeting') && (
        <button type="button" className="button" disabled={busy !== null} onClick={() => run('reject_at_meeting')}>
          {busy === 'reject_at_meeting' ? 'Devolviendo…' : 'No es lo que me ofrecieron'}
        </button>
      )}
      {actions.has('seller_cancel') && (
        <button type="button" className="link-button" disabled={busy !== null} onClick={() => run('seller_cancel')}>
          {busy === 'seller_cancel' ? 'Cancelando…' : 'Cancelar el encuentro (le devolvemos la plata al comprador)'}
        </button>
      )}

      {actions.has('refund_unaccepted') && (
        <button type="button" className="button button-primary" disabled={busy !== null} onClick={() => run('refund_unaccepted')}>
          {busy === 'refund_unaccepted' ? 'Devolviendo…' : 'Devolver la plata al comprador'}
        </button>
      )}
      {actions.has('refund_after_deadline') && (
        <button type="button" className="button button-primary" disabled={busy !== null} onClick={() => run('refund_after_deadline')}>
          {busy === 'refund_after_deadline' ? 'Devolviendo…' : 'Devolver la plata al comprador'}
        </button>
      )}

      {(order.status === 'Released' || order.status === 'Refunded') && order.lastSignature && <Receipt signature={order.lastSignature} />}
    </section>
  );
}

function ProposeForm({
  communes,
  availability,
  price,
  busy,
  onSubmit,
}: {
  communes: string[];
  availability: string | null;
  price: string;
  busy: boolean;
  onSubmit: (meetingTime: number, place: string) => void;
}) {
  const [commune, setCommune] = useState(communes[0] ?? '');
  const points = useMemo(() => MEETING_POINTS[commune] ?? [], [commune]);
  const [point, setPoint] = useState(points[0] ?? OTHER_PLACE);
  const [otherPlace, setOtherPlace] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => setPoint(points[0] ?? OTHER_PLACE), [points]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const date = String(form.get('date') ?? '');
    const time = String(form.get('time') ?? '');
    const place = point === OTHER_PLACE ? otherPlace.trim() : `${point}, ${commune}`;
    // Chile time: the browser's local time zone is the buyer's.
    const meetingTime = Math.floor(new Date(`${date}T${time}`).getTime() / 1000);
    try {
      if (!date || !time || Number.isNaN(meetingTime)) throw new UserError('Elige el día y la hora.');
      if (meetingTime <= Math.floor(Date.now() / 1000) + 5 * 60) throw new UserError('Elige un horario con al menos 5 minutos de anticipación.');
      if (place.length < 3) throw new UserError('Elige o escribe el punto de encuentro.');
      setProblem(null);
      onSubmit(meetingTime, place);
    } catch (err) {
      setProblem(friendlyMessage(err));
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      {availability && <p className="muted">El vendedor puede: {availability}</p>}
      <div className="row-2">
        <label className="field">
          <span>Día</span>
          <input type="date" name="date" required disabled={busy} min={new Date().toISOString().slice(0, 10)} />
        </label>
        <label className="field">
          <span>Hora</span>
          <input type="time" name="time" required disabled={busy} />
        </label>
      </div>

      {communes.length > 0 && (
        <label className="field">
          <span>Comuna</span>
          <select value={commune} onChange={(e) => setCommune(e.target.value)} disabled={busy}>
            {communes.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      )}

      <label className="field">
        <span>Punto de encuentro</span>
        <select value={point} onChange={(e) => setPoint(e.target.value)} disabled={busy}>
          {points.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
          <option value={OTHER_PLACE}>Otro lugar…</option>
        </select>
        <small>Sugerimos lugares públicos y concurridos.</small>
      </label>

      {point === OTHER_PLACE && (
        <label className="field">
          <span>¿Dónde?</span>
          <input value={otherPlace} onChange={(e) => setOtherPlace(e.target.value)} maxLength={200} placeholder="Ej: Plaza Ñuñoa, frente a la pileta" disabled={busy} />
        </label>
      )}

      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}

      <button type="submit" className="button button-primary" disabled={busy}>
        {busy ? 'Reservando tu pago…' : `Reservar con mi pago · ${price}`}
      </button>
      <small className="muted">
        Tu plata queda protegida. El vendedor la recibe solo cuando, en el encuentro, confirmes que recibiste el producto. Si no acepta o no
        se concreta, te la devolvemos.
      </small>
    </form>
  );
}

function Status({
  order,
  isBuyer,
  isSeller,
  price,
  now,
  when,
}: {
  order: Order;
  isBuyer: boolean;
  isSeller: boolean;
  price: string;
  now: number;
  when: string | null;
}) {
  const line = (title: string, detail?: string) => (
    <div>
      <strong>{title}</strong>
      {detail && <p className="muted">{detail}</p>}
    </div>
  );

  switch (order.status) {
    case 'Created':
      return isSeller
        ? line('Esta es tu venta', 'Comparte el link. El comprador propone cuándo y dónde juntarse.')
        : line('Disponible', 'Propón día, hora y lugar, y reserva con tu pago. El vendedor confirma el encuentro.');
    case 'Funded': {
      if (now >= (order.acceptDeadline ?? Infinity)) return line('El vendedor no respondió a tiempo', 'La plata vuelve completa al comprador.');
      if (isSeller) {
        return line(`Te reservaron ${price}`, `Acepta o rechaza el encuentro antes de ${formatWhen(order.acceptDeadline)}. Si no respondes, se le devuelve la plata.`);
      }
      if (isBuyer) return line('Plata reservada', `Esperando que el vendedor acepte (hasta ${formatWhen(order.acceptDeadline)}). Si no acepta, te la devolvemos.`);
      return line('Alguien ya reservó este producto');
    }
    case 'Scheduled': {
      if (now > (order.releaseDeadline ?? Infinity)) return line('Nadie confirmó el encuentro', 'La plata vuelve al comprador.');
      if (isBuyer) {
        return line(`Encuentro agendado ${when ? `· ${when}` : ''}`, 'Revisa el producto en persona. Si está bien, confirma y el vendedor recibe el pago al instante.');
      }
      if (isSeller) return line(`Encuentro agendado ${when ? `· ${when}` : ''}`, `Lleva el producto. Te pagan ${price} cuando el comprador confirme.`);
      return line('Encuentro agendado');
    }
    case 'Released':
      return isSeller ? line(`✅ Te pagaron ${price}`, 'Trato hecho.') : line('✅ Trato hecho', isBuyer ? `Le pagaste ${price} al vendedor.` : undefined);
    case 'Refunded':
      return isBuyer ? line('Te devolvimos tu plata', `${price} volvieron a tu saldo.`) : line('El trato se canceló', 'La plata volvió al comprador.');
    default:
      return null;
  }
}

const STEPS = ['Reservado', 'Agendado', 'Trato hecho'] as const;

function Timeline({ status }: { status: Order['status'] }) {
  if (status === 'Refunded') return null;
  const reached = { Created: 0, Funded: 1, Scheduled: 2, Delivered: 2, Released: 3 }[status];
  return (
    <ol className="timeline" aria-label="Avance del trato">
      {STEPS.map((label, i) => (
        <li key={label} data-done={i < reached}>
          {label}
        </li>
      ))}
    </ol>
  );
}

function Receipt({ signature }: { signature: string }) {
  if (process.env.NEXT_PUBLIC_ESCROW_MODE === 'chain') {
    return (
      <a className="nav-link" href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`} target="_blank" rel="noreferrer">
        Ver comprobante <span aria-hidden="true">↗</span>
      </a>
    );
  }
  return <small className="muted">Comprobante de prueba: {signature.slice(0, 8)}…</small>;
}

/** "sáb 28 nov, 16:00" in Chile time. */
function formatWhen(unixSecs: number | null): string {
  if (!unixSecs) return '—';
  return new Intl.DateTimeFormat('es-CL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Santiago',
  }).format(new Date(unixSecs * 1000));
}

function useNow(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}
