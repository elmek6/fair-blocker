// Basit, deterministik FNV-1a 32-bit hash. Kozmetik specific kuralları
// hostname'e göre kovalara (shard) bölmek için compiler ve content script
// AYNI fonksiyonu kullanmalı.

export function fnv1a32(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export const COSMETIC_SHARD_COUNT = 16;

export function cosmeticShardOf(domain: string): number {
  return fnv1a32(domain) % COSMETIC_SHARD_COUNT;
}
