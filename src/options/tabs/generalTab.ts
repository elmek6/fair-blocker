// Genel ayarlar: genel aç/kapa, kozmetik filtreleme, mutation watcher,
// varsayılan duraklat süresi. Hepsi background üzerinden kalıcı.

import { sendMessage } from '../../lib/messages';
import type { FairBlockSettings, YouTubeAdMode } from '../../lib/types';

export async function renderGeneralTab(container: HTMLElement): Promise<void> {
  const res = await sendMessage<FairBlockSettings>({ type: 'GET_SETTINGS' });
  if (!res.ok) {
    container.innerHTML = `<div class="card"><p class="muted">Ayarlar alınamadı: ${res.error}</p></div>`;
    return;
  }
  const s = res.data;

  // Fair-ad seviye kartı
  container.appendChild(renderFairAdCard(s.fairAdLevel));

  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = '<h2>Genel</h2>';

  card.appendChild(
    toggleRow('Engellemeyi etkinleştir', s.globalEnabled, (v) =>
      patch({ globalEnabled: v }),
    ),
  );
  card.appendChild(
    toggleRow('Kozmetik filtreleme (boş reklam kutularını gizle)', s.cosmeticEnabled, (v) =>
      patch({ cosmeticEnabled: v }),
    ),
  );
  card.appendChild(
    toggleRow(
      'Mutation watcher (SPA/geç yüklenen içerik — performans maliyetli)',
      s.cosmeticMutationWatcherEnabled,
      (v) => patch({ cosmeticMutationWatcherEnabled: v }),
    ),
  );

  card.appendChild(
    selectRow(
      'Varsayılan duraklatma süresi',
      [
        { label: '15 dakika', value: String(15 * 60 * 1000) },
        { label: '1 saat', value: String(60 * 60 * 1000) },
        { label: '24 saat', value: String(24 * 60 * 60 * 1000) },
      ],
      String(s.defaultPauseDurationMs),
      (v) => patch({ defaultPauseDurationMs: Number(v) }),
    ),
  );

  container.appendChild(card);
  container.appendChild(renderYouTubeCard(s));
}

async function patch(p: Partial<FairBlockSettings>): Promise<void> {
  await sendMessage({ type: 'PATCH_SETTINGS', patch: p });
}

function renderYouTubeCard(s: FairBlockSettings): HTMLElement {
  const current = s.youtubeAdMode;
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML =
    '<h2>YouTube</h2><p class="muted">YouTube reklamları filtreyle güvenilir engellenemez; oynatıcıda işlenir. ' +
    '<strong>Butonla hızlandır</strong> (fair, önerilen): reklam normal başlar, player\'da çıkan '
    + '"⏩ Reklamı hızlı geç" butonuna basınca sessiz + 16x oynar (impression sayılır). ' +
    'Otomatik hızlandır: her reklamı kendiliğinden hızlandırır (tespit riski daha yüksek). ' +
    'Atla: reklamı sona sarar. Kısayol: <strong>Alt+S</strong> o anki reklamı atlar.</p>';
  const opts: { v: YouTubeAdMode; label: string }[] = [
    { v: 'off', label: 'Kapalı' },
    { v: 'button', label: 'Butonla hızlandır (fair)' },
    { v: 'autospeed', label: 'Otomatik hızlandır' },
    { v: 'skip', label: 'Atla' },
  ];
  const seg = document.createElement('div');
  seg.className = 'segment';
  for (const o of opts) {
    const b = document.createElement('button');
    b.className = 'segment__btn' + (o.v === current ? ' active' : '');
    b.textContent = o.label;
    b.addEventListener('click', () => {
      void patch({ youtubeAdMode: o.v }).then(() => {
        seg.querySelectorAll('.segment__btn').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
      });
    });
    seg.appendChild(b);
  }
  card.appendChild(seg);

  card.appendChild(
    toggleRow(
      'YouTube\'u engelleme katmanlarından muaf tut (önerilen — "ad blocker tespit edildi" uyarısını önler)',
      s.youtubeExempt,
      (v) => patch({ youtubeExempt: v }),
    ),
  );
  const note = document.createElement('p');
  note.className = 'muted';
  note.textContent =
    'Muafiyet kapatılırsa filtre listeleri YouTube reklam isteklerini/adPlacements verisini ' +
    'engeller; YouTube bunu tespit edip oynatmayı kilitleyebilir.';
  card.appendChild(note);
  return card;
}

const FAIR_AD_LEVELS = [
  { level: 0, label: 'Kapalı', desc: 'Hiçbir reklam — tam engelleme (varsayılan)' },
  { level: 1, label: 'Kabul edilebilir', desc: 'Rahatsız etmeyen reklamlar geçer; gerisi engellenir' },
  { level: 2, label: 'First-party', desc: 'Reklam ağı bloğu kapalı; izleyici/güvenlik/kozmetik açık' },
  { level: 3, label: 'Sadece izleyici', desc: 'Yalnız izleyici + zararlı engellenir; kozmetik/scriptlet kapalı' },
];

function renderFairAdCard(current: number): HTMLElement {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML =
    '<h2>İzin verilen reklam (fair-ad)</h2><p class="muted">Ne kadar reklama izin verileceğini belirler. 0 = hiçbiri.</p>';

  const seg = document.createElement('div');
  seg.className = 'segment';
  const descEl = document.createElement('p');
  descEl.className = 'muted';

  for (const opt of FAIR_AD_LEVELS) {
    const b = document.createElement('button');
    b.className = 'segment__btn' + (opt.level === current ? ' active' : '');
    b.textContent = `${opt.level} · ${opt.label}`;
    b.addEventListener('click', () => {
      void sendMessage({ type: 'SET_FAIR_AD_LEVEL', level: opt.level }).then((r) => {
        if (!r.ok) {
          alert(r.error);
          return;
        }
        seg.querySelectorAll('.segment__btn').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        descEl.textContent = opt.desc;
      });
    });
    seg.appendChild(b);
  }
  descEl.textContent = FAIR_AD_LEVELS[current]?.desc ?? '';
  card.append(seg, descEl);
  return card;
}

function toggleRow(
  label: string,
  checked: boolean,
  onChange: (v: boolean) => void,
): HTMLElement {
  const row = document.createElement('label');
  row.className = 'row';
  const span = document.createElement('span');
  span.textContent = label;
  const sw = document.createElement('label');
  sw.className = 'switch';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  const slider = document.createElement('span');
  slider.className = 'switch__slider';
  sw.append(input, slider);
  row.append(span, sw);
  return row;
}

function selectRow(
  label: string,
  options: { label: string; value: string }[],
  selected: string,
  onChange: (v: string) => void,
): HTMLElement {
  const row = document.createElement('label');
  row.className = 'row';
  const span = document.createElement('span');
  span.textContent = label;
  const sel = document.createElement('select');
  for (const o of options) {
    const opt = document.createElement('option');
    opt.value = o.value;
    opt.textContent = o.label;
    if (o.value === selected) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => onChange(sel.value));
  row.append(span, sel);
  return row;
}
