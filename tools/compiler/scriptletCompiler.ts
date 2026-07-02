// Scriptlet AST (##+js(name,args)) -> hostname'e göre registry. Yalnız el-yazımı
// katalogda TANINAN isimler tutulur; gerisi atlanır (uBO'nun geniş kataloğu
// port edilmiyor — kasıtlı). İstisnalar (#@#+js) da atlanır.

import { resolveScriptletId } from '../../src/content/scriptlets/catalog/index';
import type { ScriptletRuleAst } from '../../src/lib/filterParser';

export interface ScriptletInvocation {
  i: string; // katalog scriptlet id
  a: string[]; // argümanlar
}

export interface ScriptletCompileResult {
  /** domain (veya '*') -> uygulanacak scriptlet çağrıları */
  registry: Record<string, ScriptletInvocation[]>;
  stats: {
    total: number;
    resolved: number;
    unknownSkipped: number;
    exceptionsSkipped: number;
  };
}

export function compileScriptlets(
  nodes: ScriptletRuleAst[],
): ScriptletCompileResult {
  const registry: Record<string, ScriptletInvocation[]> = {};
  const stats = { total: nodes.length, resolved: 0, unknownSkipped: 0, exceptionsSkipped: 0 };

  for (const n of nodes) {
    if (n.isException) {
      stats.exceptionsSkipped++;
      continue;
    }
    const id = resolveScriptletId(n.name);
    if (!id) {
      stats.unknownSkipped++;
      continue;
    }
    const domains = n.domains.length > 0 ? n.domains : ['*'];
    for (const d of domains) {
      (registry[d] ??= []).push({ i: id, a: n.args });
    }
    stats.resolved++;
  }

  return { registry, stats };
}
