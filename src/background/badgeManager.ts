// Tab başına engellenen istek sayacı + son eşleşme tamponu ("Bu Sayfa" paneli
// bunu okur) + ikon üzerine silik badge.
//
// Kaynak: chrome.declarativeNetRequest.onRuleMatchedDebug — YALNIZ "unpacked"
// uzantılarda çalışır (kişisel kullanımımıza uygun). Yoksa sessizce devre dışı.

import { extractHostname } from '../lib/domainUtils';
import type { PageMatch } from '../lib/messages';

const MAX_MATCHES_PER_TAB = 100;

const tabCounts = new Map<number, number>();
const tabMatches = new Map<number, PageMatch[]>();

export function getTabCount(tabId: number): number {
  return tabCounts.get(tabId) ?? 0;
}

export function getTabMatches(tabId: number): PageMatch[] {
  return tabMatches.get(tabId) ?? [];
}

export function resetTab(tabId: number): void {
  tabCounts.delete(tabId);
  tabMatches.delete(tabId);
  void updateBadge(tabId);
}

export function initBadgeManager(): void {
  const dnr = chrome.declarativeNetRequest;
  if (!dnr.onRuleMatchedDebug) {
    console.warn(
      '[fair-block] onRuleMatchedDebug yok (paketlenmiş kurulum?) — badge sayacı devre dışı.',
    );
    return;
  }

  dnr.onRuleMatchedDebug.addListener((info) => {
    const tabId = info.request.tabId;
    if (tabId < 0) return; // arka plan/servis isteği

    tabCounts.set(tabId, (tabCounts.get(tabId) ?? 0) + 1);

    const list = tabMatches.get(tabId) ?? [];
    list.push({
      url: info.request.url,
      domain: extractHostname(info.request.url) ?? info.request.url,
      rulesetId: info.rule.rulesetId,
      ruleId: info.rule.ruleId,
      type: info.request.type,
      ts: Date.now(),
    });
    if (list.length > MAX_MATCHES_PER_TAB) list.shift();
    tabMatches.set(tabId, list);

    void updateBadge(tabId);
  });

  // Ana çerçeve navigasyonunda sıfırla
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url !== undefined) resetTab(tabId);
  });
  chrome.tabs.onRemoved.addListener((tabId) => {
    tabCounts.delete(tabId);
    tabMatches.delete(tabId);
  });

  // Badge'i silik göster
  void chrome.action.setBadgeBackgroundColor({ color: '#3a3a3a' });
  if (chrome.action.setBadgeTextColor) {
    void chrome.action.setBadgeTextColor({ color: '#c8c8c8' });
  }
}

async function updateBadge(tabId: number): Promise<void> {
  const count = tabCounts.get(tabId) ?? 0;
  const text = count === 0 ? '' : count < 1000 ? String(count) : '999+';
  try {
    await chrome.action.setBadgeText({ tabId, text });
  } catch {
    // tab kapanmış olabilir
  }
}
