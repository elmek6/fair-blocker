// Compiler'ın ürettiği listMeta.json (dist/meta/listMeta.json) tipi + yükleyici.
// Hem background (reconcileStaticRulesets) hem options Filters sekmesi kullanır.

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

let cache: ListMetaEntry[] | null = null;

export async function loadListMeta(): Promise<ListMetaEntry[]> {
  if (cache) return cache;
  try {
    const res = await fetch(chrome.runtime.getURL('meta/listMeta.json'));
    cache = res.ok ? ((await res.json()) as ListMetaEntry[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

// Bir listenin efektif aktiflik durumu: kullanıcı override'ı yoksa defaultEnabled.
export function isListEnabled(
  meta: ListMetaEntry,
  toggles: Record<string, boolean>,
): boolean {
  return toggles[meta.id] ?? meta.defaultEnabled;
}
