// Tipli chrome.storage.local sarmalayıcı. Tek anahtar altında tüm ayarlar.

import { STORAGE_KEY_SETTINGS } from './constants';
import { DEFAULT_SETTINGS } from './types';
import type { FairBlockSettings } from './types';

export async function getSettings(): Promise<FairBlockSettings> {
  const obj = await chrome.storage.local.get(STORAGE_KEY_SETTINGS);
  const stored = obj[STORAGE_KEY_SETTINGS] as Partial<FairBlockSettings> | undefined;
  // Sığ birleştirme: yeni alanlar için varsayılanlar korunur.
  return mergeDefaults(stored);
}

export async function setSettings(next: FairBlockSettings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY_SETTINGS]: next });
}

export async function patchSettings(
  patch: Partial<FairBlockSettings>,
): Promise<FairBlockSettings> {
  const cur = await getSettings();
  const next = { ...cur, ...patch };
  await setSettings(next);
  return next;
}

export function onSettingsChanged(
  cb: (next: FairBlockSettings) => void,
): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const change = changes[STORAGE_KEY_SETTINGS];
    if (!change) return;
    cb(mergeDefaults(change.newValue as Partial<FairBlockSettings> | undefined));
  });
}

function mergeDefaults(
  stored: Partial<FairBlockSettings> | undefined,
): FairBlockSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...(stored ?? {}),
    scriptletSettings: {
      ...DEFAULT_SETTINGS.scriptletSettings,
      ...(stored?.scriptletSettings ?? {}),
    },
  };
}
