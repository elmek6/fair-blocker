import { describe, it, expect } from 'vitest';
import { parseFilterList } from './filterParser';
import type {
  NetworkRuleAst,
  CosmeticRuleAst,
  ScriptletRuleAst,
} from './filterParser';

describe('parseFilterList', () => {
  it('yorum ve metadata satırlarını atlar, meta yakalar', () => {
    const r = parseFilterList(
      '! Title: Test List\n! Version: 42\n! comment\n[Adblock Plus 2.0]',
      't',
    );
    expect(r.rules).toHaveLength(0);
    expect(r.meta.title).toBe('Test List');
    expect(r.meta.version).toBe('42');
  });

  it('kozmetik hide/unhide ayrıştırır', () => {
    const r = parseFilterList('example.com,~sub.example.com##.ad\n#@#.keep', 't');
    const hide = r.rules[0] as CosmeticRuleAst;
    expect(hide.kind).toBe('cosmetic-hide');
    expect(hide.domains).toEqual(['example.com']);
    expect(hide.excludedDomains).toEqual(['sub.example.com']);
    expect(hide.selector).toBe('.ad');
    const unhide = r.rules[1] as CosmeticRuleAst;
    expect(unhide.kind).toBe('cosmetic-unhide');
    expect(unhide.domains).toEqual([]); // generic unhide
  });

  it('scriptlet enjeksiyonunu ayrıştırır', () => {
    const r = parseFilterList('example.com##+js(set-constant, adBlock, false)', 't');
    const s = r.rules[0] as ScriptletRuleAst;
    expect(s.kind).toBe('scriptlet');
    expect(s.name).toBe('set-constant');
    expect(s.args).toEqual(['adBlock', 'false']);
    expect(s.domains).toEqual(['example.com']);
  });

  it('prosedürel kozmetik seçiciyi desteklenmeyen sayar', () => {
    const r = parseFilterList('example.com##.box:has-text(reklam)', 't');
    expect(r.rules).toHaveLength(0);
    expect(r.unsupported).toHaveLength(1);
  });

  it('desteklenmeyen modifier içeren ağ kuralını atlar', () => {
    const r = parseFilterList('||example.com^$removeparam=utm_source', 't');
    expect(r.rules).toHaveLength(0);
    expect(r.unsupported[0].reason).toContain('removeparam');
  });

  it('ağ kuralı anchor ve plainHost hesaplar', () => {
    const r = parseFilterList('||ads.example.com^', 't');
    const n = r.rules[0] as NetworkRuleAst;
    expect(n.startAnchor).toBe('domain');
    expect(n.plainHost).toBe('ads.example.com');
    expect(n.isException).toBe(false);
  });
});
