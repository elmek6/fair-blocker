// Saf whitelist/pause eşleşme mantığı. Hem background hem content script kullanır
// (content script background'a mesaj atmadan storage'dan okuyup yerel karar verir).

import { domainAndParents } from './domainUtils';
import type { FairBlockSettings, PauseEntry } from './types';

function chainOf(hostname: string): Set<string> {
  return new Set([hostname, ...domainAndParents(hostname)]);
}

export function isWhitelisted(s: FairBlockSettings, hostname: string): boolean {
  if (!hostname) return false;
  const chain = chainOf(hostname);
  return s.whitelist.some((e) => chain.has(e.domain));
}

export function matchPause(
  s: FairBlockSettings,
  hostname: string,
): PauseEntry | null {
  if (!hostname) return null;
  const chain = chainOf(hostname);
  const now = Date.now();
  for (const p of s.pauses) {
    if (!chain.has(p.domain)) continue;
    if (p.expiresAt === null || p.expiresAt > now) return p;
  }
  return null;
}

export function isPaused(s: FairBlockSettings, hostname: string): boolean {
  return matchPause(s, hostname) !== null;
}

export function pauseExpiry(
  s: FairBlockSettings,
  hostname: string,
): number | null {
  const p = matchPause(s, hostname);
  return p ? p.expiresAt : null;
}

// Kozmetik/scriptlet bu sitede uygulanmalı mı?
export function shouldApplyOnSite(
  s: FairBlockSettings,
  hostname: string,
): boolean {
  return s.globalEnabled && !isWhitelisted(s, hostname) && !isPaused(s, hostname);
}
