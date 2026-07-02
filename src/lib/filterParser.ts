// Klasik Adblock filtre sözdizimi -> ara AST.
// PAYLAŞILAN modül: build-zamanı compiler (tools/compiler) ve runtime abonelik
// güncelleyici (background/subscriptionUpdater) aynı bu dosyayı kullanır.
//
// Kapsam (Faz 1): ağ kuralları (+ $modifier alt kümesi), kozmetik hide/unhide,
// scriptlet enjeksiyonu, istisnalar (@@). Desteklenmeyen sözdizimi atılır ve
// `unsupported` listesine sebep koyarak raporlanır (build'i bozmaz).

import type { DnrResourceType } from './dnrRuleBuilder';

/* ------------------------------------------------------------------ *
 * AST tipleri
 * ------------------------------------------------------------------ */

export interface NetworkModifiers {
  resourceTypes: DnrResourceType[];
  excludedResourceTypes: DnrResourceType[];
  thirdParty?: boolean; // $third-party => true, $~third-party/$first-party => false
  matchCase: boolean; // $match-case
  initiatorDomains: string[]; // $domain=a.com
  excludedInitiatorDomains: string[]; // $domain=~a.com
  unsupported: string[]; // ele alamadığımız modifier'lar (removeparam, csp, ...)
}

export interface NetworkRuleAst {
  kind: 'network';
  isException: boolean; // @@
  isRegexLiteral: boolean; // /regex/
  /** regex ise: iç regex; değilse: anchor'ları soyulmuş kalıp gövdesi */
  patternBody: string;
  startAnchor: 'domain' | 'boundary' | 'none'; // '||' | '|' | yok
  endAnchor: boolean; // sonda '|'
  /** startAnchor==='domain' ve gövde tam `host` veya `host^` ise host adı */
  plainHost: string | null;
  modifiers: NetworkModifiers;
  raw: string;
  sourceList: string;
  sourceLine: number;
}

export interface CosmeticRuleAst {
  kind: 'cosmetic-hide' | 'cosmetic-unhide';
  domains: string[]; // boş => generic (her sitede)
  excludedDomains: string[];
  selector: string;
  raw: string;
  sourceList: string;
  sourceLine: number;
}

export interface ScriptletRuleAst {
  kind: 'scriptlet';
  isException: boolean;
  domains: string[];
  excludedDomains: string[];
  name: string;
  args: string[];
  raw: string;
  sourceList: string;
  sourceLine: number;
}

export type FilterRuleAst = NetworkRuleAst | CosmeticRuleAst | ScriptletRuleAst;

export interface ListMetadata {
  title?: string;
  version?: string;
  lastModified?: string;
  expires?: string;
  homepage?: string;
}

export interface ParseResult {
  rules: FilterRuleAst[];
  unsupported: { line: number; raw: string; reason: string }[];
  meta: ListMetadata;
}

/* ------------------------------------------------------------------ *
 * Modifier eşlemeleri
 * ------------------------------------------------------------------ */

// Adblock kaynak-tipi modifier'ı -> DNR ResourceType
const RESOURCE_TYPE_MAP: Record<string, DnrResourceType> = {
  script: 'script',
  image: 'image',
  stylesheet: 'stylesheet',
  css: 'stylesheet',
  object: 'object',
  'object-subrequest': 'object',
  xmlhttprequest: 'xmlhttprequest',
  xhr: 'xmlhttprequest',
  subdocument: 'sub_frame',
  frame: 'sub_frame',
  document: 'main_frame',
  doc: 'main_frame',
  ping: 'ping',
  beacon: 'ping',
  media: 'media',
  font: 'font',
  websocket: 'websocket',
  other: 'other',
};

// Ele alamadığımız (Faz 1) modifier'lar -> bunlardan biri varsa kural atlanır.
const UNSUPPORTED_MODIFIERS = new Set([
  'removeparam',
  'removeheader',
  'csp',
  'redirect',
  'redirect-rule',
  'rewrite',
  'header',
  'replace',
  'popup',
  'popunder',
  'genericblock',
  'generichide',
  'specifichide',
  'elemhide',
  'inline-script',
  'inline-font',
  'webrtc',
  'cookie',
  'empty',
  'mp4',
  'cname',
  'denyallow',
  'permissions',
  'urltransform',
  'to',
  'method',
]);

