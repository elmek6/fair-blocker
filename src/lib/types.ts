// Tüm ayar/durum tiplerinin tek kaynağı. chrome.storage.local'da tek anahtar
// (STORAGE_KEY_SETTINGS) altında saklanır.

export interface WhitelistEntry {
  domain: string;
  addedAt: number;
}

export interface PauseEntry {
  domain: string;
  /** null => tarayıcı oturumu boyunca (session kuralı doğal olarak temizlenir) */
  expiresAt: number | null;
}

export interface CustomRuleEntry {
  rawFilterText: string;
  addedAt: number;
}

export interface SubscriptionEntry {
  id: string;
  url: string;
  name: string;
  enabled: boolean;
  lastFetchedAt: number | null;
  lastRuleCount: number;
  /** dynamic kural ID uzayında ayrılmış slot indeksi (0,1,2...) */
  slot: number;
}

export interface ScriptletSettings {
  /** kaynak liste id -> aktif mi */
  listEnabled: Record<string, boolean>;
  /** scriptlet id -> override (yoksa listEnabled/enabledByDefault'a düşer) */
  scriptletEnabled: Record<string, boolean>;
}

export type YouTubeAdMode = 'off' | 'speed' | 'skip';

export interface FairBlockSettings {
  globalEnabled: boolean;
  cosmeticEnabled: boolean;
  cosmeticMutationWatcherEnabled: boolean;
  scriptletsEnabled: boolean;
  defaultPauseDurationMs: number;

  /** İzin verilen reklam seviyesi (kademeli adalet): 0=hiç ... 3=sadece izleyici+zararlı */
  fairAdLevel: number;

  /** YouTube reklamı: kapalı / hızlandır (fair — impression sayılır) / atla */
  youtubeAdMode: YouTubeAdMode;

  whitelist: WhitelistEntry[];
  pauses: PauseEntry[];
  customBlacklist: CustomRuleEntry[];

  subscriptions: SubscriptionEntry[];
  /** statik ruleset id -> aktif mi (manifest defaultları üzerine kullanıcı override'ı) */
  sourceListToggles: Record<string, boolean>;

  scriptletSettings: ScriptletSettings;
}

export const DEFAULT_SETTINGS: FairBlockSettings = {
  globalEnabled: true,
  cosmeticEnabled: true,
  cosmeticMutationWatcherEnabled: false,
  scriptletsEnabled: true,
  fairAdLevel: 0,
  youtubeAdMode: 'speed',
  defaultPauseDurationMs: 60 * 60 * 1000, // 1 saat

  whitelist: [],
  pauses: [],
  customBlacklist: [],

  subscriptions: [],
  sourceListToggles: {},

  scriptletSettings: { listEnabled: {}, scriptletEnabled: {} },
};
