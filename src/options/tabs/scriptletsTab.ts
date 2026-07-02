// Scriptlet toggle listesi: katalogtaki her scriptlet ayrı aç/kapa. Varsayılan
// açık; kullanıcı kapatırsa scriptletEnabled[id]=false yazılır.

import { sendMessage } from '../../lib/messages';
import type { FairBlockSettings } from '../../lib/types';
import { SCRIPTLET_META } from '../../content/scriptlets/catalog/index';

export async function renderScriptletsTab(container: HTMLElement): Promise<void> {
  const res = await sendMessage<FairBlockSettings>({ type: 'GET_SETTINGS' });
  if (!res.ok) {
    container.innerHTML = `<div class="card"><p class="muted">Ayarlar alınamadı: ${res.error}</p></div>`;
    return;
  }
  const enabledMap = res.data.scriptletSettings.scriptletEnabled;

  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML =
    '<h2>Scriptlet</h2><p class="muted">Anti-adblock ve izleyici karşı-önlemleri. Her biri ayrı açılıp kapatılabilir (varsayılan: açık).</p>';

  for (const meta of SCRIPTLET_META) {
    const checked = enabledMap[meta.id] !== false;
    const row = document.createElement('label');
    row.className = 'row';
    const label = document.createElement('span');
    label.innerHTML = `<strong>${meta.id}</strong><br><span class="muted">${meta.description}</span>`;
    const sw = document.createElement('label');
    sw.className = 'switch';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.addEventListener('change', () =>
      setScriptlet(meta.id, input.checked, enabledMap),
    );
    const slider = document.createElement('span');
    slider.className = 'switch__slider';
    sw.append(input, slider);
    row.append(label, sw);
    card.appendChild(row);
  }

  container.appendChild(card);
}

async function setScriptlet(
  id: string,
  enabled: boolean,
  currentMap: Record<string, boolean>,
): Promise<void> {
  // Varsayılan açık olduğundan: açıksa anahtarı sil, kapalıysa false yaz.
  const nextMap = { ...currentMap };
  if (enabled) delete nextMap[id];
  else nextMap[id] = false;
  await sendMessage({
    type: 'PATCH_SETTINGS',
    patch: { scriptletSettings: { listEnabled: {}, scriptletEnabled: nextMap } },
  });
}
