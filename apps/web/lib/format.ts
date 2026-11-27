// Safe to import from both server and client code.
const clp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });

export function formatClp(amount: number): string {
  return clp.format(amount);
}

/** Fixed demo rate (docs/product.md). The program holds USDC; users only ever see CLP. */
export const CLP_PER_USDC = 950;
const USDC_UNITS = 1_000_000; // USDC has 6 decimals

/** CLP price → USDC base units, the `amount` stored in the on-chain order. */
export function clpToUsdcUnits(priceClp: number): number {
  return Math.round((priceClp / CLP_PER_USDC) * USDC_UNITS);
}

/** Human file size in Spanish, e.g. "3,2 MB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toLocaleString('es-CL', { maximumFractionDigits: 1 })} ${units[unit]}`;
}