/* ------------------------------------------------------------------ *
 * Ana giriş
 * ------------------------------------------------------------------ */

export function parseFilterList(text: string, sourceList: string): ParseResult {
  const rules: FilterRuleAst[] = [];
  const unsupported: ParseResult['unsupported'] = [];
  const meta: ListMetadata = {};

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (line === '') continue;

    // Yorum / metadata
    if (line.startsWith('!')) {
      captureMeta(line, meta);
      continue;
    }
    if (line.startsWith('[') && /\]$/.test(line)) continue; // [Adblock Plus 2.0]

    // Kozmetik / scriptlet ayırıcısını bul
    const cos = findCosmeticSeparator(line);
    if (cos) {
      const parsed = parseCosmeticOrScriptlet(line, cos, sourceList, i + 1);
      if (parsed.rule) rules.push(parsed.rule);
      else if (parsed.reason)
        unsupported.push({ line: i + 1, raw: line, reason: parsed.reason });
      continue;
    }

    // Ağ kuralı
    const net = parseNetworkRule(line, sourceList, i + 1);
    if (net.rule) rules.push(net.rule);
    else if (net.reason)
      unsupported.push({ line: i + 1, raw: line, reason: net.reason });
  }

  return { rules, unsupported, meta };
}

/* ------------------------------------------------------------------ *
 * Metadata satırları
 * ------------------------------------------------------------------ */
function captureMeta(line: string, meta: ListMetadata): void {
  const m = line.match(/^!\s*([A-Za-z ]+):\s*(.+)$/);
  if (!m) return;
  const key = m[1].trim().toLowerCase();
  const val = m[2].trim();
  if (key === 'title') meta.title = val;
  else if (key === 'version') meta.version = val;
  else if (key === 'last modified' || key === 'updated') meta.lastModified = val;
  else if (key === 'expires') meta.expires = val;
  else if (key === 'homepage') meta.homepage = val;
}

/* ------------------------------------------------------------------ *
 * Kozmetik / scriptlet ayırıcı tespiti
 * En uzun/özel ayırıcılar önce. Faz 1'de yalnız ## / #@# (+js) destekli;
 * gerisi (#?#, #$#, #%# ...) unsupported.
 * ------------------------------------------------------------------ */
