// Filtreler sekmesi: curated statik listeler (aç/kapa + son güncelleme) ve
// kullanıcı abonelikleri (ekle/yenile/sil).

import { sendMessage } from '../../lib/messages';
import { loadListMeta, isListEnabled } from '../../lib/listMeta';
import type { FairBlockSettings } from '../../lib/types';

export async function renderFiltersTab(container: HTMLElement): Promise<void> {
  const [metaList, settingsRes] = await Promise.all([
    loadListMeta(),
    sendMessage<FairBlockSettings>({ type: 'GET_SETTINGS' }),
  ]);
  if (!settingsRes.ok) {
    container.innerHTML = `<div class="card"><p class="muted">Ayarlar alınamadı: ${settingsRes.error}</p></div>`;
    return;
  }
  const s = settingsRes.data;

  // --- Statik listeler ---
  const listCard = document.createElement('div');
  listCard.className = 'card';
  listCard.innerHTML = '<h2>Filtre Listeleri</h2>';
  for (const meta of metaList) {
    const row = document.createElement('label');
    row.className = 'row';
    const info = document.createElement('span');
    const updated = meta.fetchedAt
      ? new Date(meta.fetchedAt).toLocaleDateString('tr-TR')
      : '—';
    info.innerHTML = `<strong>${meta.name}</strong> <span class="muted">(${meta.category})</span><br><span class="muted">${meta.ruleCount.toLocaleString('tr-TR')} kural · güncelleme ${updated}</span>`;
    const sw = document.createElement('label');
    sw.className = 'switch';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = isListEnabled(meta, s.sourceListToggles);
    input.addEventListener('change', () => {
      void sendMessage({
        type: 'SET_SOURCE_TOGGLE',
        listId: meta.id,
        enabled: input.checked,
      }).then((r) => {
        if (!r.ok) {
          alert(r.error);
          input.checked = !input.checked;
        }
      });
    });
    const slider = document.createElement('span');
    slider.className = 'switch__slider';
    sw.append(input, slider);
    row.append(info, sw);
    listCard.appendChild(row);
  }
  container.appendChild(listCard);

  // --- Abonelikler ---
  const subCard = document.createElement('div');
  subCard.className = 'card';
  subCard.innerHTML =
    '<h2>Abonelikler</h2><p class="muted">Kendi filtre listesi URL’lerin (runtime’da indirilir, aynı motorla işlenir).</p>';

  const addRow = document.createElement('div');
  addRow.className = 'add-row';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'Ad (opsiyonel)';
  nameInput.style.flex = '0 0 130px';
  const urlInput = document.createElement('input');
  urlInput.type = 'text';
  urlInput.placeholder = 'https://…/liste.txt';
  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn--primary';
  addBtn.textContent = 'Ekle';
  addBtn.addEventListener('click', () => {
    addBtn.disabled = true;
    addBtn.textContent = 'İndiriliyor…';
    void sendMessage({
      type: 'ADD_SUBSCRIPTION',
      url: urlInput.value,
      name: nameInput.value,
    }).then((r) => {
      if (!r.ok) alert(r.error);
      void renderFiltersTab(container);
    });
  });
  addRow.append(nameInput, urlInput, addBtn);
  subCard.appendChild(addRow);

  if (s.subscriptions.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'Henüz abonelik yok.';
    subCard.appendChild(empty);
  } else {
    const list = document.createElement('ul');
    list.className = 'entry-list';
    for (const sub of s.subscriptions) {
      const li = document.createElement('li');
      li.className = 'entry';
      const info = document.createElement('span');
      const last = sub.lastFetchedAt
        ? new Date(sub.lastFetchedAt).toLocaleString('tr-TR')
        : '—';
      info.innerHTML = `<strong>${sub.name}</strong><br><span class="muted">${sub.lastRuleCount.toLocaleString('tr-TR')} kural · ${last}</span>`;
      const btns = document.createElement('span');
      const refresh = document.createElement('button');
      refresh.className = 'btn btn--ghost';
      refresh.textContent = 'Yenile';
      refresh.addEventListener('click', () => {
        void sendMessage({ type: 'REFRESH_SUBSCRIPTION', id: sub.id }).then((r) => {
          if (!r.ok) alert(r.error);
          void renderFiltersTab(container);
        });
      });
      const remove = document.createElement('button');
      remove.className = 'btn btn--ghost';
      remove.textContent = 'Sil';
      remove.style.marginLeft = '6px';
      remove.addEventListener('click', () => {
        void sendMessage({ type: 'REMOVE_SUBSCRIPTION', id: sub.id }).then(() =>
          renderFiltersTab(container),
        );
      });
      btns.append(refresh, remove);
      li.append(info, btns);
      list.appendChild(li);
    }
    subCard.appendChild(list);
  }
  container.appendChild(subCard);
}
