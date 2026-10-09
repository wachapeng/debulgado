// Model (on the customer's phone): the menu, the cart, the name, and the order once it is sent.
// Kept in the phone's storage, so a reload or a closed tab loses nothing.
import { uuid } from '../core/format.js';

const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } };

export const state = {
  menu: read('order:menu', null),                       // { open, shop, categories, products, addons }
  cart: read('order:cart', { lines: [], service: 'dine-in', attempt: '' }),
  name: read('order:name', ''),                         // remembered for next time
  sent: read('order:sent', null),                       // the order after it was sent (with its status)
};
export function save() { write('order:cart', state.cart); write('order:name', state.name); write('order:sent', state.sent); }

export class ShopError extends Error {
  constructor(message, status, data = {}) { super(message); this.status = status; this.data = data; }
}

async function call(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch('/api/public/' + path, {
      method, cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ShopError("Couldn't reach the shop. Check your internet connection and try again.", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ShopError(data.error || 'Something went wrong. Please try again.', res.status, data);
  return data;
}

/** Tell the shop someone is choosing right now, so the POS checks for orders every 2 seconds.
 *  Sent at most every 20 seconds. Never slows the page down. */
let lastHello = 0;
export function hello(soon = false) {
  const now = Date.now();
  if (now - lastHello < (soon ? 3000 : 20000) || state.menu?.open === false) return;
  lastHello = now;
  fetch('/api/public/hello', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
}

// ---------- menu ----------
export async function loadMenu() {
  state.menu = await call('menu');
  write('order:menu', state.menu);
  return state.menu;
}
export const product = id => state.menu?.products.find(p => p.id === id);
export const categoryName = id => state.menu?.categories.find(c => c.id === id)?.name || '';
export const addonsFor = p => (state.menu?.addons || []).filter(a => a.category_ids.includes(p.category_id));

// ---------- cart ----------
const keyOf = (pid, ids) => pid + '|' + [...ids].sort().join(',');

/** Cart lines with their menu details (items no longer on the menu drop out). */
export function lines() {
  return state.cart.lines.map(l => {
    const p = product(l.product_id);
    if (!p) return null;
    const allowed = addonsFor(p);
    const addons = l.addon_ids.map(id => allowed.find(a => a.id === id)).filter(Boolean);
    return { ...l, product: p, addons, unit: p.price + addons.reduce((s, a) => s + a.price, 0) };
  }).filter(Boolean);
}
export const total = ls => ls.reduce((s, l) => s + l.unit * l.qty, 0);
export const count = ls => ls.reduce((s, l) => s + l.qty, 0);
export function counts() { const c = {}; for (const l of state.cart.lines) c[l.product_id] = (c[l.product_id] || 0) + l.qty; return c; }

function changed() { state.cart.attempt = ''; save(); }
export function add(pid) {
  const key = keyOf(pid, []);
  const found = state.cart.lines.find(l => l.key === key);
  if (found) found.qty = Math.min(20, found.qty + 1); else state.cart.lines.push({ key, product_id: pid, qty: 1, addon_ids: [] });
  changed();
}
export function inc(i) { const l = state.cart.lines[i]; if (l) l.qty = Math.min(20, l.qty + 1); changed(); }
export function dec(i) {
  const l = state.cart.lines[i]; if (!l) return;
  if (l.qty > 1) l.qty--; else state.cart.lines.splice(i, 1);
  changed();
}
/** One less of a product from its card (the most recently added line). */
export function decProduct(pid) {
  for (let i = state.cart.lines.length - 1; i >= 0; i--) if (state.cart.lines[i].product_id === pid) return dec(i);
}
export function toggleAddon(i, aid) {
  const l = state.cart.lines[i]; if (!l) return;
  l.addon_ids = l.addon_ids.includes(aid) ? l.addon_ids.filter(x => x !== aid) : [...l.addon_ids, aid];
  l.key = keyOf(l.product_id, l.addon_ids);
  const dup = state.cart.lines.findIndex((x, j) => j !== i && x.key === l.key);
  if (dup >= 0) { state.cart.lines[dup].qty = Math.min(20, state.cart.lines[dup].qty + l.qty); state.cart.lines.splice(i, 1); }
  changed();
}
export function setService(s) { state.cart.service = s === 'take-out' ? 'take-out' : 'dine-in'; changed(); }
export function setName(n) { state.name = String(n).slice(0, 40); save(); }

// ---------- sending ----------
/** Send the order straight to the POS. */
export async function send() {
  const ls = lines();
  if (!ls.length) throw new ShopError('Your order is empty.', 400);
  if (!state.name.trim()) throw new ShopError('Enter your name first.', 400, { need_name: true });
  state.cart.attempt ||= uuid(); // the same id if it is sent again, so it is never doubled
  save();
  const order = await call('orders', { method: 'POST', body: {
    id: state.cart.attempt, name: state.name.trim(), service: state.cart.service,
    items: ls.map(l => ({ product_id: l.product_id, qty: l.qty, addon_ids: l.addon_ids })),
  } });
  state.sent = order;
  state.cart = { lines: [], service: state.cart.service, attempt: '' };
  save();
  return order;
}

export async function refreshSent() {
  if (!state.sent) return null;
  try {
    const now = await call(`orders/${encodeURIComponent(state.sent.id)}?key=${encodeURIComponent(state.sent.secret)}`);
    state.sent = { ...state.sent, ...now };
  } catch (e) {
    if (e.status === 404) state.sent = { ...state.sent, status: 'gone' };
    else throw e;
  } finally { save(); }
  return state.sent;
}
export function forgetSent() { state.sent = null; save(); }
