// TEK YAZICI: ayar durumunu DNR dynamic/session kurallarına çevirir.
// Toptan-değiştirme stratejisi: bizim tüm dynamic/session kurallarımızı silip
// istenen kümeyi yeniden ekler (listeler küçük olduğundan güvenli ve basit).
//
//   whitelist  -> kalıcı allowAllRequests (PRIORITY_USER_ALLOW)
//   pause      -> session allowAllRequests (PRIORITY_USER_PAUSE) [reconcileSession]
//   blacklist  -> kalıcı block (parse edilmiş)
//   globalOff  -> tek allowAllRequests ana override (PRIORITY_GLOBAL_OFF)

import { parseFilterList } from '../lib/filterParser';
import type { NetworkRuleAst } from '../lib/filterParser';
import { astToDnrRule } from '../lib/dnrRuleBuilder';
import type { DnrRule } from '../lib/dnrRuleBuilder';
import {
  PRIORITY_USER_ALLOW,
  PRIORITY_USER_PAUSE,
  PRIORITY_GLOBAL_OFF,
  PRIORITY_SITE_EXEMPT,
  ID_GLOBAL_OFF,
  ID_YT_EXEMPT,
  ID_BAND_WHITELIST,
  ID_BAND_BLACKLIST,
  MAX_DYNAMIC_RULES,
  MAX_SESSION_RULES,
  MAX_ENABLED_STATIC_RULESETS,
} from '../lib/constants';
import { whitelistRuleId, blacklistRuleId, pauseSessionRuleId } from '../lib/ruleIdAllocator';
import { YT_EXEMPT_DOMAINS } from '../lib/siteMatch';
import { loadListMeta, isListEnabled } from '../lib/listMeta';
import type { FairBlockSettings } from '../lib/types';

export class QuotaExceededError extends Error {}

/* ------------------------------------------------------------------ *
 * Kural üreticileri
 * ------------------------------------------------------------------ */
function allowAllOnDomain(id: number, domain: string, priority: number): DnrRule {
  return {
    id,
    priority,
    action: { type: 'allowAllRequests' },
    condition: { requestDomains: [domain], resourceTypes: ['main_frame', 'sub_frame'] },
  };
}

function globalOffRule(): DnrRule {
  // allowAllRequests koşulu yalnız main_frame/sub_frame içerebilir; url filtresi
  // gerekmez — resourceTypes tüm belgeleri eşler, böylece her sayfada her isteğe izin verir.
  return {
    id: ID_GLOBAL_OFF,
    priority: PRIORITY_GLOBAL_OFF,
    action: { type: 'allowAllRequests' },
    condition: { resourceTypes: ['main_frame', 'sub_frame'] },
  };
}

/* ------------------------------------------------------------------ *
 * İstenen kural kümeleri
 * ------------------------------------------------------------------ */
// YouTube muafiyeti: YT sayfalarındaki hiçbir isteği engelleme. Reklamın
// yüklenmesi + api/stats/ads vb. ping'lerin gitmesi anti-adblock tespitini
// önler; reklam player seviyesinde (adSpeedup) işlenir.
function ytExemptRule(): DnrRule {
  return {
    id: ID_YT_EXEMPT,
    priority: PRIORITY_SITE_EXEMPT,
    action: { type: 'allowAllRequests' },
    condition: {
      requestDomains: [...YT_EXEMPT_DOMAINS],
      resourceTypes: ['main_frame', 'sub_frame'],
    },
  };
}

export function desiredDynamicRules(s: FairBlockSettings): DnrRule[] {
  const rules: DnrRule[] = [];

  if (!s.globalEnabled) rules.push(globalOffRule());
  if (s.youtubeExempt) rules.push(ytExemptRule());

  s.whitelist.forEach((e, i) => {
    rules.push(allowAllOnDomain(whitelistRuleId(i), e.domain, PRIORITY_USER_ALLOW));
  });

  s.customBlacklist.forEach((e, i) => {
    const node = firstNetworkNode(e.rawFilterText);
    if (!node) return;
    const rule = astToDnrRule(node, blacklistRuleId(i));
    if (rule) rules.push(rule);
  });

  return rules;
}

