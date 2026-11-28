// Turns a failed transaction into the program's error name (`NotBuyer`, `InvalidStatus`…),
// the same codes the web already maps to Spanish messages (apps/web/lib/escrow/types.ts).

import { IDL } from './program';

// The IDL's generated types spell names in camelCase (`notBuyer`); Anchor's logs and the
// web use PascalCase (`NotBuyer`). Normalize to PascalCase.
const pascal = (name: string) => name.charAt(0).toUpperCase() + name.slice(1);
const NAMES_BY_CODE = new Map<number, string>(IDL.errors.map((e) => [e.code, pascal(e.name)]));
const NAMES = new Set<string>(NAMES_BY_CODE.values());

/**
 * The escrow error name behind `error`, or null if it is not one of ours (network,
 * expired blockhash, missing funds…). Works with simulation errors (Anchor logs
 * "Error Code: NotBuyer") and with confirmed failures (`{"Custom":6004}`), including the
 * web relay's `RelayError`, whose message carries the failure as JSON.
 */
export function escrowErrorName(error: unknown): string | null {
  const err = error as { message?: unknown; logs?: unknown; transactionLogs?: unknown } | null;
  const logs = [err?.logs, err?.transactionLogs].flatMap((l) => (Array.isArray(l) ? l : []));
  const text = [String(err?.message ?? error), ...logs].join('\n');

  const named = /Error Code: (\w+)/.exec(text)?.[1];
  if (named && NAMES.has(named)) return named;

  const custom = /"Custom":\s*(\d+)/.exec(text)?.[1];
  return custom ? (NAMES_BY_CODE.get(Number(custom)) ?? null) : null;
}
