// Navigasyonda, o hostname için geçerli scriptlet'leri MAIN world'e enjekte eder.
// Yaklaşım: webNavigation.onCommitted -> registry'den uygulanabilir çağrıları bul
// -> aktif toggle + whitelist/pause kontrolü -> chrome.scripting.executeScript
// ({world:'MAIN', func: katalogFn, args}). executeScript fonksiyon kaynağını
// serialize edip sayfada çalıştırır (uzaktan kod değil — paketteki kod).
//
// Not: onCommitted document_start'tan biraz sonra olabilir; kişisel araç için kabul
// edilebilir. Katalog küçük ve isteğe bağlı.

import { getSettings } from '../lib/storage';
import { extractHostname, domainAndParents } from '../lib/domainUtils';
import { shouldApplyOnSite } from '../lib/siteMatch';
import { SCRIPTLETS } from '../content/scriptlets/catalog/index';

interface ScriptletInvocation {
  i: string;
  a: string[];
}

let registryCache: Record<string, ScriptletInvocation[]> | null = null;

async function getRegistry(): Promise<Record<string, ScriptletInvocation[]>> {
  if (registryCache) return registryCache;
  try {
    const res = await fetch(chrome.runtime.getURL('scriptlets/registry.json'));
    registryCache = res.ok ? ((await res.json()) as Record<string, ScriptletInvocation[]>) : {};
  } catch {
    registryCache = {};
  }
  return registryCache;
}

export function initScriptletInjector(): void {
  if (!chrome.webNavigation) return;
  chrome.webNavigation.onCommitted.addListener((details) => {
    if (!/^https?:/.test(details.url)) return;
    void injectFor(details.tabId, details.frameId, details.url);
  });
}

async function injectFor(
  tabId: number,
  frameId: number,
  url: string,
): Promise<void> {
  const hostname = extractHostname(url);
  if (!hostname) return;

  const settings = await getSettings();
  if (!settings.scriptletsEnabled) return;
  if (!shouldApplyOnSite(settings, hostname)) return;

  const registry = await getRegistry();
  const candidates = [hostname, ...domainAndParents(hostname), '*'];
  const enabled = settings.scriptletSettings.scriptletEnabled;

  const seen = new Set<string>();
  for (const domain of candidates) {
    const invocations = registry[domain];
    if (!invocations) continue;
    for (const inv of invocations) {
      const key = `${inv.i}:${inv.a.join(',')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (enabled[inv.i] === false) continue; // varsayılan açık
      const fn = SCRIPTLETS[inv.i];
      if (!fn) continue;
      try {
        await chrome.scripting.executeScript({
          target: { tabId, frameIds: [frameId] },
          world: 'MAIN',
          injectImmediately: true,
          func: fn,
          args: [inv.a],
        });
      } catch {
        // kısıtlı sayfa / yarış — sessiz geç
      }
    }
  }
}
