import { describe, it, expect } from 'vitest';
import { parseFilterList } from './filterParser';
import type { NetworkRuleAst } from './filterParser';
import {
  isPlainDomainAnchor,
  buildCondition,
  computePriority,
  astToDnrRule,
  isValidDnrRegex,
  estimateRe2Cost,
} from './dnrRuleBuilder';
import {
  PRIORITY_BLOCK_BASE,
  PRIORITY_BLOCK_SPECIFIC,
  PRIORITY_LIST_EXCEPTION,
} from './constants';

// Tek satırı parse edip ilk network AST düğümünü döndür.
function net(line: string): NetworkRuleAst {
  const r = parseFilterList(line, 'test').rules[0];
  expect(r?.kind).toBe('network');
  return r as NetworkRuleAst;
}

describe('requestDomains dalı (düz domain anchor)', () => {
  it('||host^ -> requestDomains, subdomain dahil, BASE öncelik', () => {
    const node = net('||ads.example.com^');
    expect(isPlainDomainAnchor(node)).toBe(true);
    const c = buildCondition(node)!;
    expect(c.requestDomains).toEqual(['ads.example.com']);
    expect(c.urlFilter).toBeUndefined();
    expect(c.regexFilter).toBeUndefined();
    expect(computePriority(node)).toBe(PRIORITY_BLOCK_BASE);
  });

  it('caret olmadan ||host da düz domain sayılır (gövdede başka şey yoksa)', () => {
    const node = net('||tracker.io');
    expect(isPlainDomainAnchor(node)).toBe(true);
    expect(buildCondition(node)!.requestDomains).toEqual(['tracker.io']);
  });

  it('modifier alanları requestDomains dalında da AYNI hesaplanır', () => {
    const node = net('||example.com^$third-party,script,domain=foo.com|~bar.com');
    expect(isPlainDomainAnchor(node)).toBe(true);
    const c = buildCondition(node)!;
    expect(c.requestDomains).toEqual(['example.com']);
    expect(c.domainType).toBe('thirdParty');
    expect(c.resourceTypes).toEqual(['script']);
    expect(c.initiatorDomains).toEqual(['foo.com']);
    expect(c.excludedInitiatorDomains).toEqual(['bar.com']);
  });
});

describe('urlFilter dalı (path/pattern)', () => {
  it('yol içeren kural -> urlFilter, SPECIFIC öncelik', () => {
    const node = net('||example.com/ads/banner.js');
    expect(isPlainDomainAnchor(node)).toBe(false);
    const c = buildCondition(node)!;
    expect(c.urlFilter).toBe('||example.com/ads/banner.js');
    expect(c.requestDomains).toBeUndefined();
    expect(computePriority(node)).toBe(PRIORITY_BLOCK_SPECIFIC);
  });

  it('wildcard içeren kural -> urlFilter', () => {
    const node = net('||example.com^*/ad');
    expect(isPlainDomainAnchor(node)).toBe(false);
    expect(buildCondition(node)!.urlFilter).toBe('||example.com^*/ad');
  });

  it('match-case -> isUrlFilterCaseSensitive', () => {
    const node = net('||example.com/Ads/$match-case');
    const c = buildCondition(node)!;
    expect(c.urlFilter).toBe('||example.com/Ads/');
    expect(c.isUrlFilterCaseSensitive).toBe(true);
  });
});

describe('regexFilter dalı', () => {
  it('/regex/ -> regexFilter, SPECIFIC öncelik', () => {
    const node = net('/banners?\\/\\d+/');
    expect(node.isRegexLiteral).toBe(true);
    const c = buildCondition(node)!;
    expect(c.regexFilter).toBe('banners?\\/\\d+');
    expect(c.urlFilter).toBeUndefined();
    expect(computePriority(node)).toBe(PRIORITY_BLOCK_SPECIFIC);
  });
});

describe('istisnalar (@@)', () => {
  it('@@||host^ -> allow, EXCEPTION öncelik', () => {
    const node = net('@@||good.example.com^');
    const rule = astToDnrRule(node, 7)!;
    expect(rule.action.type).toBe('allow');
    expect(rule.priority).toBe(PRIORITY_LIST_EXCEPTION);
    expect(rule.condition.requestDomains).toEqual(['good.example.com']);
    expect(rule.id).toBe(7);
  });
});

