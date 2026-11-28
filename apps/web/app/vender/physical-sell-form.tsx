'use client';

// In-person sale: the seller publishes an item, where and when they can meet.
// The buyer then proposes the exact time and place and pays (docs/in-person-proposal.md).

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { sendEscrowAction } from '@/lib/escrow/client';
import { EscrowError } from '@/lib/escrow/types';
import { clpToUsdcUnits, formatClp } from '@/lib/format';
import { COMMUNES } from '@/lib/meeting-points';
import { UserError, friendlyMessage } from '@/lib/user-error';
import { useWallet } from '@/lib/wallet';
import { preparePhysicalSale, publishPhysicalSale } from './in-person-actions';

type Step = 'idle' | 'uploading' | 'reserving' | 'publishing';
const STEP_LABEL: Record<Step, string> = {
  idle: 'Publicar venta',
  uploading: 'Subiendo la foto…',
  reserving: 'Creando tu venta protegida…',
  publishing: 'Publicando…',
};

export function PhysicalSellForm() {
  const wallet = useWallet();
  const router = useRouter();
  const [photo, setPhoto] = useState<File | null>(null);
  const [price, setPrice] = useState('');
  const [communes, setCommunes] = useState<string[]>([]);
  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState<string | null>(null);

  const priceClp = Number(price.replace(/\D/g, ''));
  const busy = step !== 'idle';

  if (!wallet.ready) return <p className="muted" aria-live="polite">Cargando…</p>;
  if (!wallet.address) {
    return (
      <section className="card stack">
        <p>Entra para publicar tu venta. Te avisamos cuando alguien reserve.</p>
        <button type="button" className="button button-primary" onClick={() => wallet.login()}>
          Entrar
        </button>
      </section>
    );
  }

  function toggleCommune(commune: string) {
    setCommunes((current) => (current.includes(commune) ? current.filter((c) => c !== commune) : [...current, commune]));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    try {
      if (communes.length === 0) throw new UserError('Elige al menos una comuna donde puedas juntarte.');

      setStep('uploading');
      const prepared = await preparePhysicalSale({ photo: photo ? { name: photo.name, size: photo.size, type: photo.type } : null });
      if (!prepared.ok) throw new UserError(prepared.error);
      if (photo && prepared.photo) await upload(prepared.photo.uploadUrl, photo);

      // In-person orders carry no file hash: the place is committed later, by the buyer.
      setStep('reserving');
      await sendEscrowAction(
        { type: 'create_order', dealId: prepared.dealId, amount: clpToUsdcUnits(priceClp), kind: 'physical', contentHash: null },
        wallet,
      );

      setStep('publishing');
      const published = await publishPhysicalSale({
        dealId: prepared.dealId,
        accessToken: await wallet.getAccessToken(),
        title: String(form.get('title') ?? ''),
        description: String(form.get('description') ?? ''),
        priceClp,
        communes,
        availability: String(form.get('availability') ?? ''),
        photoPath: prepared.photo?.path ?? null,
      });
      if (!published.ok) throw new UserError(published.error);
      router.push(`/vender/${published.dealId}`);
    } catch (err) {
      setError(err instanceof EscrowError ? 'No pudimos crear tu venta protegida. Intenta de nuevo.' : friendlyMessage(err));
      setStep('idle');
    }
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      <label className="field">
        <span>¿Qué vendes?</span>
        <input name="title" required maxLength={120} placeholder="Ej: Bicicleta aro 29 Trek" disabled={busy} />
      </label>

      <label className="field">
        <span>Descripción</span>
        <textarea name="description" rows={4} maxLength={2000} placeholder="Estado, detalles, qué incluye" disabled={busy} />
      </label>

      <label className="field">
        <span>Precio</span>
        <input
          inputMode="numeric"
          required
          placeholder="$150.000"
          value={price && priceClp ? formatClp(priceClp) : price}
          onChange={(e) => setPrice(e.target.value)}
          disabled={busy}
        />
      </label>

      <label className="field">
        <span>Foto (opcional)</span>
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} disabled={busy} />
      </label>

      <fieldset className="field" disabled={busy}>
        <span>¿En qué comunas puedes juntarte?</span>
        <div className="chips">
          {COMMUNES.map((commune) => (
            <label key={commune} className="chip">
              <input type="checkbox" checked={communes.includes(commune)} onChange={() => toggleCommune(commune)} />
              {commune}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="field">
        <span>¿Cuándo puedes?</span>
        <input name="availability" required maxLength={200} placeholder="Ej: Lun a vie después de las 18:00, sáb todo el día" disabled={busy} />
        <small>El comprador propone el día, la hora y el punto de encuentro. Tú aceptas o rechazas.</small>
      </label>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <button className="button button-primary" type="submit" disabled={busy || priceClp < 1000}>
        {STEP_LABEL[step]}
      </button>
      <small className="muted">
        El comprador paga al reservar y la plata queda protegida. Se te paga cuando, en el encuentro, confirma que recibió el producto.
      </small>
    </form>
  );
}

async function upload(url: string, file: File): Promise<void> {
  const response = await fetch(url, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
  if (!response.ok) throw new UserError('No pudimos subir la foto. Revisa tu conexión e intenta de nuevo.');
}
