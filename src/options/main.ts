// Options hash-router (framework yok). Her sekme bir render(container) fonksiyonu.

import { renderGeneralTab } from './tabs/generalTab';
import { renderFiltersTab } from './tabs/filtersTab';
import { renderWhitelistTab } from './tabs/whitelistTab';
import { renderBlacklistTab } from './tabs/blacklistTab';
import { renderScriptletsTab } from './tabs/scriptletsTab';
import { renderAboutTab } from './tabs/aboutTab';

type TabRenderer = (container: HTMLElement) => void | Promise<void>;

interface TabDef {
  id: string;
  label: string;
  render: TabRenderer;
}

const TABS: TabDef[] = [
  { id: 'general', label: 'Genel', render: renderGeneralTab },
  { id: 'filters', label: 'Filtreler', render: renderFiltersTab },
  { id: 'whitelist', label: 'Beyaz Liste', render: renderWhitelistTab },
  { id: 'blacklist', label: 'Kara Liste', render: renderBlacklistTab },
  { id: 'scriptlets', label: 'Scriptlet', render: renderScriptletsTab },
  { id: 'about', label: 'Hakkında', render: renderAboutTab },
];

const nav = document.querySelector<HTMLElement>('#nav')!;
const content = document.querySelector<HTMLElement>('#content')!;

function buildNav(): void {
  nav.innerHTML = '';
  for (const tab of TABS) {
    const a = document.createElement('a');
    a.href = `#${tab.id}`;
    a.textContent = tab.label;
    a.dataset.id = tab.id;
    nav.appendChild(a);
  }
}

function currentTabId(): string {
  const id = location.hash.replace(/^#/, '');
  return TABS.some((t) => t.id === id) ? id : TABS[0].id;
}

async function route(): Promise<void> {
  const id = currentTabId();
  nav.querySelectorAll('a').forEach((a) => {
    a.classList.toggle('active', a.dataset.id === id);
  });
  const tab = TABS.find((t) => t.id === id)!;
  content.innerHTML = '';
  await tab.render(content);
}

buildNav();
window.addEventListener('hashchange', () => void route());
void route();