export function desiredSessionRules(s: FairBlockSettings): DnrRule[] {
  const now = Date.now();
  const active = s.pauses.filter((p) => p.expiresAt === null || p.expiresAt > now);
  return active.map((p, i) =>
    allowAllOnDomain(pauseSessionRuleId(i), p.domain, PRIORITY_USER_PAUSE),
  );
}

/* ------------------------------------------------------------------ *
 * Uygulama (toptan değiştir)
 * ------------------------------------------------------------------ */
// Yalnız kendi bantlarını (whitelist/blacklist/global-off) yönetir; abonelik
// bandına dokunmaz (subscriptionUpdater onu ayrı yönetir).
function isManagedDynamicId(id: number): boolean {
  return (
    (id >= ID_BAND_WHITELIST.start && id <= ID_BAND_WHITELIST.end) ||
    (id >= ID_BAND_BLACKLIST.start && id <= ID_BAND_BLACKLIST.end) ||
    id === ID_GLOBAL_OFF ||
    id === ID_YT_EXEMPT
  );
}

export async function reconcileDynamic(s: FairBlockSettings): Promise<void> {
  const desired = desiredDynamicRules(s);
  const current = await chrome.declarativeNetRequest.getDynamicRules();
  const totalAfter =
    current.filter((r) => !isManagedDynamicId(r.id)).length + desired.length;
  if (totalAfter > MAX_DYNAMIC_RULES) {
    throw new QuotaExceededError(
      `Dynamic kural sayısı ${totalAfter} > kota ${MAX_DYNAMIC_RULES}.`,
    );
  }
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: current.filter((r) => isManagedDynamicId(r.id)).map((r) => r.id),
    addRules: desired as unknown as chrome.declarativeNetRequest.Rule[],
  });
}

export async function reconcileSession(s: FairBlockSettings): Promise<void> {
  const desired = desiredSessionRules(s);
  if (desired.length > MAX_SESSION_RULES) {
    throw new QuotaExceededError(
      `Session kural sayısı ${desired.length} > kota ${MAX_SESSION_RULES}.`,
    );
  }
  const current = await chrome.declarativeNetRequest.getSessionRules();
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: current.map((r) => r.id),
    addRules: desired as unknown as chrome.declarativeNetRequest.Rule[],
  });
}

// Statik ruleset'leri (curated listeler) kullanıcı toggle'larına göre etkinleştir.
// 50-aktif kotasını zorlar (aşımda QuotaExceededError -> UI'a).
export async function reconcileStaticRulesets(
  s: FairBlockSettings,
): Promise<void> {
  const meta = await loadListMeta();
  const desired = new Set<string>();
  for (const list of meta) {
    if (isListEnabled(list, s.sourceListToggles)) {
      for (const shardId of list.shardIds) desired.add(shardId);
    }
  }
  if (desired.size > MAX_ENABLED_STATIC_RULESETS) {
    throw new QuotaExceededError(
      `Aktif statik ruleset ${desired.size} > kota ${MAX_ENABLED_STATIC_RULESETS}. ` +
        `Bazı listeleri kapat.`,
    );
  }
  const current = new Set(await chrome.declarativeNetRequest.getEnabledRulesets());
  const enableRulesetIds = [...desired].filter((id) => !current.has(id));
  const disableRulesetIds = [...current].filter((id) => !desired.has(id));
  if (enableRulesetIds.length === 0 && disableRulesetIds.length === 0) return;
  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds,
    disableRulesetIds,
  });
}

export async function reconcileAll(s: FairBlockSettings): Promise<void> {
  await reconcileDynamic(s);
  await reconcileSession(s);
  await reconcileStaticRulesets(s);
}

/* ------------------------------------------------------------------ *
 * Yardımcı: ham filtre satırından ilk ağ kuralı
 * ------------------------------------------------------------------ */
export function firstNetworkNode(rawFilterText: string): NetworkRuleAst | null {
  const parsed = parseFilterList(rawFilterText, 'user-blacklist');
  const node = parsed.rules.find((r) => r.kind === 'network');
  return (node as NetworkRuleAst | undefined) ?? null;
}
