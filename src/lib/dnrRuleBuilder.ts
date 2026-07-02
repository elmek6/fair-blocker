// AST ağ kuralı -> DNR JSON kuralı. Projenin ÇEKİRDEK algoritması burada:
// requestDomains vs urlFilter vs regexFilter kararı (kural bazında, otomatik).
// Hem build-zamanı compiler hem runtime abonelik güncelleyici paylaşır.
//
// Karar, hem Chrome resmi DNR dokümanı hem uBOL'ün gerçek derlenmiş çıktısıyla
// doğrulandı (bkz. research/rakip-analizi.md):
//   - Düz `||host^`            -> requestDomains:[host]   (en ucuz; subdomain dahil)
//   - Path/query/wildcard/mod  -> urlFilter               (DNR urlFilter == Adblock kalıbı)
//   - Kaynak /regex/           -> regexFilter
// resourceTypes/domainType/initiatorDomains her dalda AYNI hesaplanır (bağımsız alanlar).

import { isValidDomain } from './domainUtils';
import {
  PRIORITY_BLOCK_BASE,
  PRIORITY_BLOCK_SPECIFIC,
  PRIORITY_LIST_EXCEPTION,
} from './constants';
import type { NetworkRuleAst } from './filterParser';

/* ------------------------------------------------------------------ *
 * DNR JSON şekilleri (Node-compiler dostu; chrome enum'larına bağımlı değil)
 * ------------------------------------------------------------------ */
export type DnrResourceType =
  | 'main_frame'
  | 'sub_frame'
  | 'stylesheet'
  | 'script'
  | 'image'
  | 'font'
  | 'object'
  | 'xmlhttprequest'
  | 'ping'
  | 'csp_report'
  | 'media'
  | 'websocket'
  | 'webtransport'
  | 'webbundle'
  | 'other';

export interface DnrRuleCondition {
  requestDomains?: string[];
  urlFilter?: string;
  regexFilter?: string;
  isUrlFilterCaseSensitive?: boolean;
  domainType?: 'firstParty' | 'thirdParty';
  resourceTypes?: DnrResourceType[];
  excludedResourceTypes?: DnrResourceType[];
  initiatorDomains?: string[];
  excludedInitiatorDomains?: string[];
}

export interface DnrRule {
  id: number;
  priority: number;
  action: { type: 'block' | 'allow' | 'allowAllRequests' };
  condition: DnrRuleCondition;
}

/* ------------------------------------------------------------------ *
 * Karar: düz domain anchor mı?
 * ------------------------------------------------------------------ */
// Tek saf, birim-test edilebilir fonksiyon. plainHost parser'da hesaplandı;
// burada yalnız geçerlilik + regex olmama şartını uyguluyoruz.
export function isPlainDomainAnchor(node: NetworkRuleAst): boolean {
  if (node.isRegexLiteral) return false;
  if (node.startAnchor !== 'domain') return false;
  if (node.plainHost === null) return false;
  if (!isValidDomain(node.plainHost)) return false;
  return true;
}

/* ------------------------------------------------------------------ *
 * Ortak koşul alanları (her iki/üç dalda AYNI hesaplanır)
 * ------------------------------------------------------------------ */
function applyCommonFields(cond: DnrRuleCondition, node: NetworkRuleAst): void {
  const m = node.modifiers;
  if (m.thirdParty === true) cond.domainType = 'thirdParty';
  else if (m.thirdParty === false) cond.domainType = 'firstParty';
  if (m.resourceTypes.length > 0) cond.resourceTypes = dedupe(m.resourceTypes);
  if (m.excludedResourceTypes.length > 0)
    cond.excludedResourceTypes = dedupe(m.excludedResourceTypes);
  const initiators = m.initiatorDomains.filter(isValidDomain);
  const excludedInit = m.excludedInitiatorDomains.filter(isValidDomain);
  if (initiators.length > 0) cond.initiatorDomains = initiators;
  if (excludedInit.length > 0) cond.excludedInitiatorDomains = excludedInit;
}

/* ------------------------------------------------------------------ *
 * Koşul üretimi (karar ağacı)
 * ------------------------------------------------------------------ */