interface CosmeticSep {
  index: number;
  sep: string;
}
const COSMETIC_SEPARATORS = [
  '#@$?#',
  '#@$#',
  '#@?#',
  '#@%#',
  '#$?#',
  '#$#',
  '#?#',
  '#%#',
  '#@#',
  '##',
];
function findCosmeticSeparator(line: string): CosmeticSep | null {
  let best: CosmeticSep | null = null;
  for (const sep of COSMETIC_SEPARATORS) {
    const idx = line.indexOf(sep);
    if (idx === -1) continue;
    // En erken konumdaki ayırıcıyı seç; eşitse en uzunu (dizide zaten uzun-önce).
    if (best === null || idx < best.index) best = { index: idx, sep };
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * Kozmetik / scriptlet ayrıştırma
 * ------------------------------------------------------------------ */
function parseCosmeticOrScriptlet(
  line: string,
  cos: CosmeticSep,
  sourceList: string,
  lineNo: number,
): { rule?: FilterRuleAst; reason?: string } {
  const domainPart = line.slice(0, cos.index);
  const body = line.slice(cos.index + cos.sep.length);
  const { domains, excludedDomains } = parseDomainList(domainPart);

  const isUnhide = cos.sep.includes('@');

  // Scriptlet: `##+js(name, args...)`
  if ((cos.sep === '##' || cos.sep === '#@#') && body.startsWith('+js(')) {
    const inner = body.slice(4).replace(/\)$/, '');
    const parts = splitScriptletArgs(inner);
    const name = parts.shift() ?? '';
    if (!name) return { reason: 'boş scriptlet adı' };
    return {
      rule: {
        kind: 'scriptlet',
        isException: isUnhide,
        domains,
        excludedDomains,
        name,
        args: parts,
        raw: line,
        sourceList,
        sourceLine: lineNo,
      },
    };
  }

  // Sadece düz `##` / `#@#` hide/unhide destekli (Faz 1).
  if (cos.sep === '##' || cos.sep === '#@#') {
    const selector = body.trim();
    if (!selector) return { reason: 'boş seçici' };
    // Prosedürel/uBO özel seçicileri (Faz 1'de düz CSS'e çeviremeyiz) ele.
    if (/:(style|remove|matches-path|has-text|min-text-length|upward|watch-attr|xpath)\(/i.test(selector)) {
      return { reason: `prosedürel kozmetik seçici: ${selector.slice(0, 40)}` };
    }
    return {
      rule: {
        kind: isUnhide ? 'cosmetic-unhide' : 'cosmetic-hide',
        domains,
        excludedDomains,
        selector,
        raw: line,
        sourceList,
        sourceLine: lineNo,
      },
    };
  }

  return { reason: `desteklenmeyen kozmetik ayırıcı: ${cos.sep}` };
}

// `a.com,~b.com,c.com` -> {domains:[a.com,c.com], excludedDomains:[b.com]}
function parseDomainList(part: string): {
  domains: string[];
  excludedDomains: string[];
} {
  const domains: string[] = [];
  const excludedDomains: string[] = [];
  if (part.trim() === '') return { domains, excludedDomains };
  for (const d of part.split(',')) {
    const t = d.trim();
    if (t === '') continue;
    if (t.startsWith('~')) excludedDomains.push(t.slice(1));
    else domains.push(t);
  }
  return { domains, excludedDomains };
}

// Scriptlet argümanlarını virgülden böl (basit kaçış desteğiyle).
function splitScriptletArgs(inner: string): string[] {
  const out: string[] = [];
  let cur = '';
  let escaped = false;
  for (const ch of inner) {
    if (escaped) {
      cur += ch;
      escaped = false;
    } else if (ch === '\\') {
      escaped = true;
    } else if (ch === ',') {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

/* ------------------------------------------------------------------ *
 * Ağ kuralı ayrıştırma
 * ------------------------------------------------------------------ */
function parseNetworkRule(
  line: string,
  sourceList: string,
  lineNo: number,
): { rule?: NetworkRuleAst; reason?: string } {
  let rest = line;
  const isException = rest.startsWith('@@');
  if (isException) rest = rest.slice(2);

  // Regex literali? `/pattern/` ya da `/pattern/$opts`
  const regexMatch = rest.match(/^\/(.+)\/(?:\$(.*))?$/);
  let isRegexLiteral = false;
  let patternPart: string;
  let optionsStr = '';

  if (regexMatch) {
    isRegexLiteral = true;
    patternPart = regexMatch[1];
    optionsStr = regexMatch[2] ?? '';
  } else {
    // Seçenekleri son (kaçışsız) `$`'tan ayır
    const dollar = lastUnescapedDollar(rest);
    if (dollar >= 0) {
      patternPart = rest.slice(0, dollar);
      optionsStr = rest.slice(dollar + 1);
    } else {
      patternPart = rest;
    }
  }

  const mods = parseModifiers(optionsStr);
  if (mods.unsupported.length > 0) {
    return { reason: `desteklenmeyen modifier: ${mods.unsupported.join(',')}` };
  }

  if (isRegexLiteral) {
    return {
      rule: {
        kind: 'network',
        isException,
        isRegexLiteral: true,
        patternBody: patternPart,
        startAnchor: 'none',
        endAnchor: false,
        plainHost: null,
        modifiers: mods,
        raw: line,
        sourceList,
        sourceLine: lineNo,
      },
    };
  }

  // Anchor'ları soy
  let startAnchor: NetworkRuleAst['startAnchor'] = 'none';
  let body = patternPart;
  if (body.startsWith('||')) {
    startAnchor = 'domain';
    body = body.slice(2);
  } else if (body.startsWith('|')) {
    startAnchor = 'boundary';
    body = body.slice(1);
  }
  let endAnchor = false;
  if (body.endsWith('|')) {
    endAnchor = true;
    body = body.slice(0, -1);
  }

  if (body === '') return { reason: 'boş kalıp' };

  // Düz domain anchor mı? `||host^` veya `||host`
  const plainHost = computePlainHost(startAnchor, body);

  return {
    rule: {
      kind: 'network',
      isException,
      isRegexLiteral: false,
      patternBody: body,
      startAnchor,
      endAnchor,
      plainHost,
      modifiers: mods,
      raw: line,
      sourceList,
      sourceLine: lineNo,
    },
  };
}

// `||` ile başlayan ve gövdesi tam `host` ya da `host^` olan (yol/sorgu/
// wildcard içermeyen) kurallar için host adını döndürür; aksi halde null.
// Geri-mühendislik rafinajı: sondaki `^` (veya hiçbir şey) şart — `||host`
// caret'siz halde `host.evil.com` gibi eşleşebildiğinden yine kabul ediyoruz
// ANCAK gövdede başka ayırıcı/yol yoksa. Güvenli taraf: sadece `host` veya `host^`.
function computePlainHost(
  startAnchor: NetworkRuleAst['startAnchor'],
  body: string,
): string | null {
  if (startAnchor !== 'domain') return null;
  let host = body;
  if (host.endsWith('^')) host = host.slice(0, -1);
  // Gövdede yol/sorgu/wildcard/ayırıcı kalmamalı
  if (/[/?*^|]/.test(host)) return null;
  return host; // geçerlilik kontrolü dnrRuleBuilder.isValidDomain ile yapılır
}

function lastUnescapedDollar(s: string): number {
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i] === '$' && (i === 0 || s[i - 1] !== '\\')) return i;
  }
  return -1;
}

function parseModifiers(optionsStr: string): NetworkModifiers {
  const mods: NetworkModifiers = {
    resourceTypes: [],
    excludedResourceTypes: [],
    matchCase: false,
    initiatorDomains: [],
    excludedInitiatorDomains: [],
    unsupported: [],
  };
  if (optionsStr.trim() === '') return mods;

  for (const rawOpt of splitModifiers(optionsStr)) {
    const opt = rawOpt.trim();
    if (opt === '') continue;

    const negated = opt.startsWith('~');
    const bare = negated ? opt.slice(1) : opt;
    const eq = bare.indexOf('=');
    const key = eq >= 0 ? bare.slice(0, eq) : bare;
    const value = eq >= 0 ? bare.slice(eq + 1) : '';

    if (key === 'domain') {
      for (const d of value.split('|')) {
        const t = d.trim();
        if (t === '') continue;
        if (t.startsWith('~')) mods.excludedInitiatorDomains.push(t.slice(1));
        else mods.initiatorDomains.push(t);
      }
      continue;
    }
    if (key === 'third-party' || key === '3p') {
      mods.thirdParty = !negated;
      continue;
    }
    if (key === 'first-party' || key === '1p') {
      mods.thirdParty = negated; // ~first-party => third-party
      continue;
    }
    if (key === 'match-case') {
      mods.matchCase = !negated;
      continue;
    }
    if (key === 'all' || key === 'important') {
      // Faz 1: sessizce yok say (davranışı bozmaz, sadece optimize/öncelik ipucu)
      continue;
    }
    if (key in RESOURCE_TYPE_MAP) {
      const rt = RESOURCE_TYPE_MAP[key];
      if (negated) mods.excludedResourceTypes.push(rt);
      else mods.resourceTypes.push(rt);
      continue;
    }
    if (UNSUPPORTED_MODIFIERS.has(key)) {
      mods.unsupported.push(key);
      continue;
    }
    // Bilinmeyen modifier -> güvenli tarafta: desteklenmeyen say
    mods.unsupported.push(key);
  }
  return mods;
}

// Modifier'ları virgülden böl ama `domain=a.com,b.com`... aslında domain
// pipe (`|`) ile ayrılır, virgül modifier ayırıcısıdır — düz virgül bölme yeterli,
// yalnız regex-değerli modifier'lar (Faz 1'de yok) hariç.
function splitModifiers(s: string): string[] {
  return s.split(',');
}
