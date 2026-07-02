import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS } from './types';
import { isWhitelisted, isPaused, shouldApplyOnSite } from './siteMatch';

const base = DEFAULT_SETTINGS;

describe('isWhitelisted', () => {
  it('alt alan adını da kapsar', () => {
    const s = { ...base, whitelist: [{ domain: 'example.com', addedAt: 0 }] };
    expect(isWhitelisted(s, 'example.com')).toBe(true);
    expect(isWhitelisted(s, 'sub.example.com')).toBe(true);
    expect(isWhitelisted(s, 'other.com')).toBe(false);
  });
});

describe('isPaused', () => {
  it('süresiz ve gelecekteki pause aktif, geçmiş değil', () => {
    const s = {
      ...base,
      pauses: [
        { domain: 'a.com', expiresAt: null },
        { domain: 'b.com', expiresAt: Date.now() + 100000 },
        { domain: 'c.com', expiresAt: Date.now() - 100000 },
      ],
    };
    expect(isPaused(s, 'a.com')).toBe(true);
    expect(isPaused(s, 'sub.b.com')).toBe(true);
    expect(isPaused(s, 'c.com')).toBe(false);
  });
});

describe('shouldApplyOnSite', () => {
  it('global kapalı veya whitelist/pause ise uygulanmaz', () => {
    expect(shouldApplyOnSite({ ...base, globalEnabled: false }, 'x.com')).toBe(false);
    expect(
      shouldApplyOnSite({ ...base, whitelist: [{ domain: 'x.com', addedAt: 0 }] }, 'x.com'),
    ).toBe(false);
    expect(shouldApplyOnSite(base, 'x.com')).toBe(true);
  });
});
