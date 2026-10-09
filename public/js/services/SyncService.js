// Sync: uploads what changed on this device and downloads what changed on other devices.
// Runs on start, every minute, right after each sale, and whenever the internet comes back.
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

async function refreshPending() { state.pending = await Orders.pendingCount(); }
function set(phase, extra = {}) { Object.assign(state, { phase }, extra); emit('sync', state); }

export function soon(ms = 1200) { clearTimeout(timer); timer = setTimeout(() => run(), ms); }

export async function run() {
  if (running) { again = true; return; }
  if (!prefs.token) { await refreshPending(); return set('signedout'); }
  running = true; set('syncing');
  try {
    let since = await getMeta('cursor', 0);
    for (let round = 0; round < 500; round++) {
      const orders = await Orders.pending(BATCH);
      const menu = menuPush();
      const push = { orders, ...menu.push };
      if (round === 0) push.shop = Shop.pending();
      const data = await api('sync', { method: 'POST', body: { device: prefs.deviceName, since, push }, timeout: 45000 });
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
    set('ok', { lastSync: nowIso(), error: '' });
  } catch (e) {
    await refreshPending();
    if (e.status === 401) { setPref('token', ''); set('signedout', { error: e.message }); }
    else if (e.status === 0) set('offline', { error: e.message });
    else set('error', { error: e.message });
  } finally {
    running = false;
    if (again) { again = false; soon(400); }
  }
}

/** After signing in: download everything, and upload everything this device has
 *  (the server ignores what it already has, so nothing is ever lost or doubled). */
export async function startFresh() {
  await setMeta('cursor', 0);
  await Orders.markAllForUpload(); await Menu.markAllForUpload(); await Shop.markAllForUpload();
}

export function start() {
  on('local-change', () => { refreshPending().then(() => emit('sync', state)); soon(); });
  window.addEventListener('online', () => soon(300));
  window.addEventListener('offline', () => set('offline', { error: 'This device is offline.' }));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') soon(300); });
  setInterval(() => { if (!running && prefs.token) run(); }, 60000);
  run();
}
