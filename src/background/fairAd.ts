// "Fair-ad" kademeli adalet: tek seviye (0..3) -> katman/liste presetine çevrilir.
// Kategori bazlı (birebir sayı değil): öngörülebilir ve DNR ile temiz.
//
//  0 Tam engelle    : reklam+privacy+güvenlik+kozmetik+scriptlet açık
//  1 Kabul edilebilir: + acceptable-ads istisna listesi (rahatsız etmeyen reklamlar geçer)
//  2 First-party    : reklam ağı bloğu kapalı, privacy/güvenlik/kozmetik/scriptlet açık
//  3 Sadece izleyici+zararlı: yalnız privacy+güvenlik; kozmetik ve scriptlet kapalı

import { getSettings, setSettings } from '../lib/storage';
import { reconcileStaticRulesets } from './ruleReconciler';
import type { FairBlockSettings } from '../lib/types';

// Bu seviye sisteminin dokunduğu liste id'leri (diğerlerine — annoyances,
// regional, easyprivacy, urlhaus — dokunulmaz).
const AD_LISTS = ['easylist', 'pgl', 'ublock-filters'];
const ACCEPTABLE = 'acceptable-ads';

export function presetFor(level: number): Partial<FairBlockSettings> {
  const adBlock = level <= 1; // 0,1: reklam ağı bloğu açık
  const toggles: Record<string, boolean> = {};
  for (const id of AD_LISTS) toggles[id] = adBlock;
  toggles[ACCEPTABLE] = level === 1; // yalnız seviye 1'de istisna listesi

  return {
    fairAdLevel: level,
    cosmeticEnabled: level < 3,
    scriptletsEnabled: level < 3,
    // Not: mevcut sourceListToggles ile birleştirilecek (diğer listeler korunur)
    sourceListToggles: toggles,
  };
}

export async function applyFairAdLevel(
  level: number,
): Promise<FairBlockSettings> {
  const cur = await getSettings();
  const preset = presetFor(level);
  const next: FairBlockSettings = {
    ...cur,
    ...preset,
    // sourceListToggles: kullanıcının diğer liste tercihlerini koru, sadece AD/ACCEPTABLE üzerine yaz
    sourceListToggles: { ...cur.sourceListToggles, ...preset.sourceListToggles },
  };
  await setSettings(next);
  await reconcileStaticRulesets(next);
  return next;
}
