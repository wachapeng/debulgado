// Model: orders. Saved on the device the moment they are paid, uploaded later by the sync service.
import { get, put, byIndex, countIndex, getMeta, setMeta, getAll } from '../core/db.js';
import { emit } from '../core/bus.js';
import { uuid, nowIso, localDate, localDateTime } from '../core/format.js';
import { prefs } from '../core/prefs.js';
import { categoryName } from './MenuModel.js';

export const DISCOUNTS = {
  none: 'No discount', senior: 'Senior citizen', pwd: 'PWD', promo_pct: 'Promo (%)', promo_amt: 'Promo (₱ off)',
};

/** Price an order. lines: [{ product, qty, addons: [addon] }]. Amounts in centavos. */
export function totals(lines, discount = { type: 'none' }, seniorRate = 20) {
  const subtotal = lines.reduce((s, l) => s + (l.product.price + l.addons.reduce((a, x) => a + x.price, 0)) * l.qty, 0);
  const v = Number(discount.value) || 0;
  let amount = 0, label = null;
  if (discount.type === 'senior' || discount.type === 'pwd') { amount = Math.round(subtotal * seniorRate / 100); label = `${DISCOUNTS[discount.type]} ${seniorRate}%`; }
  if (discount.type === 'promo_pct' && v > 0) { amount = Math.round(subtotal * Math.min(v, 100) / 100); label = `Promo ${v}%`; }
  if (discount.type === 'promo_amt' && v > 0) { amount = Math.min(Math.round(v * 100), subtotal); label = `Promo ₱${v}`; }
  return { subtotal, discount: amount, discount_label: label, total: subtotal - amount };
}

/** The number the next order will get (shown on the order ticket). */
export async function peekNumber() {
  const prefix = (prefs.prefix || 'L').toUpperCase();
  return `${prefix}-${String((await getMeta('counter:' + prefix, 0)) + 1).padStart(4, '0')}`;
}

async function nextNumber() {
  const prefix = (prefs.prefix || 'L').toUpperCase();
  const key = 'counter:' + prefix;
  const n = (await getMeta(key, 0)) + 1;
  await setMeta(key, n);
  return `${prefix}-${String(n).padStart(4, '0')}`;
}

export async function create({ lines, service, discount, payment, seniorRate, customer = null }) {
  if (!lines.length) throw new Error('Add at least one item.');
  const t = totals(lines, discount, seniorRate);
  const cash = payment.method === 'cash';
  const tendered = cash ? Math.round((Number(payment.tendered) || 0) * 100) : null;
  if (cash && tendered < t.total) throw new Error(payment.tendered ? 'Amount tendered is less than the total.' : 'Enter the amount tendered.');
  const now = new Date();
  const order = {
    id: uuid(), number: await nextNumber(), device: prefs.deviceName, cashier: prefs.cashier || null,
    created_at: localDateTime(now), date: localDate(now), service: service === 'take-out' ? 'take-out' : 'dine-in',
    ...t, payment_method: cash ? 'cash' : 'gcash', tendered, change_due: cash ? tendered - t.total : null,
    payment_ref: cash ? null : (String(payment.ref || '').trim() || null), // GCash reference is optional
    customer_name: customer?.name || null, online_order_id: customer?.onlineOrderId || null, // orders sent from a customer's phone
    status: 'paid', void_reason: null, voided_at: null, updated_at: nowIso(), dirty: 1,
    items: lines.map(l => {
      const unit = l.product.price + l.addons.reduce((a, x) => a + x.price, 0);
      return { product_id: l.product.id, name: l.product.name, category: categoryName(l.product.category_id), price: l.product.price, qty: l.qty,
        addons: l.addons.map(a => ({ id: a.id, name: a.name, price: a.price })), line_total: unit * l.qty };
    }),
  };
  await put('orders', order);
  emit('orders'); emit('local-change');
  return order;
}

export async function voidOrder(id, reason) {
  const o = await get('orders', id);
  if (!o || o.status !== 'paid') throw new Error('Only paid orders can be voided.');
  const updated = { ...o, status: 'void', void_reason: reason, voided_at: localDateTime(), updated_at: nowIso(), dirty: 1 };
  await put('orders', updated);
  emit('orders'); emit('local-change');
  return updated;
}

export const find = id => get('orders', id);
/** Orders whose date is between from and to (inclusive), newest first. */
export async function inRange(from, to) {
  const list = await byIndex('orders', 'date', IDBKeyRange.bound(from, to));
  return list.sort((a, b) => b.created_at.localeCompare(a.created_at));
}
export const pendingCount = () => countIndex('orders', 'dirty', 1);

// ---- sync ----
export async function pending(limit) {
  const list = await byIndex('orders', 'dirty', 1);
  return list.slice(0, limit).map(({ dirty, ...o }) => o);
}
export async function markUploaded(sent) {
  const done = [];
  for (const s of sent) { const o = await get('orders', s.id); if (o && o.updated_at === s.updated_at) done.push({ ...o, dirty: 0 }); }
  await put('orders', ...done);
}
export async function merge(incoming) {
  if (!incoming?.length) return;
  const saved = [];
  const prefix = (prefs.prefix || 'L').toUpperCase() + '-';
  let highest = 0;
  for (const o of incoming) {
    const local = await get('orders', o.id);
    if (local && local.dirty && local.updated_at >= o.updated_at) continue;
    const { seq, ...row } = o;
    saved.push({ ...row, dirty: 0 });
    if (o.number?.startsWith(prefix)) highest = Math.max(highest, parseInt(o.number.slice(prefix.length), 10) || 0);
  }
  await put('orders', ...saved);
  // If this device's data was cleared, continue numbering after the last receipt the server knows about.
  const key = 'counter:' + prefix.slice(0, -1);
  if (highest > (await getMeta(key, 0))) await setMeta(key, highest);
  if (saved.length) emit('orders');
}
export async function markAllForUpload() {
  const list = await getAll('orders');
  await put('orders', ...list.map(o => ({ ...o, dirty: 1 })));
}
