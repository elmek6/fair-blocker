// El yazımı scriptlet kataloğu — ÖZGÜN implementasyonlar (uBO/AdGuard/eyeo
// kodu kopyalanmadı; yalnız standart isimli, iyi belgelenmiş teknikler yeniden yazıldı).
//
// Her scriptlet self-contained bir fonksiyondur: `(args: string[]) => void`.
// chrome.scripting.executeScript({world:'MAIN', func, args}) fonksiyonun KAYNAĞINI
// serialize edip sayfada çalıştırır — bu yüzden gövde dış scope'a referans veremez;
// tüm yardımcılar fonksiyon İÇİNDE tanımlı.

/* set-constant: bir window özelliğini sabit bir değere kilitler. */
export function setConstant(args: string[]): void {
  const chain = args[0];
  const raw = args[1];
  if (!chain) return;
  let value: unknown = raw;
  if (raw === 'true') value = true;
  else if (raw === 'false') value = false;
  else if (raw === 'null') value = null;
  else if (raw === 'undefined') value = undefined;
  else if (raw === 'emptyArr') value = [];
  else if (raw === 'emptyObj') value = {};
  else if (raw === 'noopFunc') value = function () {};
  else if (raw === "''" || raw === '') value = '';
  else if (/^-?\d+(\.\d+)?$/.test(raw)) value = Number(raw);

  const parts = chain.split('.');
  const leaf = parts.pop() as string;
  let obj: Record<string, unknown> = window as unknown as Record<string, unknown>;
  for (const p of parts) {
    const nxt = obj[p];
    if (nxt === undefined || nxt === null) return; // ara yol yok -> vazgeç
    obj = nxt as Record<string, unknown>;
  }
  try {
    Object.defineProperty(obj, leaf, {
      get: () => value,
      set: () => {},
      configurable: false,
    });
  } catch {
    /* zaten tanımlı/kilitli */
  }
}

/* abort-on-property-read: bir özellik OKUNDUĞUNDA hata fırlatır (anti-adblock
   tespit script'lerini kırmak için). */
export function abortOnPropertyRead(args: string[]): void {
  const chain = args[0];
  if (!chain) return;
  const parts = chain.split('.');
  const leaf = parts.pop() as string;
  let obj: Record<string, unknown> = window as unknown as Record<string, unknown>;
  for (const p of parts) {
    const nxt = obj[p];
    if (nxt === undefined || nxt === null) return;
    obj = nxt as Record<string, unknown>;
  }
  try {
    Object.defineProperty(obj, leaf, {
      get() {
        throw new ReferenceError('fair-block');
      },
      set() {},
      configurable: false,
    });
  } catch {
    /* ignore */
  }
}

/* json-prune: JSON.parse sonucundan belirtilen (nokta yollu) özellikleri siler. */
export function jsonPrune(args: string[]): void {
  const props = (args[0] || '').split(/\s+/).filter(Boolean);
  if (props.length === 0) return;
  const original = JSON.parse;
  JSON.parse = function (this: unknown, ...a: Parameters<typeof JSON.parse>) {
    const result = original.apply(this, a);
    try {
      if (result && typeof result === 'object') {
        for (const path of props) {
          const keys = path.split('.');
          const last = keys.pop() as string;
          let cur: Record<string, unknown> = result as Record<string, unknown>;
          let ok = true;
          for (const k of keys) {
            const nxt = cur[k];
            if (nxt && typeof nxt === 'object') cur = nxt as Record<string, unknown>;
            else {
              ok = false;
              break;
            }
          }
          if (ok) delete cur[last];
        }
      }
    } catch {
      /* ignore */
    }
    return result;
  };
}

export interface ScriptletMeta {
  id: string;
  description: string;
}

// id -> fonksiyon
export const SCRIPTLETS: Record<string, (args: string[]) => void> = {
  'set-constant': setConstant,
  'abort-on-property-read': abortOnPropertyRead,
  'json-prune': jsonPrune,
};

// UI için açıklama
export const SCRIPTLET_META: ScriptletMeta[] = [
  { id: 'set-constant', description: 'window özelliğini sabitler (adblock bayrakları vb.)' },
  { id: 'abort-on-property-read', description: 'özellik okunduğunda hata fırlatır (anti-adblock)' },
  { id: 'json-prune', description: 'JSON.parse çıktısından reklam alanlarını siler' },
];

// Filtre listesi takma adları -> katalog id'si
export const SCRIPTLET_ALIASES: Record<string, string> = {
  'set-constant': 'set-constant',
  'set-constant.js': 'set-constant',
  set: 'set-constant',
  'abort-on-property-read': 'abort-on-property-read',
  'abort-on-property-read.js': 'abort-on-property-read',
  aopr: 'abort-on-property-read',
  'json-prune': 'json-prune',
  'json-prune.js': 'json-prune',
};

export function resolveScriptletId(name: string): string | null {
  return SCRIPTLET_ALIASES[name] ?? (SCRIPTLETS[name] ? name : null);
}
