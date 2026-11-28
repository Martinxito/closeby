import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetPendingPlace, placeHash, rememberPendingPlace, savePendingPlace } from './meeting';
import type { Wallet } from './wallet/types';

const DEAL = '123';
const PLACE = 'Metro Los Leones, Providencia';
const wallet = { getAccessToken: async () => 'token' } as unknown as Wallet;

// The browser's localStorage, which Node does not have.
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
    clear: () => data.clear(),
    key: (i) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
}

describe('savePendingPlace (place kept in the browser until the server has it)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ venue: PLACE })));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('saves the kept place when it matches the on-chain hash, then forgets it', async () => {
    rememberPendingPlace(DEAL, `  ${PLACE}  `);
    expect(await savePendingPlace(DEAL, await placeHash(PLACE), wallet)).toBe(PLACE);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`/api/deals/${DEAL}/meeting`);
    expect(JSON.parse(init.body)).toEqual({ venue: PLACE });

    // Forgotten: a second call has nothing to save.
    expect(await savePendingPlace(DEAL, await placeHash(PLACE), wallet)).toBeNull();
  });

  it('drops a kept place that does not match the order (an attempt that never went through)', async () => {
    rememberPendingPlace(DEAL, 'Otro lugar');
    expect(await savePendingPlace(DEAL, await placeHash(PLACE), wallet)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(`closeby:pending-place:${DEAL}`)).toBeNull();
  });

  it('does nothing when this browser has no place for the deal', async () => {
    expect(await savePendingPlace(DEAL, await placeHash(PLACE), wallet)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the place if the server refuses, so it can be retried', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'No pudimos guardar el lugar.' } })));
    rememberPendingPlace(DEAL, PLACE);
    await expect(savePendingPlace(DEAL, await placeHash(PLACE), wallet)).rejects.toThrow('No pudimos guardar el lugar.');
    expect(localStorage.getItem(`closeby:pending-place:${DEAL}`)).toBe(PLACE);
    forgetPendingPlace(DEAL);
  });

  it('works without storage (private mode): nothing kept, nothing to retry', async () => {
    vi.stubGlobal('localStorage', undefined);
    expect(() => rememberPendingPlace(DEAL, PLACE)).not.toThrow();
    expect(await savePendingPlace(DEAL, await placeHash(PLACE), wallet)).toBeNull();
  });
});
