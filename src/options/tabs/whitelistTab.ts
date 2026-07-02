// Beyaz liste yönetimi: her zaman serbest bırakılan domainler. Ekle/sil.

import { sendMessage } from '../../lib/messages';
import type { FairBlockSettings } from '../../lib/types';

export async function renderWhitelistTab(container: HTMLElement): Promise<void> {
  const res = await sendMessage<FairBlockSettings>({ type: 'GET_SETTINGS' });
  if (!res.ok) {
    container.innerHTML = `<div class="card"><p class="muted">Ayarlar alınamadı: ${res.error}</p></div>`;
    return;
  }
  const s = res.data;

  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = '<h2>Beyaz Liste</h2><p class="muted">Bu domainlerde hiçbir şey engellenmez (alt alan adları dahil).</p>';

  // Ekleme satırı
  const addRow = document.createElement('div');
  addRow.className = 'add-row';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'örn. example.com';
  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn--primary';
  addBtn.textContent = 'Ekle';
  const doAdd = async (): Promise<void> => {
    const domain = input.value.trim();
    if (!domain) return;
    const r = await sendMessage({ type: 'TOGGLE_WHITELIST', domain });
    if (!r.ok) {
      alert(r.error);
      return;
    }
    input.value = '';
    await renderWhitelistTab(container);
  };
  addBtn.addEventListener('click', () => void doAdd());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void doAdd();
  });
  addRow.append(input, addBtn);
  card.appendChild(addRow);

  // Liste
  if (s.whitelist.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'Henüz domain yok.';
    card.appendChild(empty);
  } else {
    const list = document.createElement('ul');
    list.className = 'entry-list';
    for (const e of [...s.whitelist].sort((a, b) => a.domain.localeCompare(b.domain))) {
      const li = document.createElement('li');
      li.className = 'entry';
      const name = document.createElement('span');
      name.textContent = e.domain;
      const rm = document.createElement('button');
      rm.className = 'btn btn--ghost';
      rm.textContent = 'Kaldır';
      rm.addEventListener('click', () => {
        void sendMessage({ type: 'TOGGLE_WHITELIST', domain: e.domain }).then(() =>
          renderWhitelistTab(container),
        );
      });
      li.append(name, rm);
      list.appendChild(li);
    }
    card.appendChild(list);
  }

  container.appendChild(card);
}
