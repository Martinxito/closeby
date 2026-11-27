'use client';

import { useState } from 'react';

export function ShareActions({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (e.g. http on a phone): the link is visible to copy by hand.
    }
  }

  async function share() {
    try {
      await navigator.share({ title, text: `Te comparto "${title}" con pago protegido en Closeby`, url });
    } catch {
      // The user closed the share sheet.
    }
  }

  return (
    <div className="stack">
      <input className="link-box" readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Link de tu venta" />
      <button type="button" className="button" onClick={copy}>
        {copied ? '¡Link copiado!' : 'Copiar link'}
      </button>
      {canShare && (
        <button type="button" className="button secondary" onClick={share}>
          Compartir por WhatsApp u otra app
        </button>
      )}
    </div>
  );
}
