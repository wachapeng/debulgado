// View: the app frame — sidebar on laptops, top bar + bottom tabs on phones — and the sync badge.
import { esc, timeAgo } from '../core/format.js';
import { ICON } from '../core/ui.js';

export function shellHtml(screens, shop) {
  const links = cls => Object.entries(screens).map(([k, s]) => `<a href="#/${k}" data-nav="${k}" class="${cls}">${ICON[s.icon]}<span>${esc(cls === 'tab' ? s.short : s.label)}</span></a>`).join('');
  return `
  <header class="topbar"><img class="brand-mark" src="icons/icon.svg" alt=""><b data-shop-name>${esc(shop.shop_name)}</b><button class="sync" data-sync data-phase="idle"><i class="dot"></i><span></span></button></header>
  <aside class="side">
    <div class="brand"><img class="brand-mark" src="icons/icon.svg" alt=""><div><div class="brand-name" data-shop-name>${esc(shop.shop_name.replace(/ coffee shop/i, ''))}</div><div class="brand-sub">Coffee shop · POS</div></div></div>
    <nav class="nav" aria-label="Main">${links('')}</nav>
    <div class="side-foot"><button class="sync" data-sync data-phase="idle"><i class="dot"></i><span></span></button><div data-who></div></div>
  </aside>
  <main class="main">${Object.keys(screens).map(k => `<section class="screen hidden" data-screen="${k}" aria-label="${esc(screens[k].label)}"></section>`).join('')}</main>
  <nav class="tabbar" aria-label="Main">${links('tab')}</nav>`;
}

export function setActive(key) {
  document.querySelectorAll('[data-nav]').forEach(a => { const on = a.dataset.nav === key; a.classList.toggle('on', on); a.toggleAttribute('aria-current', on); });
  document.querySelectorAll('[data-screen]').forEach(s => s.classList.toggle('hidden', s.dataset.screen !== key));
}

export function syncText(s) {
  const n = s.pending, waiting = n ? `${n} to upload` : '';
  switch (s.phase) {
    case 'syncing': return 'Syncing…';
    case 'ok': return n ? `Online · ${waiting}` : `Synced ${timeAgo(s.lastSync)}`;
    case 'offline': return n ? `Offline · ${waiting}` : 'Offline · all saved';
    case 'signedout': return n ? `Signed out · ${waiting}` : 'Signed out · tap to sign in';
    case 'error': return 'Sync problem';
    default: return 'Starting…';
  }
}

export function updateSync(s) {
  const text = syncText(s);
  document.querySelectorAll('[data-sync]').forEach(b => {
    b.dataset.phase = s.phase;
    b.querySelector('span').textContent = text;
    b.title = s.error || text;
  });
}

export function updateWho(prefs, shop) {
  document.querySelectorAll('[data-shop-name]').forEach(el => { el.textContent = el.closest('.side') ? shop.shop_name.replace(/ coffee shop/i, '') : shop.shop_name; });
  const who = document.querySelector('[data-who]');
  if (who) who.innerHTML = `<b>${esc(prefs.deviceName)}</b>${prefs.prefix ? ` (${esc(prefs.prefix)})` : ''}${prefs.cashier ? ` · ${esc(prefs.cashier)}` : ''}`;
}
