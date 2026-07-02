// Tüm sabitlerin tek kaynağı: DNR kotaları, öncelik merdiveni, kaynak-tipi
// eşlemesi. Hem build-zamanı compiler'ı hem runtime service worker buradan okur.

/* ------------------------------------------------------------------ *
 * Chrome declarativeNetRequest kotaları (doğrulandı, Temmuz 2026)
 * ------------------------------------------------------------------ */
export const MAX_STATIC_RULESETS = 100;
export const MAX_ENABLED_STATIC_RULESETS = 50;
export const GUARANTEED_MIN_STATIC_RULES = 30_000;
export const MAX_DYNAMIC_RULES = 30_000;
export const MAX_UNSAFE_DYNAMIC_RULES = 5_000;
export const MAX_SESSION_RULES = 5_000;
export const MAX_REGEX_RULES_PER_RULESET = 1_000;

/* Sharding yumuşak sınırları (Chrome sınırı değil, okunabilirlik/diff kolaylığı) */
export const SHARD_MAX_RULES = 20_000;
export const SHARD_MAX_REGEX_RULES = 900; // 1000 sert sınırının altında tampon

/* ------------------------------------------------------------------ *
 * Öncelik merdiveni. DNR'de yüksek öncelik önce değerlendirilir ve
 * `allow` her zaman `block`'u ezmelidir. Mutlak sayılar keyfi; önemli
 * olan SIRALAMA. Aralar 1000'er bırakıldı ki ileride ara seviye eklenebilsin.
 * (uBOL gerçek çıktısında 10/30 gibi sayılar kullanıyor — prensip aynı.)
 * ------------------------------------------------------------------ */
export const PRIORITY_BLOCK_BASE = 1_000; // düz domain (requestDomains) blokları
export const PRIORITY_BLOCK_SPECIFIC = 2_000; // path/pattern (urlFilter/regex) blokları
export const PRIORITY_LIST_EXCEPTION = 3_000; // liste içi @@ istisnaları
export const PRIORITY_USER_ALLOW = 4_000; // kullanıcı whitelist (kalıcı dynamic)
export const PRIORITY_USER_PAUSE = 5_000; // geçici duraklat (session)
export const PRIORITY_GLOBAL_OFF = 6_000; // genel kapalı: her şeyi allow eden ana override

/* ------------------------------------------------------------------ *
 * chrome.storage.local anahtarları
 * ------------------------------------------------------------------ */
export const STORAGE_KEY_SETTINGS = 'fairBlockSettings';

/* ------------------------------------------------------------------ *
 * Dynamic/session kural ID bantları (ruleIdAllocator bunları kullanır).
 * Kategoriler çakışmasın diye ayrı aralıklar.
 * ------------------------------------------------------------------ */
export const ID_BAND_WHITELIST = { start: 1, end: 9_999 } as const;
export const ID_BAND_BLACKLIST = { start: 10_000, end: 19_999 } as const;
export const ID_BAND_SUBSCRIPTION = { start: 100_000, end: 999_999 } as const;
export const SUBSCRIPTION_SLOT_SIZE = 5_000; // abonelik başına maksimum kural
export const ID_BAND_SESSION_PAUSE = { start: 1, end: 4_999 } as const; // ayrı session namespace
export const ID_GLOBAL_OFF = 9_000_000; // dynamic uzayında tekil "genel kapalı" kural id'si
