// Safe to import from both server and client code.
const clp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });

export function formatClp(amount: number): string {
  return clp.format(amount);
}
