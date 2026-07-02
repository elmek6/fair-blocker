// "Eylemler" görünümü: hostname, engellenen sayısı, duraklat ve "bu domaini
// serbest bırak" (whitelist). Eylemler background'a gider; sonuç sonrası main
// durumu yeniden çeker.

import type { SiteState } from '../../lib/messages';

export interface SiteActions {
  onToggleWhitelist: (domain: string) => void;
  onPause: (domain: string, durationMs: number | null) => void;
  onUnpause: (domain: string) => void;
}

export function renderSiteStatus(
  container: HTMLElement,
  state: SiteState,
  actions: SiteActions,
): void {
  container.innerHTML = '';

  const host = document.createElement('div');
  host.className = 'site-host';
  host.textContent = state.hostname || '(bu sayfa desteklenmiyor)';
  container.appendChild(host);

  if (!state.hostname) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'Bu sayfada eylem yapılamaz.';
    container.appendChild(p);
    return;
  }

  const count = document.createElement('div');
  count.className = 'site-count';
  count.innerHTML = `<strong>${state.blockedCount}</strong> istek bu sayfada engellendi`;
  container.appendChild(count);

  const badges = document.createElement('div');
  badges.className = 'site-badges';
  if (!state.globalEnabled) badges.appendChild(pill('Genel kapalı', 'warn'));
  if (state.isWhitelisted) badges.appendChild(pill('Beyaz listede', 'info'));
  if (state.isPaused) badges.appendChild(pill('Duraklatıldı', 'info'));
  if (badges.childElementCount > 0) container.appendChild(badges);

  const domain = state.hostname;

  // Whitelist toggle
  const wl = button(
    state.isWhitelisted ? 'Serbest bırakmayı kaldır' : 'Bu domaini serbest bırak',
    state.isWhitelisted ? 'ghost' : 'primary',
  );
  wl.addEventListener('click', () => actions.onToggleWhitelist(domain));
  container.appendChild(wl);

  // Pause / devam
  const pauseWrap = document.createElement('div');
  pauseWrap.className = 'pause-row';
  if (state.isPaused) {
    const resume = button('Devam ettir', 'ghost');
    resume.addEventListener('click', () => actions.onUnpause(domain));
    pauseWrap.appendChild(resume);
  } else {
    pauseWrap.appendChild(pauseBtn('1 saat', 60 * 60 * 1000, domain, actions));
    pauseWrap.appendChild(pauseBtn('24 saat', 24 * 60 * 60 * 1000, domain, actions));
    pauseWrap.appendChild(pauseBtn('Restart’a dek', null, domain, actions));
  }
  container.appendChild(pauseWrap);
}

function pauseBtn(
  label: string,
  durationMs: number | null,
  domain: string,
  actions: SiteActions,
): HTMLElement {
  const b = button(label, 'ghost');
  b.classList.add('pause-btn');
  b.addEventListener('click', () => actions.onPause(domain, durationMs));
  return b;
}

function button(label: string, kind: 'primary' | 'ghost'): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = `btn btn--${kind}`;
  b.textContent = label;
  return b;
}

function pill(text: string, kind: 'warn' | 'info'): HTMLElement {
  const el = document.createElement('span');
  el.className = `pill pill--${kind}`;
  el.textContent = text;
  return el;
}
