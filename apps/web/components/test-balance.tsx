'use client';

import { useCallback, useEffect, useState } from 'react';
import { addTestFunds, fetchBalance, type Balance } from '@/lib/balance';
import { formatClp } from '@/lib/format';
import { friendlyMessage } from '@/lib/user-error';
import { useWallet } from '@/lib/wallet';

/** "Tu saldo" card with the "Cargar saldo de prueba" button. Renders nothing when logged out. */
export function TestBalance() {
  const wallet = useWallet();
  const [balance, setBalance] = useState<Balance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setBalance(await fetchBalance(wallet));
      setError(null);
    } catch (err) {
      setError(friendlyMessage(err, 'No pudimos revisar tu saldo.'));
    }
  }, [wallet]);

  useEffect(() => {
    if (wallet.address) void refresh();
  }, [wallet.address, refresh]);

  if (!wallet.ready) return null;

  if (!wallet.address) {
    return (
      <section className="card stack">
        <small className="muted">Entra para ver tu saldo y comprar o vender.</small>
        <button type="button" className="button" onClick={() => wallet.login()}>
          Entrar
        </button>
      </section>
    );
  }

  async function topUp() {
    setLoading(true);
    setError(null);
    try {
      setBalance(await addTestFunds(wallet));
    } catch (err) {
      setError(friendlyMessage(err, 'No pudimos cargar tu saldo.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card stack">
      <div>
        <small className="muted">{wallet.label ? `Hola, ${wallet.label}. Tu saldo` : 'Tu saldo'}</small>
        <div>
          <strong>{balance ? formatClp(balance.balanceClp) : '…'}</strong>
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="button" onClick={topUp} disabled={loading}>
        {loading ? 'Cargando…' : 'Cargar saldo de prueba'}
      </button>
      <small className="muted">Plata de prueba para la demo. No es plata real.</small>
      <button type="button" className="link-button" onClick={() => wallet.logout()}>
        Salir
      </button>
    </section>
  );
}
