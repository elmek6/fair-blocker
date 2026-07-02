// Kullanıcının eklediği abonelik listelerini runtime'da çeker, aynı parser/builder
// ile DNR kurallarına çevirir ve dynamic kural bandındaki kendi slot'una yazar.
// MV3-uyumlu: uzaktan VERİ çekilir, KOD değil (eval yok).

import { parseFilterList } from '../lib/filterParser';
import type { NetworkRuleAst } from '../lib/filterParser';
import { astToDnrRule } from '../lib/dnrRuleBuilder';
import type { DnrRule } from '../lib/dnrRuleBuilder';
import { ID_BAND_SUBSCRIPTION, SUBSCRIPTION_SLOT_SIZE } from '../lib/constants';
import type { SubscriptionEntry } from '../lib/types';

function slotStart(slot: number): number {
  return ID_BAND_SUBSCRIPTION.start + slot * SUBSCRIPTION_SLOT_SIZE;
}

// Metinden slot'a sığacak DNR kuralları (cap: SUBSCRIPTION_SLOT_SIZE).
export function buildSubscriptionRules(text: string, slot: number): DnrRule[] {
  const start = slotStart(slot);
  const parsed = parseFilterList(text, `sub-${slot}`);
  const rules: DnrRule[] = [];
  let idx = 0;
  for (const node of parsed.rules) {
    if (node.kind !== 'network') continue;
    if (idx >= SUBSCRIPTION_SLOT_SIZE) break;
    const rule = astToDnrRule(node as NetworkRuleAst, start + idx);
    if (rule) {
      rules.push(rule);
      idx++;
    }
  }
  return rules;
}

// Slot aralığındaki eski kuralları silip yenilerini ekle.
async function applySlotRules(slot: number, rules: DnrRule[]): Promise<void> {
  const start = slotStart(slot);
  const end = start + SUBSCRIPTION_SLOT_SIZE;
  const current = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = current
    .filter((r) => r.id >= start && r.id < end)
    .map((r) => r.id);
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules: rules as unknown as chrome.declarativeNetRequest.Rule[],
  });
}

export async function clearSubscriptionSlot(slot: number): Promise<void> {
  await applySlotRules(slot, []);
}

// Bir aboneliği çek, derle, uygula. Kural sayısını döndürür.
export async function fetchAndApplySubscription(
  sub: SubscriptionEntry,
): Promise<number> {
  const res = await fetch(sub.url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${sub.url}`);
  const text = await res.text();
  const rules = buildSubscriptionRules(text, sub.slot);
  await applySlotRules(sub.slot, rules);
  return rules.length;
}

// Boş slot bul (mevcut slotlarla çakışmayan en küçük indeks).
export function firstFreeSlot(existing: SubscriptionEntry[]): number {
  const used = new Set(existing.map((s) => s.slot));
  let i = 0;
  while (used.has(i)) i++;
  return i;
}

const REFRESH_ALARM = 'refresh-subscriptions';

export function initSubscriptionAlarms(): void {
  void chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: 720 }); // 12 saat
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== REFRESH_ALARM) return;
    void refreshAllEnabled();
  });
}

async function refreshAllEnabled(): Promise<void> {
  const { getSettings, setSettings } = await import('../lib/storage');
  const s = await getSettings();
  let changed = false;
  const subs = [...s.subscriptions];
  for (let i = 0; i < subs.length; i++) {
    if (!subs[i].enabled) continue;
    try {
      const count = await fetchAndApplySubscription(subs[i]);
      subs[i] = { ...subs[i], lastFetchedAt: Date.now(), lastRuleCount: count };
      changed = true;
    } catch {
      // ağ hatası — sonraki tur
    }
  }
  if (changed) await setSettings({ ...s, subscriptions: subs });
}
