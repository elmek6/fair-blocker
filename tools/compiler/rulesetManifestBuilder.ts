// Shard'lardan manifest'in `declarative_net_request.rule_resources` dizisini ve
// UI için liste metadata'sını üretir; DNR ruleset kotalarını (100 toplam / 50 aktif)
// zorlar. Kota aşılırsa build'i throw ile bozar.

import { MAX_STATIC_RULESETS, MAX_ENABLED_STATIC_RULESETS } from '../../src/lib/constants';

export interface RuleResource {
  id: string;
  enabled: boolean;
  path: string; // dist köküne göre (public/rulesets -> rulesets/...)
}

export interface ListMetaEntry {
  id: string;
  name: string;
  category: string;
  sourceUrl: string;
  license: string;
  fetchedAt: string;
  ruleCount: number;
  shardIds: string[];
  defaultEnabled: boolean;
}

export interface BuiltManifest {
  ruleResources: RuleResource[];
  listMeta: ListMetaEntry[];
}

export interface ListBuildInput {
  id: string;
  name: string;
  category: string;
  sourceUrl: string;
  license: string;
  fetchedAt: string;
  defaultEnabled: boolean;
  shardIds: string[];
  ruleCount: number;
}

export function buildRulesetManifest(lists: ListBuildInput[]): BuiltManifest {
  const ruleResources: RuleResource[] = [];
  const listMeta: ListMetaEntry[] = [];

  for (const list of lists) {
    for (const shardId of list.shardIds) {
      ruleResources.push({
        id: shardId,
        enabled: list.defaultEnabled,
        path: `rulesets/${shardId}.json`,
      });
    }
    listMeta.push({
      id: list.id,
      name: list.name,
      category: list.category,
      sourceUrl: list.sourceUrl,
      license: list.license,
      fetchedAt: list.fetchedAt,
      ruleCount: list.ruleCount,
      shardIds: list.shardIds,
      defaultEnabled: list.defaultEnabled,
    });
  }

  // Kota zorlaması
  if (ruleResources.length > MAX_STATIC_RULESETS) {
    throw new Error(
      `Toplam statik ruleset ${ruleResources.length} > sınır ${MAX_STATIC_RULESETS}. ` +
        `Liste sayısını azalt veya shard'ları birleştir.`,
    );
  }
  const enabledCount = ruleResources.filter((r) => r.enabled).length;
  if (enabledCount > MAX_ENABLED_STATIC_RULESETS) {
    throw new Error(
      `Varsayılan aktif ruleset ${enabledCount} > sınır ${MAX_ENABLED_STATIC_RULESETS}. ` +
        `Bazı listelerin defaultEnabled değerini false yap.`,
    );
  }

  return { ruleResources, listMeta };
}
