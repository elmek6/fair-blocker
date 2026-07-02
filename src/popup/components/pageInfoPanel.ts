// "Bu Sayfa" görünümü: bu sekmede engellenen isteklerin canlı listesi
// (debug/info). Faz 3'te her satır interaktif olacak (whitelist/blacklist/kopyala).

import type { PageMatch } from '../../lib/messages';

export function renderPageMatches(
  container: HTMLElement,
  matches: PageMatch[],
): void {
  container.innerHTML = '';

  if (matches.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'Bu sayfada henüz eşleşme yok.';
    container.appendChild(empty);
    return;
  }

  const list = document.createElement('ul');
  list.className = 'match-list';
  // En yeni üstte
  for (const m of [...matches].reverse()) {
    const li = document.createElement('li');
    li.className = 'match';

    const dom = document.createElement('span');
    dom.className = 'match__domain';
    dom.textContent = m.domain;
    dom.title = m.url;

    const meta = document.createElement('span');
    meta.className = 'match__meta';
    meta.textContent = `${m.type} · ${m.rulesetId}`;

    li.append(dom, meta);
    list.appendChild(li);
  }
  container.appendChild(list);
}
