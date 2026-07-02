// Durum değiştiren eylem mesajları. Her biri: ayarı mutasyona uğrat -> kaydet
// -> ilgili DNR reconcile. Tek yazıcı disiplini (yalnız background yazar).

import { getSettings, setSettings } from '../lib/storage';
import { normalizeDomain, isValidDomain } from '../lib/domainUtils';
import { ok, err } from '../lib/messages';
import type { Message, Response } from '../lib/messages';
import type { FairBlockSettings, SubscriptionEntry } from '../lib/types';
import {
  reconcileDynamic,
  reconcileSession,
  reconcileStaticRulesets,
  firstNetworkNode,
} from './ruleReconciler';
import { scheduleUnpause, clearUnpause } from './pauseScheduler';
import {
  fetchAndApplySubscription,
  clearSubscriptionSlot,
  firstFreeSlot,
} from './subscriptionUpdater';
import { applyFairAdLevel } from './fairAd';

export async function applyActionMessage(
  msg: Message,
): Promise<Response<unknown>> {
  switch (msg.type) {
    case 'PAUSE_SITE':
      return pauseSite(msg.domain, msg.durationMs);
    case 'UNPAUSE_SITE':
      return unpauseSite(msg.domain);
    case 'TOGGLE_WHITELIST':
      return toggleWhitelist(msg.domain);
    case 'ADD_BLACKLIST':
      return addBlacklist(msg.rawFilterText);
    case 'REMOVE_BLACKLIST':
      return removeBlacklist(msg.rawFilterText);

    case 'SET_SOURCE_TOGGLE':
      return setSourceToggle(msg.listId, msg.enabled);
    case 'ADD_SUBSCRIPTION':
      return addSubscription(msg.url, msg.name);
    case 'REMOVE_SUBSCRIPTION':
      return removeSubscription(msg.id);
    case 'REFRESH_SUBSCRIPTION':
      return refreshSubscription(msg.id);

    case 'SET_FAIR_AD_LEVEL': {
      try {
        return ok(await applyFairAdLevel(msg.level));
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }

    case 'SET_SCRIPTLET':
      return err(`'${msg.type}' scriptletsTab PATCH_SETTINGS kullanır.`);
    default:
      return err('Bilinmeyen mesaj tipi.');
  }
}

async function mutate(
  fn: (s: FairBlockSettings) => FairBlockSettings,
): Promise<FairBlockSettings> {
  const cur = await getSettings();
  const next = fn(cur);
  await setSettings(next);
  return next;
}

async function pauseSite(
  domain: string,
  durationMs: number | null,
): Promise<Response<FairBlockSettings>> {
  const d = normalizeDomain(domain);
  if (!isValidDomain(d)) return err('Geçersiz domain.');
  const expiresAt = durationMs === null ? null : Date.now() + durationMs;
  const next = await mutate((s) => ({
    ...s,
    pauses: [...s.pauses.filter((p) => p.domain !== d), { domain: d, expiresAt }],
  }));
  await reconcileSession(next);
  if (expiresAt !== null) scheduleUnpause(d, expiresAt);
  else clearUnpause(d);
  return ok(next);
}

async function unpauseSite(domain: string): Promise<Response<FairBlockSettings>> {
  const d = normalizeDomain(domain);
  const next = await mutate((s) => ({
    ...s,
    pauses: s.pauses.filter((p) => p.domain !== d),
  }));
  await reconcileSession(next);
  clearUnpause(d);
  return ok(next);
}

async function toggleWhitelist(
  domain: string,
): Promise<Response<FairBlockSettings>> {
  const d = normalizeDomain(domain);
  if (!isValidDomain(d)) return err('Geçersiz domain.');
  const next = await mutate((s) => {
    const exists = s.whitelist.some((e) => e.domain === d);
    return {
      ...s,
      whitelist: exists
        ? s.whitelist.filter((e) => e.domain !== d)
        : [...s.whitelist, { domain: d, addedAt: Date.now() }],
    };
  });
  await reconcileDynamic(next);
  return ok(next);
}

async function addBlacklist(
  rawInput: string,
): Promise<Response<FairBlockSettings>> {
  const raw = normalizeBlacklistInput(rawInput);
  if (!raw) return err('Boş kural.');
  // Doğrula: parse edilip DNR kuralı üretebilmeli
  const node = firstNetworkNode(raw);
  if (!node) return err('Kural anlaşılamadı (geçerli bir ağ filtresi değil).');
  const next = await mutate((s) =>
    s.customBlacklist.some((e) => e.rawFilterText === raw)
      ? s
      : { ...s, customBlacklist: [...s.customBlacklist, { rawFilterText: raw, addedAt: Date.now() }] },
  );
  try {
    await reconcileDynamic(next);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
  return ok(next);
}

async function removeBlacklist(
  rawFilterText: string,
): Promise<Response<FairBlockSettings>> {
  const next = await mutate((s) => ({
    ...s,
    customBlacklist: s.customBlacklist.filter((e) => e.rawFilterText !== rawFilterText),
  }));
  await reconcileDynamic(next);
  return ok(next);
}

async function setSourceToggle(
  listId: string,
  enabled: boolean,
): Promise<Response<FairBlockSettings>> {
  const next = await mutate((s) => ({
    ...s,
    sourceListToggles: { ...s.sourceListToggles, [listId]: enabled },
  }));
  try {
    await reconcileStaticRulesets(next);
  } catch (e) {
    // Kota aşımı vb.: değişikliği geri al
    await mutate((s) => {
      const t = { ...s.sourceListToggles };
      delete t[listId];
      return { ...s, sourceListToggles: t };
    });
    return err(e instanceof Error ? e.message : String(e));
  }
  return ok(next);
}

async function addSubscription(
  url: string,
  name: string,
): Promise<Response<FairBlockSettings>> {
  const u = url.trim();
  if (!/^https?:\/\//.test(u)) return err('Geçerli bir http(s) URL girin.');
  const cur = await getSettings();
  if (cur.subscriptions.some((s) => s.url === u))
    return err('Bu abonelik zaten ekli.');

  const entry: SubscriptionEntry = {
    id: crypto.randomUUID(),
    url: u,
    name: name.trim() || u,
    enabled: true,
    lastFetchedAt: null,
    lastRuleCount: 0,
    slot: firstFreeSlot(cur.subscriptions),
  };
  let count = 0;
  try {
    count = await fetchAndApplySubscription(entry);
  } catch (e) {
    return err(`Abonelik indirilemedi: ${e instanceof Error ? e.message : String(e)}`);
  }
  entry.lastFetchedAt = Date.now();
  entry.lastRuleCount = count;
  const next = await mutate((s) => ({
    ...s,
    subscriptions: [...s.subscriptions, entry],
  }));
  return ok(next);
}

async function removeSubscription(
  id: string,
): Promise<Response<FairBlockSettings>> {
  const cur = await getSettings();
  const sub = cur.subscriptions.find((s) => s.id === id);
  if (sub) await clearSubscriptionSlot(sub.slot);
  const next = await mutate((s) => ({
    ...s,
    subscriptions: s.subscriptions.filter((x) => x.id !== id),
  }));
  return ok(next);
}

async function refreshSubscription(
  id: string,
): Promise<Response<FairBlockSettings>> {
  const cur = await getSettings();
  const sub = cur.subscriptions.find((s) => s.id === id);
  if (!sub) return err('Abonelik bulunamadı.');
  let count = 0;
  try {
    count = await fetchAndApplySubscription(sub);
  } catch (e) {
    return err(`Yenilenemedi: ${e instanceof Error ? e.message : String(e)}`);
  }
  const next = await mutate((s) => ({
    ...s,
    subscriptions: s.subscriptions.map((x) =>
      x.id === id ? { ...x, lastFetchedAt: Date.now(), lastRuleCount: count } : x,
    ),
  }));
  return ok(next);
}

// Kullanıcı düz domain girerse (adblock işareti yoksa) ||domain^ 'e çevir.
function normalizeBlacklistInput(input: string): string {
  const t = input.trim();
  if (t === '') return '';
  const looksLikeSyntax = /[#$^|*/@]/.test(t);
  if (!looksLikeSyntax && isValidDomain(normalizeDomain(t))) {
    return `||${normalizeDomain(t)}^`;
  }
  return t;
}
