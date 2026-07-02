// Hakkında: sürüm + filtre listesi atıf/lisansları (listMeta'dan dinamik).

import { loadListMeta } from '../../lib/listMeta';

export async function renderAboutTab(container: HTMLElement): Promise<void> {
  const version = chrome.runtime.getManifest().version;
  const meta = await loadListMeta();

  const card = document.createElement('div');
  card.className = 'card';
  const rows = meta
    .map((m) => `<li><strong>${m.name}</strong> — <span class="muted">${m.license}</span></li>`)
    .join('');
  card.innerHTML = `
    <h2>fair-block</h2>
    <p class="muted">Sürüm ${version} — kişisel MV3 reklam/izleyici engelleyici.</p>
    <p class="muted">Ağ engelleme + kozmetik + scriptlet + iki-kademeli güncelleme (statik derleme + runtime abonelik).</p>
    <h3>Filtre listeleri</h3>
    <ul>${rows || '<li class="muted">Liste yok — önce derleyin.</li>'}</ul>
    <h3>Mimari referans</h3>
    <p class="muted">uBlock Origin Lite (GPLv3) — yalnız yöntem/mimari referans alındı; kod kopyalanmadı. AdGuard/eyeo derleme motorları kullanılmadı.</p>
  `;
  container.appendChild(card);
}
