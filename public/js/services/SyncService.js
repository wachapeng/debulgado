// Sync: uploads what changed on this device and downloads what changed on other devices.
// Runs on start, every minute, right after each sale, and whenever the internet comes back
// (checked every few seconds while offline, so no reload is ever needed).
import { getMeta, setMeta } from '../core/db.js';
import { on, emit } from '../core/bus.js';
import { nowIso } from '../core/format.js';
import { prefs, setPref } from '../core/prefs.js';
import { api } from '../core/api.js';
import * as Menu from '../models/MenuModel.js';
import * as Orders from '../models/OrderModel.js';
import * as Shop from '../models/ShopModel.js';

const BATCH = 100; // orders per upload (keeps each request small and quick)
const MENU_BUDGET = 2_000_000; // characters of menu rows per upload; product photos are sent over several rounds if needed

/** Menu rows waiting to upload, up to the size budget (always at least one row). */
function menuPush() {
  const push = {}; let size = 0;
  for (const t of Menu.TABLES) {
    push[t] = [];
    for (const row of Menu.pending(t)) {
      const n = JSON.stringify(row).length;
      if (size && size + n > MENU_BUDGET) return { push, more: true };
      push[t].push(row); size += n;
    }
  }
  return { push, more: false };
}
export const state = { phase: 'idle', lastSync: null, error: '', pending: 0 };
// phase: idle | syncing | ok | offline | error | signedout

let timer = null, running = false, again = false;
let failures = 0, current = null, retryNow = false;
// After a failed try, try again soon (2, 4, 8, then every 10 seconds) instead of waiting for the
// once-a-minute sync. The browser doesn't always say when the internet comes back (for example
// when the Wi-Fi stays connected but the internet behind it drops), so the app keeps checking.
const RETRY = [2000, 4000, 8000, 10000];

async function refreshPending() { state.pending = await Orders.pendingCount(); }
function set(phase, extra = {}) { Object.assign(state, { phase }, extra); emit('sync', state); }

export function soon(ms = 1200) { clearTimeout(timer); timer = setTimeout(() => run(), ms); }

export async function run() {
  if (running) { again = true; return; }
  if (!prefs.token) { await refreshPending(); return set('signedout'); }
  if (navigator.onLine === false) { // surely offline: wait for the browser's "online" (and check again in 15 s anyway)
    await refreshPending(); set('offline', { error: 'This device is offline.' }); soon(15000); return;
  }
  running = true;
  if (!['offline', 'error'].includes(state.phase)) set('syncing'); // while reconnecting, the badge keeps saying Offline until it works
  current = new AbortController();
  try {
    let since = await getMeta('cursor', 0);
    for (let round = 0; round < 500; round++) {
      const orders = await Orders.pending(BATCH);
      const menu = menuPush();
      const push = { orders, ...menu.push };
      if (round === 0) push.shop = Shop.pending();
      const body = { device: prefs.deviceName, since, push };
      // 15 seconds, plus 1 second for every 100 KB to upload (product photos), so a dead connection is noticed quickly.
      const timeout = 15000 + Math.round(JSON.stringify(body).length / 100000) * 1000;
      const data = await api('sync', { method: 'POST', body, timeout, signal: current.signal });
      await Orders.markUploaded(orders);
      for (const t of Menu.TABLES) await Menu.markUploaded(t, push[t]);
      if (round === 0) await Shop.markUploaded(push.shop);
      for (const t of Menu.TABLES) await Menu.merge(t, data.pull[t]);
      await Shop.merge(data.pull.shop);
      await Orders.merge(data.pull.orders);
      if (!prefs.prefix && data.device?.prefix) setPref('prefix', data.device.prefix);
      since = data.cursor; await setMeta('cursor', since);
      if (!data.more && orders.length < BATCH && !menu.more) break;
    }
    await refreshPending();
    failures = 0;
    set('ok', { lastSync: nowIso(), error: '' });
  } catch (e) {
    await refreshPending();
    if (e.status === 401) { setPref('token', ''); set('signedout', { error: e.message }); }
    else {
      set(e.status === 0 ? 'offline' : 'error', { error: e.message });
      const wait = retryNow ? 300 : RETRY[Math.min(failures++, RETRY.length - 1)];
      retryNow = false; again = false;
      soon(wait);
    }
  } finally {
    running = false; current = null;
    if (again) { again = false; soon(400); }
  }
}

/** After signing in: download everything, and upload everything this device has
 *  (the server ignores what it already has, so nothing is ever lost or doubled). */
export async function startFresh() {
  await setMeta('cursor', 0);
  await Orders.markAllForUpload(); await Menu.markAllForUpload(); await Shop.markAllForUpload();
}

/** Try now. networkChanged: the browser says the internet is back, so an upload still waiting
 *  started on the old connection and may never finish: drop it and send again (never doubles anything). */
function reconnect(networkChanged = false) {
  failures = 0;
  if (running && networkChanged) { retryNow = true; current?.abort(); return; }
  soon(300);
}

export function start() {
  on('local-change', () => { refreshPending().then(() => emit('sync', state)); soon(); });
  window.addEventListener('online', () => reconnect(true));
  window.addEventListener('focus', () => { if (!['ok', 'syncing', 'signedout'].includes(state.phase)) reconnect(); });
  window.addEventListener('offline', () => set('offline', { error: 'This device is offline.' }));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reconnect(); });
  setInterval(() => { if (!running && prefs.token) run(); }, 60000);
  run();
}
