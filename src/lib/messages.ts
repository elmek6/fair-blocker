// Popup/options <-> background arası mesaj sözleşmeleri. Tüm eylemler
// background'dan geçer (tek yazıcı). Promise-tabanlı sendMessage kullanılır.

import type { FairBlockSettings } from './types';

export interface PageMatch {
  url: string;
  domain: string;
  rulesetId: string;
  ruleId: number;
  type: string; // resourceType
  ts: number;
}

export interface SiteState {
  hostname: string;
  isWhitelisted: boolean;
  isPaused: boolean;
  pauseExpiresAt: number | null;
  blockedCount: number;
  globalEnabled: boolean;
  cosmeticEnabled: boolean;
}

export type Message =
  | { type: 'GET_SETTINGS' }
  | { type: 'PATCH_SETTINGS'; patch: Partial<FairBlockSettings> }
  | { type: 'GET_SITE_STATE'; tabId: number; url: string }
  | { type: 'GET_PAGE_MATCHES'; tabId: number }
  | { type: 'PAUSE_SITE'; domain: string; durationMs: number | null }
  | { type: 'UNPAUSE_SITE'; domain: string }
  | { type: 'TOGGLE_WHITELIST'; domain: string }
  | { type: 'ADD_BLACKLIST'; rawFilterText: string }
  | { type: 'REMOVE_BLACKLIST'; rawFilterText: string }
  | { type: 'SET_SOURCE_TOGGLE'; listId: string; enabled: boolean }
  | { type: 'ADD_SUBSCRIPTION'; url: string; name: string }
  | { type: 'REMOVE_SUBSCRIPTION'; id: string }
  | { type: 'REFRESH_SUBSCRIPTION'; id: string }
  | { type: 'SET_SCRIPTLET'; scriptletId: string; enabled: boolean | null }
  | { type: 'SET_FAIR_AD_LEVEL'; level: number };

export interface Ok<T> {
  ok: true;
  data: T;
}
export interface Err {
  ok: false;
  error: string;
}
export type Response<T> = Ok<T> | Err;

export function ok<T>(data: T): Ok<T> {
  return { ok: true, data };
}
export function err(error: string): Err {
  return { ok: false, error };
}

// Popup/options tarafında kullanılan tipli gönderici.
export async function sendMessage<T = unknown>(msg: Message): Promise<Response<T>> {
  try {
    return (await chrome.runtime.sendMessage(msg)) as Response<T>;
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
