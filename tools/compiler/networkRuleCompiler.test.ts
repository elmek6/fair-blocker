import { describe, it, expect } from 'vitest';
import { parseFilterList } from '../../src/lib/filterParser';
import type { NetworkRuleAst } from '../../src/lib/filterParser';
import { compileNetworkRules } from './networkRuleCompiler';

function nodes(text: string): NetworkRuleAst[] {
  return parseFilterList(text, 't').rules.filter(
    (r): r is NetworkRuleAst => r.kind === 'network',
  );
}

describe('compileNetworkRules toplama', () => {
  it('aynı imzalı düz domainler tek requestDomains kuralında birleşir', () => {
    const { shards, stats } = compileNetworkRules(
      nodes('||a.com^\n||b.com^\n||c.com^'),
      'test',
    );
    expect(stats.plainDomainRules).toBe(3);
    expect(stats.batchedRules).toBe(1);
    const rule = shards[0].rules[0];
    expect(rule.condition.requestDomains).toEqual(['a.com', 'b.com', 'c.com']);
  });

  it('farklı imza (third-party) ayrı kurala düşer', () => {
    const { stats } = compileNetworkRules(
      nodes('||a.com^\n||b.com^$third-party'),
      'test',
    );
    expect(stats.plainDomainRules).toBe(2);
    expect(stats.batchedRules).toBe(2);
  });

  it('path içeren kural urlFilter olarak ayrı sayılır', () => {
    const { stats } = compileNetworkRules(nodes('||a.com/ads/x.js'), 'test');
    expect(stats.urlFilterRules).toBe(1);
    expect(stats.batchedRules).toBe(0);
  });
});
