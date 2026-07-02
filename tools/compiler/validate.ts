// Derlenmiş çıktının DNR kotalarına uygunluğunu denetler.
// Sert ihlal -> hata (build bozulur). Yumuşak risk -> uyarı.

import {
  MAX_REGEX_RULES_PER_RULESET,
  GUARANTEED_MIN_STATIC_RULES,
} from '../../src/lib/constants';
import type { Shard } from './networkRuleCompiler';
import type { RuleResource } from './rulesetManifestBuilder';

export interface ValidationReport {
  errors: string[];
  warnings: string[];
}

export function validate(
  shards: Shard[],
  ruleResources: RuleResource[],
): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Ruleset başına regex sert sınırı
  for (const shard of shards) {
    if (shard.regexCount > MAX_REGEX_RULES_PER_RULESET) {
      errors.push(
        `${shard.id}: ${shard.regexCount} regex kural > sınır ${MAX_REGEX_RULES_PER_RULESET}`,
      );
    }
    // Her regex/urlFilter kalıbı derlendiğinde < 2KB olmalı
    for (const rule of shard.rules) {
      const pat = rule.condition.regexFilter ?? rule.condition.urlFilter;
      if (pat && Buffer.byteLength(pat, 'utf8') >= 2048) {
        errors.push(`${shard.id}#${rule.id}: kalıp ≥ 2KB (${pat.slice(0, 40)}...)`);
      }
    }
  }

  // Varsayılan aktif rulesetlerdeki toplam kural, garanti minimuma yaklaşıyor mu?
  const enabledIds = new Set(
    ruleResources.filter((r) => r.enabled).map((r) => r.id),
  );
  const enabledRuleCount = shards
    .filter((s) => enabledIds.has(s.id))
    .reduce((sum, s) => sum + s.rules.length, 0);
  if (enabledRuleCount > GUARANTEED_MIN_STATIC_RULES * 0.9) {
    warnings.push(
      `Aktif statik kural sayısı ${enabledRuleCount}, garanti minimuma ` +
        `(${GUARANTEED_MIN_STATIC_RULES}) yaklaşıyor — bu noktadan sonra ` +
        `aktivasyon paylaşımlı 300k global havuza bağımlı olabilir (rakip ` +
        `blocker'lar kuruluysa risk). Bkz. Faz 7.`,
    );
  }

  return { errors, warnings };
}
