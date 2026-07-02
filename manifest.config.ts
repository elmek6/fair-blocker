import { defineManifest } from '@crxjs/vite-plugin';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pkg from './package.json' with { type: 'json' };

// Compiler tarafından üretilen ruleset manifest fragmanını (varsa) oku.
// İlk kez, `npm run compile-filters` çalışmadan önce dosya yoktur -> boş dizi.
interface RuleResource {
  id: string;
  enabled: boolean;
  path: string;
}
const rrPath = fileURLToPath(
  new URL('./filters/generated/meta/ruleResources.json', import.meta.url),
);
const ruleResources: RuleResource[] = existsSync(rrPath)
  ? (JSON.parse(readFileSync(rrPath, 'utf8')) as RuleResource[])
  : [];

// Tüm manifest'in tek kaynağı. Content script'ler (kozmetik + scriptlet loader)
// ve options sayfası sonraki fazlarda eklenecek.
export default defineManifest({
  manifest_version: 3,
  name: 'fair-block',
  version: pkg.version,
  description: pkg.description,

  icons: {
    16: 'icons/icon-16.png',
    32: 'icons/icon-32.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  },

  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'fair-block',
    default_icon: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
    },
  },

  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },

  options_page: 'src/options/index.html',

  content_scripts: [
    {
      matches: ['http://*/*', 'https://*/*'],
      js: ['src/content/cosmetic/inject.ts'],
      run_at: 'document_start',
      all_frames: true,
    },
    {
      // YouTube reklam hızlandır/atla — SPA olduğu için kalıcı script gerekir.
      matches: ['*://*.youtube.com/*'],
      js: ['src/content/youtube/adSpeedup.ts'],
      run_at: 'document_start',
      all_frames: false,
    },
  ],

  // Content script'in fetch ile okuyabilmesi için kozmetik veri erişilebilir olmalı.
  web_accessible_resources: [
    {
      matches: ['http://*/*', 'https://*/*'],
      resources: ['cosmetic/*', 'cosmetic/specific/*', 'scriptlets/*'],
    },
  ],

  // declarativeNetRequestFeedback: onRuleMatchedDebug (badge/Bu Sayfa) — unpacked'ta çalışır.
  permissions: [
    'storage',
    'declarativeNetRequest',
    'declarativeNetRequestFeedback',
    'tabs',
    'alarms',
    'scripting',
    'webNavigation',
  ],

  // MAIN world scriptlet enjeksiyonu (chrome.scripting.executeScript) için gerekli.
  host_permissions: ['http://*/*', 'https://*/*'],

  // Statik ruleset'ler public/rulesets altında; Vite bunları dist köküne
  // 'rulesets/<id>.json' olarak kopyalar (path'ler ona göre).
  declarative_net_request: {
    rule_resources: ruleResources,
  },
});
