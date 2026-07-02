import { describe, it, expect } from 'vitest';
import { parseFilterList } from '../../src/lib/filterParser';
import type { CosmeticRuleAst } from '../../src/lib/filterParser';
import { compileCosmetic } from './cosmeticCompiler';
import { cosmeticShardOf } from '../../src/lib/hash';

function cosmeticNodes(text: string): CosmeticRuleAst[] {
  return parseFilterList(text, 't').rules.filter(
    (r): r is CosmeticRuleAst =>
      r.kind === 'cosmetic-hide' || r.kind === 'cosmetic-unhide',
  );
}

describe('compileCosmetic', () => {
  it('generic ve specific ayrımı + unhide çıkarma', () => {
    const res = compileCosmetic(
      cosmeticNodes('##.generic\nexample.com##.specific\n#@#.generic'),
    );
    // generic unhide '.generic'i siler
    expect(res.generic).not.toContain('.generic');
    // specific example.com kendi shard'ında
    const shard = res.specificShards[cosmeticShardOf('example.com')];
    expect(shard['example.com']).toEqual(['.specific']);
  });
});