// Üretilemezse (non-ASCII urlFilter, geçersiz host vs.) null -> kural atlanır.
export function buildCondition(node: NetworkRuleAst): DnrRuleCondition | null {
  const cond: DnrRuleCondition = {};

  if (node.isRegexLiteral) {
    if (!isAscii(node.patternBody)) return null;
    if (!isValidDnrRegex(node.patternBody)) return null; // RE2 uyumsuz -> atla
    cond.regexFilter = node.patternBody;
    applyCommonFields(cond, node);
    return cond;
  }

  if (isPlainDomainAnchor(node)) {
    cond.requestDomains = [node.plainHost as string];
    applyCommonFields(cond, node);
    return cond;
  }

  // urlFilter dalı: DNR urlFilter sözdizimi Adblock kalıbıyla aynı
  // (`||`, `|`, `^`, `*`). Anchor'ları birleştir, DNR'ye uygun hale getir, doğrula.
  const urlFilter = toDnrUrlFilter(node);
  if (urlFilter === null) return null; // geçersiz -> kuralı atla (tüm uzantıyı düşürmesin)
  cond.urlFilter = urlFilter;
  if (node.modifiers.matchCase) cond.isUrlFilterCaseSensitive = true;
  applyCommonFields(cond, node);
  return cond;
}

function reassembleUrlFilter(node: NetworkRuleAst): string {
  let out = '';
  if (node.startAnchor === 'domain') out += '||';
  else if (node.startAnchor === 'boundary') out += '|';
  out += node.patternBody;
  if (node.endAnchor) out += '|';
  return out;
}

// Adblock kalıbını geçerli bir DNR urlFilter'a çevir; çevrilemezse null.
export function toDnrUrlFilter(node: NetworkRuleAst): string | null {
  let s = reassembleUrlFilter(node);
  if (!isAscii(s)) return null; // DNR ASCII ister

  // Start anchor'dan hemen sonra `*` gelmesi geçersiz (`||*`, `|*`) -> anchor'ı düşür.
  if (s.startsWith('||*')) s = s.slice(2);
  else if (s.startsWith('|*')) s = s.slice(1);

  if (!isValidDnrUrlFilter(s)) return null;
  return s;
}

// DNR urlFilter kısıtları: boş/`*` değil; `||` yalnız başta; tek `|` yalnız baş/son;
// başta anchor+`*` yok. Bunlara uymayan Chrome tarafından reddedilir (tüm uzantıyı düşürür).
export function isValidDnrUrlFilter(s: string): boolean {
  if (s === '' || s === '*') return false;
  if (s.startsWith('||*') || s.startsWith('|*')) return false;
  const doubleIdx = s.indexOf('||');
  if (doubleIdx > 0) return false; // `||` yalnız başta
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '|') continue;
    const atStart = i === 0 || (i === 1 && s[0] === '|');
    const atEnd = i === s.length - 1;
    if (!atStart && !atEnd) return false; // ortada `|` yasak
  }
  return true;
}

/* ------------------------------------------------------------------ *
 * Öncelik
 * ------------------------------------------------------------------ */
export function computePriority(node: NetworkRuleAst): number {
  if (node.isException) return PRIORITY_LIST_EXCEPTION;
  if (isPlainDomainAnchor(node)) return PRIORITY_BLOCK_BASE;
  return PRIORITY_BLOCK_SPECIFIC; // urlFilter / regex = daha spesifik
}

/* ------------------------------------------------------------------ *
 * Tam kural
 * ------------------------------------------------------------------ */
export function astToDnrRule(node: NetworkRuleAst, id: number): DnrRule | null {
  const condition = buildCondition(node);
  if (condition === null) return null;
  return {
    id,
    priority: computePriority(node),
    action: { type: node.isException ? 'allow' : 'block' },
    condition,
  };
}

/* ------------------------------------------------------------------ *
 * Yardımcılar
 * ------------------------------------------------------------------ */
function isAscii(s: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /^[\x00-\x7F]*$/.test(s);
}

