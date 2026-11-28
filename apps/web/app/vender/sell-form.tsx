'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { sendEscrowAction } from '@/lib/escrow/client';
import { EscrowError } from '@/lib/escrow/types';
import { clpToUsdcUnits, formatClp, formatFileSize } from '@/lib/format';
import { useWallet } from '@/lib/wallet';
import { prepareSale, publishSale } from './actions';
import { UserError, friendlyMessage } from '@/lib/user-error';

type Step = 'idle' | 'uploading' | 'reserving' | 'publishing';

const STEP_LABEL: Record<Step, string> = {
  idle: 'Publicar venta',
  uploading: 'Subiendo tu archivo…',
  reserving: 'Creando tu venta protegida…',
  publishing: 'Publicando…',
};

export function SellForm() {
  const wallet = useWallet();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<File | null>(null);
  const [price, setPrice] = useState('');
  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState<string | null>(null);

  const priceClp = Number(price.replace(/\D/g, ''));
  const busy = step !== 'idle';

  if (!wallet.ready) return null;

  if (!wallet.address) {
    return (
      <section className="card">
        <p>Entra para publicar tu venta. Te avisamos cuando alguien compre.</p>
        <button type="button" className="button button-primary" onClick={() => wallet.login()}>
          Entrar
        </button>
      </section>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !wallet.address) return;
    const form = new FormData(event.currentTarget);
    setError(null);

    try {
      // 0. The preview is public, so it must not be the file being sold. The server checks
      //    this again after upload; checking here first avoids a useless upload.
      setStep('uploading');
      const contentHashPromise = sha256Hex(file);
      if (preview && (await sha256Hex(preview)) === (await contentHashPromise)) {
        throw new UserError('La vista previa no puede ser el archivo completo: cualquiera podría descargarlo sin pagar. Sube solo una muestra.');
      }

      // 1. Deal ID and one-time upload links.
      const prepared = await prepareSale({
        file: { name: file.name, size: file.size },
        preview: preview ? { name: preview.name, size: preview.size, type: preview.type } : null,
      });
      if (!prepared.ok) throw new UserError(prepared.error);

      // 2. Upload straight to storage (the file's hash is already being computed above).
      const [contentHash] = await Promise.all([
        contentHashPromise,
        upload(prepared.file.uploadUrl, file),
        preview && prepared.preview ? upload(prepared.preview.uploadUrl, preview) : null,
      ]);

      // 3. The seller creates the escrow order with the price and the file's fingerprint.
      setStep('reserving');
      await sendEscrowAction(
        { type: 'create_order', dealId: prepared.dealId, amount: clpToUsdcUnits(priceClp), kind: 'digital', contentHash },
        wallet,
      );

      // 4. The server re-checks storage and the order, then saves the deal.
      setStep('publishing');
      const published = await publishSale({
        dealId: prepared.dealId,
        accessToken: await wallet.getAccessToken(),
        title: String(form.get('title') ?? ''),
        description: String(form.get('description') ?? ''),
        priceClp,
        filePath: prepared.file.path,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        contentHash,
        previewPath: prepared.preview?.path ?? null,
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
        <input name="title" required maxLength={120} placeholder="Ej: Beat trap 140 BPM con licencia" disabled={busy} />
      </label>

      <label className="field">
        <span>Descripción</span>
        <textarea name="description" rows={4} maxLength={2000} placeholder="Qué incluye, formato, para qué sirve" disabled={busy} />
      </label>

      <label className="field">
        <span>Precio</span>
        <input
          inputMode="numeric"
          required
          placeholder="$15.000"
          value={price && priceClp ? formatClp(priceClp) : price}
          onChange={(e) => setPrice(e.target.value)}
          disabled={busy}
        />
      </label>

      <label className="field">
        <span>Archivo que vendes</span>
        <input type="file" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} disabled={busy} />
        <small>
          {file ? `${file.name} · ${formatFileSize(file.size)}` : 'Hasta 50 MB. El comprador lo recibe solo después de pagar.'}
        </small>
      </label>

      <label className="field">
        <span>Vista previa (opcional)</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,audio/mpeg,audio/mp4,video/mp4,application/pdf"
          onChange={(e) => setPreview(e.target.files?.[0] ?? null)}
          disabled={busy}
        />
        <small>
          <strong>Cualquiera puede ver y descargar la vista previa.</strong> Sube solo una muestra: un trozo del audio, la imagen
          con marca de agua o la primera página. Nunca el archivo completo.
        </small>
      </label>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <button className="button button-primary" type="submit" disabled={busy || !file || priceClp < 1000}>
        {STEP_LABEL[step]}
      </button>
      <small className="muted">
        Tu plata queda protegida: el comprador paga antes de recibir el archivo y se te paga cuando confirma.
      </small>
    </form>
  );
}

async function sha256Hex(file: File): Promise<string> {
  // crypto.subtle only exists on HTTPS or localhost: test from a phone on the Vercel URL.
  if (!globalThis.crypto?.subtle) {
    throw new UserError('Abre Closeby desde su dirección segura (https) para publicar.');
  }
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function upload(url: string, file: File): Promise<void> {
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if (!response.ok) throw new UserError('No pudimos subir el archivo. Revisa tu conexión e intenta de nuevo.');
}

