// YouTube reklamlarını oynatıcı seviyesinde işler (filtreyle güvenilir engellenemez).
// Mod:
//   'speed' (fair): reklam 16x + sessiz OYNAR -> impression sayılır, üretici kazanır, ~1 sn kayıp
//   'skip': reklamı sona sarar / skip'e basar -> pratikte atlanır
//   'off': dokunmaz
// Kısayol Alt+S: o anki reklamı hemen atla.
//
// YouTube bir SPA olduğundan tam navigasyon olayına güvenilemez -> kalıcı interval + DOM.
// Isolated world yeterli: playbackRate/muted/class/skip hepsi paylaşılan DOM.

import { getSettings, onSettingsChanged } from '../../lib/storage';
import { shouldApplyOnSite } from '../../lib/siteMatch';
import type { FairBlockSettings, YouTubeAdMode } from '../../lib/types';

let mode: YouTubeAdMode = 'speed';
let siteActive = true;
let weMuted = false;
let weSped = false;

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

function adShowing(): boolean {
  const p = document.querySelector('.html5-video-player');
  return (
    !!p &&
    (p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting'))
  );
}

function skipButton(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    '.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button',
  );
}

function seekToEnd(v: HTMLVideoElement): void {
  if (Number.isFinite(v.duration) && v.duration > 0) v.currentTime = v.duration;
}

function tick(): void {
  const video = mainVideo();
  if (!video) return;

  if (!siteActive || mode === 'off') {
    restore(video);
    return;
  }

  if (adShowing()) {
    const btn = skipButton();
    if (btn) {
      btn.click(); // skip mevcutsa her modda bas (en temiz)
      return;
    }
    if (mode === 'skip') {
      seekToEnd(video);
    } else {
      // speed (fair): reklam oynar ama hızlı ve sessiz
      if (!video.muted) {
        video.muted = true;
        weMuted = true;
      }
      if (video.playbackRate < 16) {
        video.playbackRate = 16;
        weSped = true;
      }
    }
  } else {
    restore(video);
  }
}

function restore(video: HTMLVideoElement): void {
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
  const btn = skipButton();
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
