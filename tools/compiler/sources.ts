// Curated (build-zamanı derlenen) statik filtre listeleri.
// Kullanıcının eklediği abonelikler burada DEĞİL — onlar runtime dinamik
// kademede (subscriptionUpdater) işlenir.
//
// defaultEnabled=true olan liste sayısı 50-aktif-ruleset kotasının altında olmalı.

export type ListCategory =
  | 'core'
  | 'privacy'
  | 'security'
  | 'annoyances'
  | 'regional';

export interface FilterSource {
  id: string; // ruleset id öneki (örn. 'easylist' -> 'easylist-0')
  name: string;
  category: ListCategory;
  url: string;
  defaultEnabled: boolean;
  license: string;
}

export const SOURCES: FilterSource[] = [
  {
    id: 'easylist',
    name: 'EasyList',
    category: 'core',
    url: 'https://easylist.to/easylist/easylist.txt',
    defaultEnabled: true,
    license: 'CC BY-SA 3.0 / GPLv3 (easylist.to)',
  },
  {
    id: 'easyprivacy',
    name: 'EasyPrivacy',
    category: 'privacy',
    url: 'https://easylist.to/easylist/easyprivacy.txt',
    defaultEnabled: true,
    license: 'CC BY-SA 3.0 / GPLv3 (easylist.to)',
  },
  {
    id: 'pgl',
    name: "Peter Lowe's List",
    category: 'core',
    url: 'https://pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&mimetype=plaintext',
    defaultEnabled: true,
    license: 'CC BY-NC-SA 4.0 (pgl.yoyo.org)',
  },
  {
    id: 'ublock-filters',
    name: 'uBlock filters',
    category: 'core',
    url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt',
    defaultEnabled: true,
    license: 'GPLv3 (uBlockOrigin/uAssets)',
  },
  {
    id: 'acceptable-ads',
    name: 'Kabul Edilebilir Reklamlar (istisna)',
    category: 'core',
    url: 'https://easylist-downloads.adblockplus.org/exceptionrules.txt',
    defaultEnabled: false, // yalnız fair-ad seviye 1'de aktif
    license: 'CC BY-SA 3.0 (Adblock Plus)',
  },
  {
    id: 'urlhaus',
    name: 'URLhaus (kötü amaçlı)',
    category: 'security',
    url: 'https://malware-filter.gitlab.io/malware-filter/urlhaus-filter-online.txt',
    defaultEnabled: true,
    license: 'CC0 (malware-filter)',
  },
  {
    id: 'annoyances',
    name: 'Fanboy Annoyances (çerez/overlay)',
    category: 'annoyances',
    url: 'https://secure.fanboy.co.nz/fanboy-annoyance.txt',
    defaultEnabled: false,
    license: 'CC BY-SA 3.0 (fanboy)',
  },
  {
    id: 'regional-tur',
    name: 'AdGuard Türkçe',
    category: 'regional',
    url: 'https://filters.adtidy.org/extension/ublock/filters/13.txt',
    defaultEnabled: false,
    license: 'GPLv3 / CC BY-SA (AdGuard)',
  },
];
