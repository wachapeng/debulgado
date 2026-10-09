// Model: online orders (sent by customers from their phones), as the POS sees them.
// Needs the internet; everything else on the POS keeps working offline.
//
// How often the POS checks (only while it is on screen). Every check is one request to Vercel,
// so it checks often only when it matters:
//   every 2 seconds while a customer is choosing on their phone (their page tells the server),
//   every 15 seconds otherwise, once a minute when phone orders are closed,
//   and quickly again (3, 6, then every 10 s) after a failed check, so it reconnects by itself.
import { api } from '../core/api.js';
import { emit } from '../core/bus.js';
import { prefs } from '../core/prefs.js';

const FAST = 2000, NORMAL = 15000, CLOSED = 60000, RETRY = [3000, 6000, 10000];
const ACTIVE_FOR = 150; // seconds after a customer's last tap that the POS keeps checking fast

export const state = { ready: false, open: true, orders: [], error: '', activityAge: null };
const seen = new Set();     // orders already announced on this device
const paidHere = new Set(); // paid on this device; hidden until the server hears about the sale
let timer = 0, busy = false, first = true, started = false, failures = 0, current = null;

const customerOrdering = () => state.open && state.activityAge != null && state.activityAge < ACTIVE_FOR;
export function nextCheckIn() {
  if (failures) return RETRY[Math.min(failures - 1, RETRY.length - 1)];
  return !state.open ? CLOSED : customerOrdering() ? FAST : NORMAL;
}

export async function refresh() {
  if (!prefs.token || busy) return;
  busy = true; current = new AbortController();
  try {
    const data = await api('online', { timeout: 8000, signal: current.signal });
    for (const id of [...paidHere]) if (!data.orders.some(o => o.id === id)) paidHere.delete(id);
    const orders = data.orders.filter(o => !paidHere.has(o.id));
    const added = first ? [] : orders.filter(o => !seen.has(o.id)); // the first look only fills the list, without a chime
    orders.forEach(o => seen.add(o.id));
    first = false; failures = 0;
    Object.assign(state, { ready: true, open: data.open, orders, error: '', activityAge: data.activity_age });
    emit('online', { added });
  } catch (e) {
    failures++;
    state.error = e.status === 0 ? 'Offline: online orders show up when the internet is back.' : e.message;
    emit('online', { added: [] });
  } finally { busy = false; current = null; }
}

function schedule(ms = nextCheckIn()) {
  clearTimeout(timer);
  timer = setTimeout(async () => { if (document.visibilityState === 'visible') await refresh(); schedule(); }, ms);
}
/** Check now. networkChanged: the internet is back, so a check still waiting may be stuck: drop it. */
function checkNow(networkChanged = false) {
  failures = 0;
  if (busy && networkChanged) current?.abort();
  setTimeout(async () => { await refresh(); schedule(); }, 200);
}

export function start() {
  if (started) return;
  started = true;
  refresh().then(() => schedule());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkNow(); });
  window.addEventListener('online', () => checkNow(true));
  window.addEventListener('focus', () => { if (failures) checkNow(); });
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
  state.open = data.open;
  emit('online', { added: [] });
  schedule();
}
