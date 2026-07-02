// Service worker giriş noktası. Dinleyicileri en üst seviyede (senkron) kaydeder
// ki MV3 SW uyandığında olayları kaçırmasın.

import { initBadgeManager } from './badgeManager';
import { initMessageRouter } from './messageRouter';
import { initPauseScheduler } from './pauseScheduler';
import { initScriptletInjector } from './scriptletInjector';
import { initSubscriptionAlarms } from './subscriptionUpdater';
import { getSettings, setSettings } from '../lib/storage';
import { reconcileDynamic, reconcileSession, reconcileStaticRulesets } from './ruleReconciler';

initBadgeManager();
initMessageRouter();
initPauseScheduler();
initScriptletInjector();
initSubscriptionAlarms();

// Kurulum: varsayılanları tohumla + kuralları senkronla.
chrome.runtime.onInstalled.addListener(() => {
  void (async () => {
    const s = await getSettings();
    await setSettings(s);
    await reconcileDynamic(s);
    await reconcileSession(s);
    await reconcileStaticRulesets(s);
  })();
});

// Tarayıcı başlangıcı: session kuralları temizlendiği için duraklatmaları da
// temizle (pause doğal olarak restart'ta biter), sonra senkronla.
chrome.runtime.onStartup.addListener(() => {
  void (async () => {
    const s = await getSettings();
    const next = { ...s, pauses: [] };
    await setSettings(next);
    await reconcileDynamic(next);
    await reconcileSession(next);
    await reconcileStaticRulesets(next);
  })();
});
