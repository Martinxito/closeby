import { beforeAll, describe, expect, it } from 'vitest';
import { signMockToken, verifyMockToken } from './mock-token';

const ADDRESS = 'B'.repeat(44);

beforeAll(() => {
  process.env.MOCK_AUTH_SECRET = 'test-secret';
});

describe('mock session tokens', () => {
  it('round-trips a signed token', () => {
    expect(verifyMockToken(signMockToken(ADDRESS))).toBe(ADDRESS);
  });

  it('rejects a bare address (addresses are public, they prove nothing)', () => {
    expect(verifyMockToken(ADDRESS)).toBeNull();
  });

  it('rejects a token whose address was swapped', () => {
    const [, mac] = signMockToken(ADDRESS).split('.');
    expect(verifyMockToken(`${'S'.repeat(44)}.${mac}`)).toBeNull();
  });

  it('rejects a token signed with another secret', () => {
    const token = signMockToken(ADDRESS);
    process.env.MOCK_AUTH_SECRET = 'other-secret';
    expect(verifyMockToken(token)).toBeNull();
    process.env.MOCK_AUTH_SECRET = 'test-secret';
  });
});
