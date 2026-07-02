// Dynamic/session kural ID'lerini kategori bantlarına yerleştirir (çakışma yok).
// Reconciler banttaki tüm kuralları toptan değiştirdiği için basit index tabanlı.

import {
  ID_BAND_WHITELIST,
  ID_BAND_BLACKLIST,
  ID_BAND_SUBSCRIPTION,
  ID_BAND_SESSION_PAUSE,
} from './constants';

function inBand(id: number, band: { start: number; end: number }): number {
  if (id > band.end) {
    throw new Error(`Kural ID ${id} bandı (${band.start}-${band.end}) aştı.`);
  }
  return id;
}

export function whitelistRuleId(index: number): number {
  return inBand(ID_BAND_WHITELIST.start + index, ID_BAND_WHITELIST);
}
export function blacklistRuleId(index: number): number {
  return inBand(ID_BAND_BLACKLIST.start + index, ID_BAND_BLACKLIST);
}
export function subscriptionRuleId(slotStart: number, index: number): number {
  return inBand(slotStart + index, ID_BAND_SUBSCRIPTION);
}
export function pauseSessionRuleId(index: number): number {
  return inBand(ID_BAND_SESSION_PAUSE.start + index, ID_BAND_SESSION_PAUSE);
}
