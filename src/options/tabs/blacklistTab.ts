// Kara liste sekmesi: kullanıcının özel engelleme kuralları. Ham Adblock filtre
// satırı (veya düz domain) girilir; background parse edip DNR kuralına çevirir.

import { sendMessage } from '../../lib/messages';
import type { FairBlockSettings } from '../../lib/types';

export async function renderBlacklistTab(container: HTMLElement): Promise<void> {
  const res = await sendMessage<FairBlockSettings>({ type: 'GET_SETTINGS' });
  if (!res.ok) {
    container.innerHTML = `<div class="card"><p class="muted">Ayarlar alınamadı: ${res.error}</p></div>`;
    return;
  }
  const s = res.data;

  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML =
    '<h2>Kara Liste</h2><p class="muted">Özel engelleme kuralları. Düz domain (örn. <code>reklam.com</code>) ya da Adblock sözdizimi (örn. <code>||site.com/ads/*$script</code>).</p>';

  const addRow = document.createElement('div');
  addRow.className = 'add-row';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'reklam.com  veya  ||site.com/ads/*';
  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn--primary';
  addBtn.textContent = 'Ekle';
  const doAdd = async (): Promise<void> => {
    if (!input.value.trim()) return;
    const r = await sendMessage({ type: 'ADD_BLACKLIST', rawFilterText: input.value });
    if (!r.ok) {
      alert(r.error);
      return;
    }
    input.value = '';
    await renderBlacklistTab(container);
  };
  addBtn.addEventListener('click', () => void doAdd());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void doAdd();
  });
  addRow.append(input, addBtn);
  card.appendChild(addRow);

  if (s.customBlacklist.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'Henüz kural yok.';
    card.appendChild(empty);
  } else {
    const list = document.createElement('ul');
    list.className = 'entry-list';
    for (const e of s.customBlacklist) {
      const li = document.createElement('li');
      li.className = 'entry';
      const code = document.createElement('code');
      code.textContent = e.rawFilterText;
      const rm = document.createElement('button');
      rm.className = 'btn btn--ghost';
      rm.textContent = 'Kaldır';
      rm.addEventListener('click', () => {
        void sendMessage({
          type: 'REMOVE_BLACKLIST',
          rawFilterText: e.rawFilterText,
        }).then(() => renderBlacklistTab(container));
      });
      li.append(code, rm);
      list.appendChild(li);
    }
    card.appendChild(list);
  }

  container.appendChild(card);
}
