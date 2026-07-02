// Upstream filtre listesi metnini indirir ve tools/compiler/.cache altına
// ham kopyasını yazar. (Uzaktan KOD değil, VERİ çekiyoruz — MV3 uyumlu.)
//
// CACHE-ÖNCELİKLİ: Bir liste daha önce başarıyla inip cache'e yazıldıysa, tekrar
// çalıştırmada ağdan çekilmez — cache'ten okunur. Sebep: Node/undici bazı ağlarda
// rastgele SÜREÇ-SEVİYESİ ERR_ASSERTION ile çöküyor (try/catch yakalayamıyor).
// Cache sayesinde bir çökme sonrası yeniden çalıştırınca kalınan yerden devam edilir;
// birkaç denemede tüm listeler cache'lenir ve sonraki derlemeler anında olur.
// Taze indirme için: FRESH=1 npm run compile-filters

import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const CACHE_DIR = fileURLToPath(new URL('./.cache', import.meta.url));
const FORCE_FRESH = process.env.FRESH === '1';

export interface FetchedList {
  id: string;
  text: string;
  bytes: number;
  fetchedAt: string; // ISO
  fromCache: boolean;
}

export async function fetchList(id: string, url: string): Promise<FetchedList> {
  const cachePath = join(CACHE_DIR, `${id}.txt`);

  if (!FORCE_FRESH) {
    const cached = await readCache(cachePath);
    if (cached !== null) {
      return {
        id,
        text: cached,
        bytes: Buffer.byteLength(cached, 'utf8'),
        fetchedAt: new Date().toISOString(),
        fromCache: true,
      };
    }
  }

  const text = await fetchTextWithRetry(id, url, 3);
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cachePath, text, 'utf8');

  return {
    id,
    text,
    bytes: Buffer.byteLength(text, 'utf8'),
    fetchedAt: new Date().toISOString(),
    fromCache: false,
  };
}

async function readCache(path: string): Promise<string | null> {
  try {
    await stat(path);
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

// Geçici (yakalanabilir) ağ hatalarına karşı birkaç deneme.
async function fetchTextWithRetry(
  id: string,
  url: string,
  attempts: number,
): Promise<string> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'fair-block-compiler/0.1 (+personal)' },
        redirect: 'follow',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
      if (i < attempts) {
        const wait = 500 * i;
        process.stdout.write(`(deneme ${i} başarısız, ${wait}ms sonra tekrar) `);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw new Error(
    `${id}: ${attempts} denemede indirilemedi — ${url}\n  ${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`,
  );
}
