// Popup/options'tan gelen tüm mesajları karşılar. Tek yazıcı kapısı: durum
// değişiklikleri buradan storage'a yazılır ve (Faz 3+) ruleReconciler'a iletilir.

import { getSettings, patchSettings } from '../lib/storage';
import { extractHostname } from '../lib/domainUtils';
import { ok, err } from '../lib/messages';
import type { Message, Response, SiteState } from '../lib/messages';
import { isWhitelisted, isPaused, pauseExpiry } from '../lib/siteMatch';
import { getTabCount, getTabMatches } from './badgeManager';
import { applyActionMessage } from './actions';
import { reconcileDynamic, reconcileSession } from './ruleReconciler';

export function initMessageRouter(): void {
  chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
    handle(msg)
      .then(sendResponse)
      .catch((e) => sendResponse(err(e instanceof Error ? e.message : String(e))));
    return true; // asenkron yanıt
  });
}

async function handle(msg: Message): Promise<Response<unknown>> {
  switch (msg.type) {
    case 'GET_SETTINGS':
      return ok(await getSettings());

    case 'PATCH_SETTINGS': {
      const next = await patchSettings(msg.patch);
      // globalEnabled gibi alanlar DNR durumunu etkiler -> senkronla.
      await reconcileDynamic(next);
      await reconcileSession(next);
      return ok(next);
    }

    case 'GET_SITE_STATE':
      return ok(await getSiteState(msg.tabId, msg.url));

    case 'GET_PAGE_MATCHES':
      return ok(getTabMatches(msg.tabId));

    default:
      // Eylem mesajları (pause, whitelist, blacklist, abonelik, scriptlet...)
      return applyActionMessage(msg);
  }
}

async function getSiteState(tabId: number, url: string): Promise<SiteState> {
  const settings = await getSettings();
  const hostname = extractHostname(url) ?? '';
  return {
    hostname,
    isWhitelisted: isWhitelisted(settings, hostname),
    isPaused: isPaused(settings, hostname),
    pauseExpiresAt: pauseExpiry(settings, hostname),
    blockedCount: getTabCount(tabId),
    globalEnabled: settings.globalEnabled,
    cosmeticEnabled: settings.cosmeticEnabled,
  };
}