describe('atlama davranışı', () => {
  it('non-ASCII urlFilter -> null (atlanır)', () => {
    const node = net('||exämple.com/ad');
    expect(buildCondition(node)).toBeNull();
  });
});

describe('regexFilter RE2 2KB derleme limiti', () => {
  // Chrome'un GERÇEKTE atladığı desenler (konsol uyarılarından) -> elenmeli
  it('büyük sayaçlı tekrarlar elenir (Chrome bunları 2KB limitiyle atlıyordu)', () => {
    const skippedByChrome = [
      '(https?:\\/\\/)104\\.154\\..{100,}', // easylist
      '(https?:\\/\\/)\\w{30,}\\.me\\/\\w{30,}\\.', // easylist
      '^https:\\/\\/cdn\\.jsdelivr\\.net\\/npm\\/[-a-z_]{4,22}@latest\\/dist\\/script\\.min\\.js$', // easyprivacy
      '^https:\\/\\/[a-z]\\.pussyspace\\.(?:com|net)\\/(?:yip?|xvs)\\/videos\\/thumbs169l\\/[0-9a-f]{2}\\/[0-9a-f]{2}\\/[0-9a-f]{2}\\/[0-9a-f]{32}(?:-\\d)?\\/[0-9a-f]{32}\\.\\d{1,2}\\.jpg$', // ublock
      'image\\.fanatik\\.com\\.tr\\/i\\/fanatik\\/75\\/770x0\\/(65aeb1ab8e04ea7f5b5e8079|65abf128ef6fdd3cbe14659e|6595061b6e3b9a5771e091b2|650e8aa980a0330f306cc17f|64c9319180a0323578c70c0e|657c5980df15856dfa0626de|65a4423ad75f861790da28ba)\\.jpg', // regional-tur
    ];
    for (const p of skippedByChrome) {
      expect(isValidDnrRegex(p), p).toBe(false);
    }
  });

  // Chrome'un kabul ettiği desenler -> geçmeli
  it('makul desenler geçer (Chrome bunları kabul ediyordu)', () => {
    const acceptedByChrome = [
      'banners?\\/\\d+',
      '^https?:\\/\\/pov\\.spectrum\\.net\\/[a-zA-Z0-9]{14,}\\.js', // easyprivacy
      '^https?:\\/\\/www\\.kroger\\.com\\/content\\/{20,}', // easyprivacy
      'cdn.itemci.com\\/storage\\/images\\/content\\/[-a-z0-9]{10,}\\.(jpg|gif)', // regional-tur
      '\\/[0-9a-f]{32}\\/invoke\\.js', // easylist
    ];
    for (const p of acceptedByChrome) {
      expect(isValidDnrRegex(p), p).toBe(true);
    }
  });

  it('estimateRe2Cost: sayaçlı tekrar açılır, döngü ucuz kalır', () => {
    // {50} tekrarı ~50 kat; `+` döngüsü sabit ek maliyet
    expect(estimateRe2Cost('a{50}')).toBeGreaterThan(estimateRe2Cost('a+') * 10);
    // `.` geniş sınıf olarak tek karakterden pahalı
    expect(estimateRe2Cost('.{20}')).toBeGreaterThan(estimateRe2Cost('x{20}'));
  });
});

describe('urlFilter DNR uyumu', () => {
  it('||* geçersiz -> anchor düşer (||*x -> *x)', () => {
    const node = net('||*logo_mediamond.gif');
    const c = buildCondition(node)!;
    expect(c.urlFilter).toBe('*logo_mediamond.gif');
  });

  it('|* -> * (tek anchor + wildcard)', () => {
    const node = net('|*foo');
    expect(buildCondition(node)!.urlFilter).toBe('*foo');
  });

  it('ortada | olan kalıp -> null (atlanır, uzantıyı düşürmez)', () => {
    const node = net('||a.com/foo|bar');
    expect(buildCondition(node)).toBeNull();
  });
});
