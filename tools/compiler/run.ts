// `npm run compile-filters` giriş noktası.
// Akış: indir -> parse -> ağ kurallarını derle -> shard'ları yaz ->
// ruleResources (manifest için) + listMeta (UI için) üret -> doğrula -> özet.

import { mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { SOURCES } from './sources';
import { fetchList } from './fetchList';
import { parseFilterList } from '../../src/lib/filterParser';
import type {
  NetworkRuleAst,
  CosmeticRuleAst,
  ScriptletRuleAst,
} from '../../src/lib/filterParser';
import { compileNetworkRules } from './networkRuleCompiler';
import type { Shard } from './networkRuleCompiler';
import { compileCosmetic } from './cosmeticCompiler';
import { compileScriptlets } from './scriptletCompiler';
import { buildRulesetManifest } from './rulesetManifestBuilder';
import type { ListBuildInput } from './rulesetManifestBuilder';
import { validate } from './validate';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const RULESETS_DIR = join(ROOT, 'public', 'rulesets');
const PUBLIC_META_DIR = join(ROOT, 'public', 'meta');
const GEN_META_DIR = join(ROOT, 'filters', 'generated', 'meta');
const COSMETIC_DIR = join(ROOT, 'public', 'cosmetic');
const COSMETIC_SPECIFIC_DIR = join(COSMETIC_DIR, 'specific');
const SCRIPTLETS_DIR = join(ROOT, 'public', 'scriptlets');

async function main(): Promise<void> {
  console.log('fair-block filtre derleyici\n');

  // Temiz başlangıç: eski ruleset çıktısını sil
  if (existsSync(RULESETS_DIR)) await rm(RULESETS_DIR, { recursive: true, force: true });
  if (existsSync(COSMETIC_DIR)) await rm(COSMETIC_DIR, { recursive: true, force: true });
  if (existsSync(SCRIPTLETS_DIR)) await rm(SCRIPTLETS_DIR, { recursive: true, force: true });
  await mkdir(RULESETS_DIR, { recursive: true });
  await mkdir(PUBLIC_META_DIR, { recursive: true });
  await mkdir(GEN_META_DIR, { recursive: true });
  await mkdir(COSMETIC_SPECIFIC_DIR, { recursive: true });
  await mkdir(SCRIPTLETS_DIR, { recursive: true });

  const allShards: Shard[] = [];
  const listInputs: ListBuildInput[] = [];
  const allCosmetic: CosmeticRuleAst[] = [];
  const allScriptlets: ScriptletRuleAst[] = [];

  for (const src of SOURCES) {
    process.stdout.write(`• ${src.name} ... `);
    let fetched;
    try {
      fetched = await fetchList(src.id, src.url);
    } catch (e) {
      console.warn(
        `\n  ⚠ ${src.name} indirilemedi, atlanıyor: ${e instanceof Error ? e.message : String(e)}\n`,
      );
      continue;
    }
    console.log(
      `${(fetched.bytes / 1024).toFixed(0)} KB ${fetched.fromCache ? '(cache)' : '(indirildi)'}`,
    );

    const parsed = parseFilterList(fetched.text, src.id);
    const networkNodes = parsed.rules.filter(
      (r): r is NetworkRuleAst => r.kind === 'network',
    );
    const cosmeticNodes = parsed.rules.filter(
      (r): r is CosmeticRuleAst =>
        r.kind === 'cosmetic-hide' || r.kind === 'cosmetic-unhide',
    );
    allCosmetic.push(...cosmeticNodes);
    const scriptletNodes = parsed.rules.filter(
      (r): r is ScriptletRuleAst => r.kind === 'scriptlet',
    );
    allScriptlets.push(...scriptletNodes);
    const cosmeticCount = parsed.rules.length - networkNodes.length;

    const { shards, stats } = compileNetworkRules(networkNodes, src.id);

    // Shard dosyalarını yaz
    for (const shard of shards) {
      await writeFile(
        join(RULESETS_DIR, `${shard.id}.json`),
        JSON.stringify(shard.rules),
        'utf8',
      );
      allShards.push(shard);
    }

    const ruleCount = shards.reduce((s, sh) => s + sh.rules.length, 0);
    listInputs.push({
      id: src.id,
      name: src.name,
      category: src.category,
      sourceUrl: src.url,
      license: src.license,
      fetchedAt: fetched.fetchedAt,
      defaultEnabled: src.defaultEnabled,
      shardIds: shards.map((s) => s.id),
      ruleCount,
    });

    console.log(
      `  parse: ${parsed.rules.length} kural (ağ ${networkNodes.length}, kozmetik/scriptlet ${cosmeticCount}), ` +
        `atlanan sözdizimi ${parsed.unsupported.length}`,
    );
    console.log(
      `  derlendi: ${stats.emitted} DNR kuralı — düz domain ${stats.plainDomainRules} ` +
        `-> ${stats.batchedRules} toplu kural, urlFilter ${stats.urlFilterRules}, ` +
        `regex ${stats.regexRules}; üretilemeyen ${stats.skipped}, shard ${shards.length}\n`,
    );
  }

  // Kozmetik derle + yaz
  const cosmetic = compileCosmetic(allCosmetic);
  await writeFile(
    join(COSMETIC_DIR, 'generic.json'),
    JSON.stringify(cosmetic.generic),
    'utf8',
  );
  for (let i = 0; i < cosmetic.specificShards.length; i++) {
    await writeFile(
      join(COSMETIC_SPECIFIC_DIR, `${i}.json`),
      JSON.stringify(cosmetic.specificShards[i]),
      'utf8',
    );
  }
  console.log(
    `kozmetik: generic ${cosmetic.stats.genericCount}, specific domain ${cosmetic.stats.specificDomainCount}, ` +
      `atlanan domain-kapsamlı unhide ${cosmetic.stats.ignoredDomainScopedUnhide}`,
  );

  // Scriptlet derle + yaz
  const scriptlets = compileScriptlets(allScriptlets);
  await writeFile(
    join(SCRIPTLETS_DIR, 'registry.json'),
    JSON.stringify(scriptlets.registry),
    'utf8',
  );
  console.log(
    `scriptlet: ${scriptlets.stats.resolved} tanındı (katalog), ` +
      `${scriptlets.stats.unknownSkipped} bilinmeyen atlandı, ` +
      `${scriptlets.stats.exceptionsSkipped} istisna atlandı\n`,
  );

  // Manifest + meta üret
  const { ruleResources, listMeta } = buildRulesetManifest(listInputs);
  await writeFile(
    join(GEN_META_DIR, 'ruleResources.json'),
    JSON.stringify(ruleResources, null, 2),
    'utf8',
  );
  await writeFile(
    join(PUBLIC_META_DIR, 'listMeta.json'),
    JSON.stringify(listMeta, null, 2),
    'utf8',
  );

  // Doğrula
  const report = validate(allShards, ruleResources);
  for (const w of report.warnings) console.warn(`⚠ ${w}`);
  if (report.errors.length > 0) {
    for (const e of report.errors) console.error(`✗ ${e}`);
    console.error('\nDoğrulama başarısız — build durduruldu.');
    process.exit(1);
  }

  const totalRules = allShards.reduce((s, sh) => s + sh.rules.length, 0);
  console.log(
    `✓ Tamam: ${listInputs.length} liste, ${ruleResources.length} ruleset, ${totalRules} kural.`,
  );
  console.log(`  ruleset dosyaları: public/rulesets/`);
  console.log(`  manifest fragmanı: filters/generated/meta/ruleResources.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
