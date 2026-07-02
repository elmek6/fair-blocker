import { describe, it, expect } from 'vitest';
import { parseFilterList } from '../../src/lib/filterParser';
import type { ScriptletRuleAst } from '../../src/lib/filterParser';
import { compileScriptlets } from './scriptletCompiler';

function scriptletNodes(text: string): ScriptletRuleAst[] {
  return parseFilterList(text, 't').rules.filter(
    (r): r is ScriptletRuleAst => r.kind === 'scriptlet',
  );
}

describe('compileScriptlets', () => {
  it('tanınan scriptlet registry\'ye girer, bilinmeyen ve istisna atlanır', () => {
    const res = compileScriptlets(
      scriptletNodes(
        'example.com##+js(set-constant, x, true)\n' +
          'foo.com##+js(bilinmeyen-scriptlet)\n' +
          'bar.com#@#+js(set-constant, y, 1)',
      ),
    );
    expect(res.stats.resolved).toBe(1);
    expect(res.stats.unknownSkipped).toBe(1);
    expect(res.stats.exceptionsSkipped).toBe(1);
    expect(res.registry['example.com']).toEqual([
      { i: 'set-constant', a: ['x', 'true'] },
    ]);
  });

  it('alias (aopr) katalog id\'sine çözülür', () => {
    const res = compileScriptlets(scriptletNodes('a.com##+js(aopr, foo)'));
    expect(res.registry['a.com'][0].i).toBe('abort-on-property-read');
  });
});
