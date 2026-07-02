// document_start içerik script'i: bu site için geçerli kozmetik seçicileri
// (generic + specific) toplayıp TEK <style> ile display:none uygular.
// Whitelist/pause/genel-kapalı ya da kozmetik-kapalı ise hiçbir şey yapmaz.

import { getSettings } from '../../lib/storage';
import { shouldApplyOnSite, isYouTubeExempt } from '../../lib/siteMatch';
import { domainAndParents } from '../../lib/domainUtils';
import { cosmeticShardOf } from '../../lib/hash';

const STYLE_ID = 'fair-block-cosmetic';
const CHUNK = 2000; // tek CSS kuralındaki maksimum seçici sayısı

async function run(): Promise<void> {
  const hostname = location.hostname;
  if (!hostname) return;

  const settings = await getSettings();
  if (!settings.cosmeticEnabled) return;
  if (!shouldApplyOnSite(settings, hostname)) return;
  // YouTube: reklam kutusu gizleme anti-adblock tespitini tetikliyor — muaf.
  if (isYouTubeExempt(settings, hostname)) return;

  const selectors = new Set<string>();

  // Generic
  const generic = await fetchJson<string[]>('cosmetic/generic.json');
  if (generic) for (const s of generic) selectors.add(s);

  // Specific: hostname + üst alan adları; her aday kendi shard'ında olabilir
  const candidates = [hostname, ...domainAndParents(hostname)];
  const neededShards = new Set(candidates.map(cosmeticShardOf));
  const shardData = new Map<number, Record<string, string[]>>();
  await Promise.all(
    [...neededShards].map(async (shard) => {
      const data = await fetchJson<Record<string, string[]>>(
        `cosmetic/specific/${shard}.json`,
      );
      if (data) shardData.set(shard, data);
    }),
  );
  for (const domain of candidates) {
    const data = shardData.get(cosmeticShardOf(domain));
    const sels = data?.[domain];
    if (sels) for (const s of sels) selectors.add(s);
  }

  if (selectors.size === 0) return;
  injectStyle([...selectors]);
}

function injectStyle(selectors: string[]): void {
  const parts: string[] = [];
  for (let i = 0; i < selectors.length; i += CHUNK) {
    const chunk = selectors.slice(i, i + CHUNK).join(',\n');
    parts.push(`${chunk} { display: none !important; }`);
  }
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = parts.join('\n');
  (document.head || document.documentElement).appendChild(style);
}

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(chrome.runtime.getURL(path));
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

void run();
