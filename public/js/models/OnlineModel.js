// Model: online orders (sent by customers from their phones), as the POS sees them.
// Checked every 15 seconds while the POS is on screen and online. Needs the internet;
// everything else on the POS keeps working offline.
import { api } from '../core/api.js';
import { emit } from '../core/bus.js';
import { prefs } from '../core/prefs.js';

// How often the POS asks for new online orders (only while it is on screen). Every check is one
// request to Vercel, so it slows down when phone orders are closed.
const EVERY_OPEN = 15000, EVERY_CLOSED = 60000;
export const state = { ready: false, open: true, code: '', orders: [], error: '' };
const seen = new Set();   // orders already announced on this device
const paidHere = new Set(); // paid on this device; hidden until the server hears about the sale
let timer = 0, busy = false, first = true, started = false;

export async function refresh() {
  if (!prefs.token || busy) return;
  busy = true;
  try {
    const data = await api('online', { timeout: 15000 });
    for (const id of [...paidHere]) if (!data.orders.some(o => o.id === id)) paidHere.delete(id);
    const orders = data.orders.filter(o => !paidHere.has(o.id));
    const added = first ? [] : orders.filter(o => !seen.has(o.id)); // the first look only fills the list, without a chime
    orders.forEach(o => seen.add(o.id));
    first = false;
    Object.assign(state, { ready: true, open: data.open, code: data.code, orders, error: '' });
    emit('online', { added });
  } catch (e) {
    state.error = e.status === 0 ? 'Offline: online orders show up when the internet is back.' : e.message;
    emit('online', { added: [] });
  } finally { busy = false; }
}

export function start() {
  if (started) return;
  started = true;
  const tick = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => { if (document.visibilityState === 'visible') await refresh(); tick(); }, state.open ? EVERY_OPEN : EVERY_CLOSED);
  };
  refresh(); tick();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
  window.addEventListener('online', () => refresh());
}

const find = id => state.orders.find(o => o.id === id);
function drop(id) { state.orders = state.orders.filter(o => o.id !== id); emit('online', { added: [] }); }

/** Open an order in this device's ticket. force: take it over from another device. */
export async function take(id, force = false) {
  const o = await api(`online/${encodeURIComponent(id)}/open`, { method: 'POST', body: { force } });
  Object.assign(find(id) || {}, o);
  emit('online', { added: [] });
  return o;
}
/** The ticket was cleared without paying: the order goes back to the list for any device. */
export async function putBack(id) {
  const o = find(id); if (o) { o.opened_by = null; o.opened_by_name = null; emit('online', { added: [] }); }
  try { await api(`online/${encodeURIComponent(id)}/release`, { method: 'POST' }); } catch { /* offline: it frees itself when another device takes it */ }
}
export async function cancel(id) {
  await api(`online/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
  drop(id);
}
/** Paid on this device. The sale reaches the server with the next sync, which marks it paid there. */
export function markPaid(id) { paidHere.add(id); drop(id); }

export async function setOpen(open) {
  const data = await api('online/settings', { method: 'POST', body: { open } });
  Object.assign(state, { open: data.open, code: data.code });
  emit('online', { added: [] });
}
export async function newCode() {
  const data = await api('online/settings', { method: 'POST', body: { new_code: true } });
  Object.assign(state, { open: data.open, code: data.code });
  return data.code;
}