// DNR regexFilter RE2 kullanır: lookaround ve geri-referans desteklemez; ayrıca
// JS'te bile parse edilemeyen kalıpları ele. Bunlar Chrome tarafından reddedilip
// tüm uzantıyı düşürebildiğinden burada eliyoruz.
export function isValidDnrRegex(pattern: string): boolean {
  if (pattern === '') return false;
  if (/\(\?<?[=!]/.test(pattern)) return false; // (?= (?! (?<= (?<!
  if (/\\[1-9]/.test(pattern)) return false; // geri-referans
  if (estimateRe2Cost(pattern) > MAX_RE2_COST) return false; // 2KB derleme limiti
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * RE2 derlenmiş boyut tahmini (Chrome'un kural başına 2KB limiti)
 * ------------------------------------------------------------------ */
// Chrome, regexFilter'ı RE2 ile derler ve derlenmiş program 2KB'yi aşarsa kuralı
// SESSİZCE atlar (konsola uyarı yazar; uzantıyı düşürmez ama kural etkisizdir).
// Limit kaynak uzunluğuna değil derlenmiş programa ait: `.{100,}` (28 karakter)
// aşarken 194 karakterlik düz literal geçebilir. Başlıca şişiriciler sayaçlı
// tekrarlardır ({m,n} RE2'de n kopya olarak açılır) — `.` ve `\w` gibi geniş
// sınıflar tekrar başına birden çok komut üretir.
//
// Buradaki maliyet birimi ~yönerge sayısıdır; eşik, Chrome'un gerçekte atladığı /
// kabul ettiği kurallarla kalibre edildi (atlanan en ucuz kural ~159, kabul edilen
// en pahalı ~168 çıktı; 150 bilinen tüm hatalıları eler, sınırda 1-2 çalışan
// kuralı feda eder). Chrome yeni bir kuralı yine de atlarsa eşiği düşürmek yeterli.
const MAX_RE2_COST = 150;

const COST_ANY_CHAR = 6; // `.` UTF-8'de çok baytlı aralık ağacı
const COST_CLASS_ESCAPE = 3; // \w \d \s ve negatifleri
const UNBOUNDED_MIN_COPIES = 1; // {m,} -> m+1 kopya + döngü

export function estimateRe2Cost(pattern: string): number {
  let i = 0;

  // [..] gövdesi: case-fold sonrası yaklaşık aralık sayısı
  function classCost(): number {
    let cost = 0;
    i++; // '['
    if (pattern[i] === '^') i++;
    while (i < pattern.length && pattern[i] !== ']') {
      let ch = pattern[i];
      if (ch === '\\') {
        i++;
        ch = pattern[i] ?? '';
        cost += /[wWdDsS]/.test(ch) ? COST_CLASS_ESCAPE : 1;
        i++;
      } else if (pattern[i + 1] === '-' && pattern[i + 2] !== undefined && pattern[i + 2] !== ']') {
        cost += /[a-zA-Z]/.test(ch) ? 2 : 1; // harf aralığı fold ile ikilenir
        i += 3;
      } else {
        cost += /[a-zA-Z]/.test(ch) ? 2 : 1;
        i++;
      }
    }
    if (pattern[i] === ']') i++;
    return Math.max(1, cost);
  }

  function parseAlt(): number {
    let total = 0;
    let branch = 0;
    while (i < pattern.length) {
      const c = pattern[i];
      if (c === ')') break;
      if (c === '|') {
        i++;
        total += branch + 1;
        branch = 0;
        continue;
      }
      branch += parseAtomWithQuant();
    }
    return total + branch;
  }

  function parseAtomWithQuant(): number {
    let atomCost: number;
    const c = pattern[i];
    if (c === '(') {
      i++;
      if (pattern[i] === '?') {
        i++;
        while (i < pattern.length && pattern[i] !== ':' && pattern[i] !== ')') i++;
        if (pattern[i] === ':') i++;
      }
      atomCost = parseAlt() + 2;
      if (pattern[i] === ')') i++;
    } else if (c === '[') {
      atomCost = classCost();
    } else if (c === '\\') {
      const n = pattern[i + 1] ?? '';
      atomCost = /[wWdDsS]/.test(n) ? COST_CLASS_ESCAPE : 1;
      i += 2;
    } else if (c === '.') {
      i++;
      atomCost = COST_ANY_CHAR;
    } else {
      i++;
      atomCost = /[a-zA-Z]/.test(c) ? 2 : 1; // case-fold payı
    }

    // Quantifier: {m,n} n kopya olarak açılır; * + ? döngü/dal (ucuz).
    const q = pattern[i];
    if (q === '{') {
      const m = /^\{(\d+)(?:(,)(\d*))?\}/.exec(pattern.slice(i));
      if (m) {
        i += m[0].length;
        const lo = parseInt(m[1], 10);
        const hi = m[3] ? parseInt(m[3], 10) : m[2] ? lo + UNBOUNDED_MIN_COPIES : lo;
        return atomCost * Math.max(lo, hi) + (m[2] && !m[3] ? 2 : 0);
      }
    } else if (q === '*' || q === '+' || q === '?') {
      i++;
      if (pattern[i] === '?') i++; // tembel varyant
      return atomCost + 2;
    }
    return atomCost;
  }

  return parseAlt();
}

function dedupe<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}
