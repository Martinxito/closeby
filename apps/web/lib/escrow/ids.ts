// Safe to import from server and client code.

/** A random u64 order_id as a digit string (the public deal ID in /deals/[dealId]). */
export function newOrderId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let id = 0n;
  for (const b of bytes) id = (id << 8n) | BigInt(b);
  // Avoid 0 so the ID is never confused with "no order".
  return (id === 0n ? 1n : id).toString();
}

/** Seconds since the Unix epoch, the unit the program uses for deadlines. */
export function nowSecs(): number {
  return Math.floor(Date.now() / 1000);
}
