// YouTube reklamlarını oynatıcı seviyesinde işler (filtreyle güvenilir engellenemez;
// ağ/kozmetik/scriptlet katmanları youtubeExempt ile muaf — anti-adblock tespiti önlenir).
// Mod:
//   'button' (fair, varsayılan): reklam NORMAL oynar; player'da "⏩ Hızlı geç" butonu
//       belirir. Basılırsa o reklam arası sessiz + hızlı oynar (impression yine sayılır).
//   'autospeed': her reklamı otomatik hızlı + sessiz oynatır (tespit riski daha yüksek).
//   'skip': reklamı sona sarar / skip'e basar -> pratikte atlanır.
//   'off': dokunmaz.
// Kısayol Alt+S: o anki reklamı hemen atla.
//
// Tespit notları: skip butonuna yalnız GÖRÜNÜR olduğunda basılır (görünmeden
// programatik tık = bot sinyali); hızlandırma 'button' modunda kullanıcı jestiyle
// başlar, ilk reklam izlenimi normal başladığı için zamanlama daha az şüpheli.
//
// YouTube bir SPA olduğundan tam navigasyon olayına güvenilemez -> kalıcı interval + DOM.
// Isolated world yeterli: playbackRate/muted/class/skip/overlay hepsi paylaşılan DOM.

import { getSettings, onSettingsChanged } from '../../lib/storage';
import { shouldApplyOnSite } from '../../lib/siteMatch';
import type { FairBlockSettings, YouTubeAdMode } from '../../lib/types';

const SPEED_RATE = 16;
const BTN_ID = 'fair-block-yt-skip';

let mode: YouTubeAdMode = 'button';
let siteActive = true;
let weMuted = false;
let weSped = false;
let engaged = false; // 'button' modunda: kullanıcı bu reklam arası için hızlandırmayı başlattı

function refreshState(s: FairBlockSettings): void {
  mode = s.youtubeAdMode;
  siteActive = s.globalEnabled && shouldApplyOnSite(s, location.hostname);
}

function mainVideo(): HTMLVideoElement | null {
  return (
    document.querySelector<HTMLVideoElement>('video.html5-main-video') ??
    document.querySelector<HTMLVideoElement>('video')
  );
}

function playerEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.html5-video-player');
}

function adShowing(): boolean {
  const p = playerEl();
  return (
    !!p &&
    (p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting'))
  );
}

// Skip butonu yalnız gerçekten görünür/tıklanabilirse döner (görünmezken
// programatik tıklama tespit sinyali üretebilir).
function visibleSkipButton(): HTMLElement | null {
  const btn = document.querySelector<HTMLElement>(
    '.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button',
  );
  return btn && btn.offsetWidth > 0 && btn.offsetHeight > 0 ? btn : null;
}

function seekToEnd(v: HTMLVideoElement): void {
  if (Number.isFinite(v.duration) && v.duration > 0) v.currentTime = v.duration;
}

function speedUp(video: HTMLVideoElement): void {
  if (!video.muted) {
    video.muted = true;
    weMuted = true;
  }
  if (video.playbackRate < SPEED_RATE) {
    video.playbackRate = SPEED_RATE;
    weSped = true;
  }
}

/* ------------------------------------------------------------------ *
 * Overlay buton ('button' modu): reklam sırasında player'a eklenir
 * ------------------------------------------------------------------ */
function ensureOverlay(): void {
  if (document.getElementById(BTN_ID)) return;
  const player = playerEl();
  if (!player) return;
  const btn = document.createElement('button');
  btn.id = BTN_ID;
  btn.type = 'button';
  btn.textContent = '⏩ Reklamı hızlı geç';
  btn.style.cssText =
    'position:absolute;right:12px;bottom:64px;z-index:9999;' +
    'padding:8px 14px;border:0;border-radius:18px;cursor:pointer;' +
    'background:rgba(0,0,0,.72);color:#fff;font:500 13px/1.2 Roboto,Arial,sans-serif;' +
    'opacity:.92;';
  btn.addEventListener('mouseenter', () => (btn.style.opacity = '1'));
  btn.addEventListener('mouseleave', () => (btn.style.opacity = '.92'));
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    engaged = true;
    const v = mainVideo();
    if (v && adShowing()) speedUp(v);
    btn.remove(); // görev tamam; reklam arası bitene dek engaged sürer
  });
  player.appendChild(btn);
}

function removeOverlay(): void {
  document.getElementById(BTN_ID)?.remove();
}

/* ------------------------------------------------------------------ *
 * Ana döngü
 * ------------------------------------------------------------------ */
function tick(): void {
  const video = mainVideo();
  if (!video) return;

  if (!siteActive || mode === 'off') {
    endAdBreak(video);
    return;
  }

  if (adShowing()) {
    if (mode === 'skip') {
      const btn = visibleSkipButton();
      if (btn) btn.click();
      else seekToEnd(video);
      return;
    }
    if (mode === 'button' && !engaged) {
      ensureOverlay();
      return; // reklam normal oynasın — fair
    }
    // autospeed veya kullanıcı butona bastı: hızlı + sessiz; skip çıkınca bas
    speedUp(video);
    visibleSkipButton()?.click();
  } else {
    endAdBreak(video);
  }
}

function endAdBreak(video: HTMLVideoElement): void {
  engaged = false;
  removeOverlay();
  if (weSped && video.playbackRate !== 1) video.playbackRate = 1;
  weSped = false;
  if (weMuted) {
    video.muted = false;
    weMuted = false;
  }
}

// Alt+S: o anki reklamı hemen atla (mod ne olursa olsun, kullanıcı isteğiyle).
function onKey(e: KeyboardEvent): void {
  if (!e.altKey || (e.key !== 's' && e.key !== 'S')) return;
  if (!siteActive) return;
  const v = mainVideo();
  if (!v || !adShowing()) return;
  const btn = visibleSkipButton();
  if (btn) btn.click();
  else seekToEnd(v);
}

async function init(): Promise<void> {
  refreshState(await getSettings());
  onSettingsChanged(refreshState);
  window.addEventListener('keydown', onKey, true);
  setInterval(tick, 300);
}

void init();
