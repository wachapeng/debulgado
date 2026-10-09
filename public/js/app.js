// App controller: loads the data, asks for sign-in the first time, draws the frame,
// switches screens and starts syncing. Screens are built once and then only shown or
// hidden, so nothing you picked gets reset.
import './core/install.js';
import { on } from './core/bus.js';
import { prefs } from './core/prefs.js';
import { keepData } from './core/db.js';
import { applyTheme, enableTooltips } from './core/ui.js';
import * as Menu from './models/MenuModel.js';
import * as Shop from './models/ShopModel.js';
import * as Sync from './services/SyncService.js';
import * as Layout from './views/LayoutView.js';
import * as Auth from './controllers/AuthController.js';
import * as Pos from './controllers/PosController.js';
import * as History from './controllers/HistoryController.js';
import * as Stats from './controllers/StatsController.js';
import * as MenuScreen from './controllers/MenuController.js';
import * as Settings from './controllers/SettingsController.js';
import * as OnlineOrders from './controllers/OnlineController.js';

const SCREENS = {
  pos: { label: 'POS / Billing', short: 'Order', icon: 'pos', ctl: Pos },
  history: { label: 'History', short: 'History', icon: 'history', ctl: History },
  stats: { label: 'Statistics', short: 'Stats', icon: 'stats', ctl: Stats },
  menu: { label: 'Menu', short: 'Menu', icon: 'menu', ctl: MenuScreen },
  settings: { label: 'Settings', short: 'Settings', icon: 'settings', ctl: Settings },
};
const mounted = new Set();
let current = null;

function route() {
  const key = location.hash.replace(/^#\/?/, '').split(/[?#/]/)[0] || 'pos';
  if (!SCREENS[key]) { location.replace('#/pos'); return; }
  if (key === current) return;
  if (current) SCREENS[current].ctl.hide();
  current = key;
  const section = document.querySelector(`[data-screen="${key}"]`);
  if (!mounted.has(key)) { SCREENS[key].ctl.mount(section); mounted.add(key); }
  Layout.setActive(key);
  SCREENS[key].ctl.show();
  document.title = `${SCREENS[key].label} · ${Shop.get().shop_name}`;
}

/** Android back button: close what is open, then go back to the order screen, then leave the app. */
window.handleBack = () => {
  const paid = document.querySelector('.paid');
  if (paid) { paid.click(); return true; }
  const dialogs = document.querySelectorAll('.modal-back');
  if (dialogs.length) { dialogs[dialogs.length - 1].close(); return true; }
  if (document.querySelector('.ticket.open')) { document.querySelector('[data-sheet-back]')?.click(); return true; }
  if (current && current !== 'pos') { location.hash = '#/pos'; return true; }
  return false;
};

function registerServiceWorker() {
  // Keeps a copy of the app on the device so it opens with no internet (also inside the Android app).
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  let hadController = !!navigator.serviceWorker.controller; // false on the very first visit
  navigator.serviceWorker.register('sw.js').then(reg => {
    // Look for a new version (after you push an update to GitHub) every 30 minutes,
    // and when the POS comes back on screen (at most every 5 minutes).
    let last = Date.now();
    const check = (gap = 5 * 60000) => { if (Date.now() - last >= gap) { last = Date.now(); reg.update().catch(() => {}); } };
    setInterval(() => check(0), 30 * 60000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  }).catch(err => console.warn('Offline support unavailable:', err));
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) updateReady(); hadController = true; });
}

/** A new version is installed. Reload by itself when nobody is in the middle of something;
 *  until then, show a bar with a Reload button. Nothing is lost either way (the cart is saved). */
function updateReady() {
  const idle = () => !document.querySelector('.modal-back, .paid') && !Pos.hasItems()
    && !document.activeElement?.matches?.('input, textarea, select');
  if (idle()) return location.reload();
  const bar = document.createElement('div');
  bar.className = 'update-bar';
  bar.innerHTML = '<span>A new version of the POS is ready.</span><button class="btn sm primary">Reload now</button>';
  bar.querySelector('button').addEventListener('click', () => location.reload());
  document.body.append(bar);
  setInterval(() => { if (idle()) location.reload(); }, 15000);
}

async function start() {
  applyTheme();
  const root = document.getElementById('app');
  try {
    await Promise.all([Menu.load(), Shop.load()]);
  } catch (e) {
    root.innerHTML = `<div class="auth"><div class="auth-card"><b>This browser is blocking on-device storage.</b>
      <p class="muted">Private or incognito windows can do this. Open the POS in a normal window, or install it as an app.</p></div></div>`;
    console.error(e); return;
  }
  keepData();
  registerServiceWorker();
  if (!prefs.token) await Auth.gate(root);

  root.className = 'app';
  root.innerHTML = Layout.shellHtml(SCREENS, Shop.get());
  Layout.updateWho(prefs, Shop.get());
  enableTooltips();

  document.addEventListener('click', e => {
    if (!e.target.closest('[data-sync]')) return;
    if (Sync.state.phase === 'signedout') return Auth.signInAgain();
    location.hash = '#/settings';
    setTimeout(() => document.getElementById('sync')?.scrollIntoView({ behavior: 'smooth' }), 60);
  });
  on('sync', s => { Layout.updateSync(s); if (s.phase === 'signedout') Auth.signInAgain(); });
  on('prefs', k => { if (['deviceName', 'cashier', 'prefix'].includes(k)) Layout.updateWho(prefs, Shop.get()); });
  on('shop', () => { Layout.updateWho(prefs, Shop.get()); document.title = `${SCREENS[current]?.label} · ${Shop.get().shop_name}`; });
  setInterval(() => Layout.updateSync(Sync.state), 30000); // keep "synced 2 min ago" current

  window.addEventListener('hashchange', route);
  route();
  Sync.start();
  OnlineOrders.start(); // orders customers send from their phones
}

start();
