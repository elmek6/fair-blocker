// Popup orkestratörü: aktif sekmeyi al, site durumunu/eşleşmeleri getir,
// iki görünümü (Eylemler / Bu Sayfa) yönet, eylemleri background'a ilet.

import { sendMessage } from '../lib/messages';
import type { SiteState, PageMatch } from '../lib/messages';
import type { FairBlockSettings } from '../lib/types';
import { renderSiteStatus } from './components/siteStatus';
import type { SiteActions } from './components/siteStatus';
import { renderPageMatches } from './components/pageInfoPanel';

const viewActions = document.querySelector<HTMLElement>('#view-actions')!;
const viewPage = document.querySelector<HTMLElement>('#view-page')!;
const masterToggle = document.querySelector<HTMLInputElement>('#masterToggle')!;

let currentTabId = -1;
let currentUrl = '';

async function main(): Promise<void> {
  wireTabs();
  wireOptionsLink();
  wireMasterToggle();

  const tab = await getActiveTab();
  currentUrl = tab?.url ?? '';
  currentTabId = tab?.id ?? -1;

  await refresh();
}

const actions: SiteActions = {
  onToggleWhitelist: (domain) =>
    act({ type: 'TOGGLE_WHITELIST', domain }),
  onPause: (domain, durationMs) =>
    act({ type: 'PAUSE_SITE', domain, durationMs }),
  onUnpause: (domain) => act({ type: 'UNPAUSE_SITE', domain }),
};

async function act(msg: Parameters<typeof sendMessage>[0]): Promise<void> {
  const r = await sendMessage(msg);
  if (!r.ok) {
    alert(`İşlem başarısız: ${r.error}`);
    return;
  }
  await refresh();
}

async function refresh(): Promise<void> {
  const stateRes = await sendMessage<SiteState>({
    type: 'GET_SITE_STATE',
    tabId: currentTabId,
    url: currentUrl,
  });
  if (stateRes.ok) {
    renderSiteStatus(viewActions, stateRes.data, actions);
    masterToggle.checked = stateRes.data.globalEnabled;
  } else {
    viewActions.textContent = `Durum alınamadı: ${stateRes.error}`;
  }

  const matchesRes = await sendMessage<PageMatch[]>({
    type: 'GET_PAGE_MATCHES',
    tabId: currentTabId,
  });
  renderPageMatches(viewPage, matchesRes.ok ? matchesRes.data : []);
}

function wireMasterToggle(): void {
  masterToggle.addEventListener('change', () => {
    void sendMessage<FairBlockSettings>({
      type: 'PATCH_SETTINGS',
      patch: { globalEnabled: masterToggle.checked },
    }).then(async (r) => {
      if (!r.ok) masterToggle.checked = !masterToggle.checked;
      else await refresh();
    });
  });
}

function wireTabs(): void {
  const tabs = document.querySelectorAll<HTMLButtonElement>('#tabs .tab');
  tabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabs.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const view = btn.dataset.view;
      viewActions.hidden = view !== 'actions';
      viewPage.hidden = view !== 'page';
    });
  });
}

function wireOptionsLink(): void {
  document.querySelector('#openOptions')?.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
}

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

void main();
