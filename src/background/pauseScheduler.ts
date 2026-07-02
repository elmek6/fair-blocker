// Süreli duraklatmaları chrome.alarms ile zamanında kaldırır. Session kuralı
// zaten tarayıcı yeniden başlayınca temizlenir (güvenlik ağı); alarm ise süre
// dolunca popup'ın "duraklatma bitti" durumunu anında yansıtmasını sağlar.

import { getSettings, setSettings } from '../lib/storage';
import { reconcileSession } from './ruleReconciler';

const PREFIX = 'unpause:';

export function scheduleUnpause(domain: string, expiresAt: number): void {
  void chrome.alarms.create(PREFIX + domain, { when: expiresAt });
}

export function clearUnpause(domain: string): void {
  void chrome.alarms.clear(PREFIX + domain);
}

export function initPauseScheduler(): void {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (!alarm.name.startsWith(PREFIX)) return;
    const domain = alarm.name.slice(PREFIX.length);
    void removePauseAndReconcile(domain);
  });
}

async function removePauseAndReconcile(domain: string): Promise<void> {
  const s = await getSettings();
  const next = { ...s, pauses: s.pauses.filter((p) => p.domain !== domain) };
  await setSettings(next);
  await reconcileSession(next);
}
