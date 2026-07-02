import { describe, it, expect } from 'vitest';
import { presetFor } from './fairAd';

describe('fair-ad presetFor', () => {
  it('seviye 0: tam engelleme, acceptable kapalı', () => {
    const p = presetFor(0);
    expect(p.sourceListToggles?.easylist).toBe(true);
    expect(p.sourceListToggles?.['acceptable-ads']).toBe(false);
    expect(p.cosmeticEnabled).toBe(true);
    expect(p.scriptletsEnabled).toBe(true);
  });

  it('seviye 1: acceptable-ads açık', () => {
    expect(presetFor(1).sourceListToggles?.['acceptable-ads']).toBe(true);
    expect(presetFor(1).sourceListToggles?.easylist).toBe(true);
  });

  it('seviye 2: reklam ağı bloğu kapalı, kozmetik/scriptlet açık', () => {
    const p = presetFor(2);
    expect(p.sourceListToggles?.easylist).toBe(false);
    expect(p.cosmeticEnabled).toBe(true);
    expect(p.scriptletsEnabled).toBe(true);
  });

  it('seviye 3: kozmetik ve scriptlet kapalı', () => {
    const p = presetFor(3);
    expect(p.cosmeticEnabled).toBe(false);
    expect(p.scriptletsEnabled).toBe(false);
  });
});
