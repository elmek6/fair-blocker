// Kozmetik AST -> generic (her sitede) + specific (hostname'e göre shard'lı)
// seçici haritaları. Content script bunları okuyup tek <style> ile enjekte eder.
//
// Basitleştirmeler (Faz 4):
//   - generic unhide (domainsiz #@#) generic setten çıkarılır
//   - domain-kapsamlı unhide ve specific excludedDomains şimdilik yok sayılır (sayılır)
//   - domainsiz ama excludedDomains'li hide -> generic (istisna yok sayılır)

import { COSMETIC_SHARD_COUNT, cosmeticShardOf } from '../../src/lib/hash';
import type { CosmeticRuleAst } from '../../src/lib/filterParser';

export interface CosmeticCompileResult {
  generic: string[];
  /** shard indeksi -> { hostname -> selector[] } */
  specificShards: Record<string, string[]>[];
  stats: {
    genericCount: number;
    specificDomainCount: number;
    ignoredDomainScopedUnhide: number;
  };
}

export function compileCosmetic(
  nodes: CosmeticRuleAst[],
): CosmeticCompileResult {
  const generic = new Set<string>();
  const genericUnhide = new Set<string>();
  const specific = new Map<string, Set<string>>(); // hostname -> selectors
  let ignoredDomainScopedUnhide = 0;

  for (const n of nodes) {
    const hasDomains = n.domains.length > 0;
    if (n.kind === 'cosmetic-hide') {
      if (!hasDomains) {
        generic.add(n.selector);
      } else {
        for (const d of n.domains) {
          const set = specific.get(d) ?? new Set<string>();
          set.add(n.selector);
          specific.set(d, set);
        }
      }
    } else {
      // unhide
      if (!hasDomains) genericUnhide.add(n.selector);
      else ignoredDomainScopedUnhide++;
    }
  }

  for (const sel of genericUnhide) generic.delete(sel);

  // Specific'i shard'la
  const specificShards: Record<string, string[]>[] = Array.from(
    { length: COSMETIC_SHARD_COUNT },
    () => ({}),
  );
  for (const [domain, sels] of specific) {
    const shard = specificShards[cosmeticShardOf(domain)];
    shard[domain] = [...sels];
  }

  return {
    generic: [...generic],
    specificShards,
    stats: {
      genericCount: generic.size,
      specificDomainCount: specific.size,
      ignoredDomainScopedUnhide,
    },
  };
}
