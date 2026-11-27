'use client';

import { Buffer } from 'buffer';
import { toDataURL } from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { Connection, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const memoProgram = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const memo = 'Closeby:devnet-signing';
const storageKey = 'closeby:devnet-signing';

type Receipt = { signature: string; signer: string; lastValidBlockHeight: number };
type Status = 'idle' | 'signing' | 'submitted' | 'confirmed' | 'failed' | 'cancelled';

type Phantom = {
  isPhantom: boolean;
  connect(): Promise<{ publicKey: PublicKey }>;
  signAndSendTransaction(transaction: Transaction): Promise<{ signature: string }>;
};

function phantom() {
  const provider = (window as Window & { phantom?: { solana?: Phantom } }).phantom?.solana;
  return provider?.isPhantom ? provider : undefined;
}

const statusCopy: Record<Status, string> = {
  idle: '',
  signing: 'Esperando tu aprobación en Phantom…',
  submitted: 'Enviada. Buscando confirmación en Devnet…',
  confirmed: 'Firma de prueba confirmada en Devnet.',
  failed: 'La prueba falló. Puedes volver a intentarlo.',
  cancelled: 'Cancelaste la solicitud en Phantom.',
};

export default function DevnetSigning() {
  const [status, setStatus] = useState<Status>('idle');
  const [receipt, setReceipt] = useState<Receipt>();
  const [wallet, setWallet] = useState<Phantom>();
  const [dealUrl, setDealUrl] = useState<string>();
  const [qrUrl, setQrUrl] = useState<string>();
  const [copied, setCopied] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    setWallet(phantom());
    if (window.location.protocol === 'https:') {
      const url = window.location.origin + window.location.pathname;
      setDealUrl(url);
      void toDataURL(url, { width: 192 }).then(setQrUrl).catch(() => {});
    }
    const saved = sessionStorage.getItem(storageKey);
    if (saved) {
      busy.current = true;
      setReceipt(JSON.parse(saved) as Receipt);
      setStatus('submitted');
    }
  }, []);

  useEffect(() => {
    if (!receipt || status !== 'submitted') return;

    let stopped = false;
    let checking = false;

    async function check(current: Receipt) {
      if (checking || stopped) return;
      checking = true;
      try {
        const transaction = await connection.getParsedTransaction(current.signature, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0,
        });

        if (stopped) return;
        if (transaction) {
          const { instructions, accountKeys } = transaction.transaction.message;
          const [instruction] = instructions;
          const verified = transaction.meta?.err === null
            && instructions.length === 1
            && instruction.programId.equals(memoProgram)
            && 'parsed' in instruction
            && instruction.parsed === memo
            && accountKeys[0]?.signer
            && accountKeys[0].pubkey.toBase58() === current.signer;
          if (verified) {
            setStatus('confirmed');
            return;
          }
        } else {
          const height = await connection.getBlockHeight('confirmed');
          if (stopped || height <= current.lastValidBlockHeight) return;
          const { value: [found] } = await connection.getSignatureStatuses(
            [current.signature],
            { searchTransactionHistory: true },
          );
          if (stopped || (found && !found.err)) return;
        }

        sessionStorage.removeItem(storageKey);
        busy.current = false;
        setStatus('failed');
      } catch {
        // Keep checking after a transient RPC failure or a wallet browser resume.
      } finally {
        checking = false;
      }
    }

    const refresh = () => { void check(receipt); };
    refresh();
    const timer = window.setInterval(refresh, 3_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [receipt, status]);

  async function copyLink() {
    if (!dealUrl) return;
    try {
      await navigator.clipboard.writeText(dealUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const browseUrl = dealUrl
    ? `https://phantom.app/ul/browse/${encodeURIComponent(dealUrl)}?ref=${encodeURIComponent(new URL(dealUrl).origin)}`
    : undefined;

  async function sign() {
    if (!wallet || busy.current) return;
    busy.current = true;
    setStatus('signing');

    try {
      const { publicKey } = await wallet.connect();
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      const transaction = new Transaction({ feePayer: publicKey, blockhash, lastValidBlockHeight });
      transaction.add(new TransactionInstruction({
        programId: memoProgram,
        keys: [],
        data: Buffer.from(memo, 'utf8'),
      }));
      const { signature } = await wallet.signAndSendTransaction(transaction);
      const submitted = { signature, signer: publicKey.toBase58(), lastValidBlockHeight };
      sessionStorage.setItem(storageKey, JSON.stringify(submitted));
      setReceipt(submitted);
      setStatus('submitted');
    } catch (error) {
      busy.current = false;
      const cancelled = typeof error === 'object' && error !== null && 'code' in error && error.code === 4001;
      setStatus(cancelled ? 'cancelled' : 'failed');
    }
  }

  return (
    <section className="signing-panel" aria-label="Firma de prueba en Devnet">
      <p>Activa Devnet en Phantom. La prueba usa SOL de prueba para pagar la comisión.</p>
      {wallet ? (
        <button className="button button-primary" type="button" onClick={sign} disabled={status === 'signing' || status === 'submitted' || status === 'confirmed'}>
          Firmar prueba en Phantom
        </button>
      ) : browseUrl ? (
        <a className="button button-primary" href={browseUrl}>Abrir este trato en Phantom <span aria-hidden="true">↗</span></a>
      ) : (
        <p>Abre el enlace HTTPS de este trato en el navegador de Phantom.</p>
      )}
      <p role="status">{statusCopy[status]}</p>
      {dealUrl && (
        <div className="deal-share">
          <label>
            Enlace del trato
            <input value={dealUrl} readOnly onFocus={(event) => event.currentTarget.select()} />
          </label>
          <button className="button" type="button" onClick={copyLink}>{copied ? 'Enlace copiado' : 'Copiar enlace'}</button>
          {qrUrl && <img src={qrUrl} alt="Código QR del enlace del trato" width={192} height={192} />}
        </div>
      )}
      {status === 'confirmed' && receipt && (
        <a href={`https://explorer.solana.com/tx/${receipt.signature}?cluster=devnet`}>
          Ver firma en Solana Explorer
        </a>
      )}
    </section>
  );
}
