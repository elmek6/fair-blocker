// AST ağ kuralları -> DNR JSON kuralları, ruleset shard'larına bölünmüş.
// Kararı lib/dnrRuleBuilder verir (requestDomains/urlFilter/regexFilter).
//
// ÖNEMLİ optimizasyon (uBOL'den doğrulandı): aynı eylem/öncelik/modifier
// imzasına sahip düz-domain kuralları TEK bir kuralda toplanır — binlerce domain
// tek `requestDomains` dizisinde. Böylece 45k+ düz kural düzine mertebesine iner
// ve 30k statik kota rahat aşılmaz.
//
// ID'ler her shard içinde 1'den başlar (DNR statik ruleset id namespace'i shard-yerel).

import { buildCondition, computePriority } from '../../src/lib/dnrRuleBuilder';
import type { DnrRule, DnrRuleCondition } from '../../src/lib/dnrRuleBuilder';
import type { NetworkRuleAst } from '../../src/lib/filterParser';
import { SHARD_MAX_RULES, SHARD_MAX_REGEX_RULES } from '../../src/lib/constants';

export interface Shard {
  id: string; // örn. 'easylist-0'
  rules: DnrRule[];
  regexCount: number;
}

export interface NetworkCompileResult {
  shards: Shard[];
  stats: {
    inputRules: number;
    skipped: number; // kondisyon üretilemeyen
    plainDomainRules: number; // toplanmadan önceki düz-domain kural sayısı
    batchedRules: number; // toplama sonrası kural sayısı
    urlFilterRules: number;
    regexRules: number;
    emitted: number; // toplam üretilen DNR kuralı
  };
}

// Toplanmayı bekleyen ya da tekil çıkacak, id atanmamış ara kural.
interface PendingRule {
  condition: DnrRuleCondition;
  priority: number;
  actionType: 'block' | 'allow';
  isRegex: boolean;
}

export function compileNetworkRules(
  nodes: NetworkRuleAst[],
  listId: string,
): NetworkCompileResult {
  const stats = {
    inputRules: nodes.length,
    skipped: 0,
    plainDomainRules: 0,
    batchedRules: 0,
    urlFilterRules: 0,
    regexRules: 0,
    emitted: 0,
  };

  // İmzaya göre domain toplayan gruplar + tekil kurallar
  const groups = new Map<
    string,
    { template: DnrRuleCondition; priority: number; actionType: 'block' | 'allow'; domains: Set<string> }
  >();
  const individual: PendingRule[] = [];

  for (const node of nodes) {
    const condition = buildCondition(node);
    if (condition === null) {
      stats.skipped++;
      continue;
    }
    const actionType: 'block' | 'allow' = node.isException ? 'allow' : 'block';
    const priority = computePriority(node);

    // Tek-domainli requestDomains koşulu -> toplanabilir
    if (
      condition.requestDomains !== undefined &&
      condition.urlFilter === undefined &&
      condition.regexFilter === undefined
    ) {
      stats.plainDomainRules++;
      const { key, template } = signatureOf(condition, actionType, priority);
      let g = groups.get(key);
      if (!g) {
        g = { template, priority, actionType, domains: new Set() };
        groups.set(key, g);
      }
      for (const d of condition.requestDomains) g.domains.add(d);
      continue;
    }

    if (condition.regexFilter !== undefined) stats.regexRules++;
    else stats.urlFilterRules++;
    individual.push({ condition, priority, actionType, isRegex: condition.regexFilter !== undefined });
  }

  // Grupları tek kurala indir
  const pending: PendingRule[] = [];
  for (const g of groups.values()) {
    const condition: DnrRuleCondition = { ...g.template, requestDomains: [...g.domains].sort() };
    pending.push({ condition, priority: g.priority, actionType: g.actionType, isRegex: false });
    stats.batchedRules++;
  }
  // Tekiller sonra (urlFilter/regex daha spesifik; sıralama önem taşımaz ama düzenli)
  pending.push(...individual);

  // Shard'la ve id ata
  const shards: Shard[] = [];
  let shard = newShard(listId, 0);
  shards.push(shard);
  for (const p of pending) {
    if (
      shard.rules.length >= SHARD_MAX_RULES ||
      (p.isRegex && shard.regexCount >= SHARD_MAX_REGEX_RULES)
    ) {
      shard = newShard(listId, shards.length);
      shards.push(shard);
    }
    shard.rules.push({
      id: shard.rules.length + 1,
      priority: p.priority,
      action: { type: p.actionType },
      condition: p.condition,
    });
    if (p.isRegex) shard.regexCount++;
    stats.emitted++;
  }

  return { shards: shards.filter((s) => s.rules.length > 0), stats };
}

// requestDomains dışındaki tüm alanlardan kararlı bir imza (+ kanonik template).
function signatureOf(
  condition: DnrRuleCondition,
  actionType: 'block' | 'allow',
  priority: number,
): { key: string; template: DnrRuleCondition } {
  const template: DnrRuleCondition = {};
  if (condition.domainType !== undefined) template.domainType = condition.domainType;
  if (condition.resourceTypes) template.resourceTypes = [...condition.resourceTypes].sort();
  if (condition.excludedResourceTypes)
    template.excludedResourceTypes = [...condition.excludedResourceTypes].sort();
  if (condition.initiatorDomains) template.initiatorDomains = [...condition.initiatorDomains].sort();
  if (condition.excludedInitiatorDomains)
    template.excludedInitiatorDomains = [...condition.excludedInitiatorDomains].sort();
  const key = JSON.stringify([actionType, priority, template]);
  return { key, template };
}

function newShard(listId: string, index: number): Shard {
  return { id: `${listId}-${index}`, rules: [], regexCount: 0 };
}
