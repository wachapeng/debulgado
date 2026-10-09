// Controller: transaction history. Filters and dates are remembered; the list refreshes in place.
import * as View from '../views/HistoryView.js';
import * as Orders from '../models/OrderModel.js';
import { on } from '../core/bus.js';
import { screenState } from '../core/prefs.js';
import { resolveRange, bindRange } from '../views/components/rangePicker.js';
import { openReceipt } from '../views/components/receipt.js';
import { toast } from '../core/ui.js';

const st = screenState('history', { preset: 'today', from: '', to: '', q: '', method: '', status: '' });
const PAGE = 150;
let root, visible = false, stale = true, shown = PAGE, current = [];

export function mount(el) {
  root = el;
  resolveRange(st);
  el.innerHTML = View.layout(st);
  bindRange(el.querySelector('[data-range]'), st, () => { shown = PAGE; load(); });
  let t;
  el.querySelector('[data-q]').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { st.q = e.target.value; st.save(); shown = PAGE; load(); }, 200); });
  el.querySelector('[data-method]').addEventListener('change', e => { st.method = e.target.value; st.save(); load(); });
  el.querySelector('[data-status]').addEventListener('change', e => { st.status = e.target.value; st.save(); load(); });
  el.querySelector('[data-list]').addEventListener('click', async e => {
    if (e.target.closest('[data-more]')) { shown += PAGE; return draw(); }
    const row = e.target.closest('[data-id]'); if (!row) return;
    openReceipt(await Orders.find(row.dataset.id), { onChange: load });
  });
  el.querySelector('[data-export]')?.addEventListener('click', exportCsv);
  const refresh = () => { if (visible) load(); else stale = true; };
  on('orders', refresh);
  on('sync', s => { if (s.phase === 'ok') refresh(); });
}

export function show() {
  visible = true;
  const before = st.from + st.to;
  resolveRange(st); // "Today" moves forward after midnight
  if (before !== st.from + st.to) { root.querySelector('[data-k=from]').value = st.from; root.querySelector('[data-k=to]').value = st.to; stale = true; }
  if (stale) load();
}
export function hide() { visible = false; }

async function load() {
  stale = false;
  const q = st.q.trim().toLowerCase();
  const all = await Orders.inRange(st.from, st.to);
  current = all.filter(o => (!st.method || o.payment_method === st.method) && (!st.status || o.status === st.status) &&
    (!q || o.number.toLowerCase().includes(q) || (o.payment_ref || '').toLowerCase().includes(q) || (o.cashier || '').toLowerCase().includes(q) || (o.customer_name || '').toLowerCase().includes(q)
      || o.items.some(i => i.name.toLowerCase().includes(q))));
  const paid = current.filter(o => o.status === 'paid');
  root.querySelector('[data-summary]').innerHTML = View.summaryHtml({
    orders: paid.length, net: paid.reduce((s, o) => s + o.total, 0),
    cash: paid.filter(o => o.payment_method === 'cash').reduce((s, o) => s + o.total, 0),
    gcash: paid.filter(o => o.payment_method === 'gcash').reduce((s, o) => s + o.total, 0),
    voids: current.length - paid.length, pending: current.filter(o => o.dirty).length,
  });
  draw();
}

function draw() {
  const groups = [];
  for (const o of current) {
    let g = groups.at(-1);
    if (!g || g.date !== o.date) groups.push(g = { date: o.date, orders: [], paid: 0, net: 0 });
    g.orders.push(o);
    if (o.status === 'paid') { g.paid++; g.net += o.total; }
  }
  root.querySelector('[data-list]').innerHTML = View.listHtml(groups, shown, current.length);
}

function exportCsv() {
  if (!current.length) return toast('No orders to export for these dates.', 'bad');
  const cell = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const money = c => (c == null ? '' : (c / 100).toFixed(2));
  const head = ['Order', 'Date', 'Time', 'Device', 'Cashier', 'Service', 'Customer', 'Items', 'Subtotal', 'Discount', 'Discount type', 'Total', 'Payment', 'GCash ref', 'Tendered', 'Change', 'Status', 'Void reason'];
  const rows = [...current].reverse().map(o => [o.number, o.date, o.created_at.slice(11), o.device, o.cashier, o.service, o.customer_name,
    o.items.map(i => `${i.qty}x ${i.name}${i.addons.length ? ' (+' + i.addons.map(a => a.name).join(', +') + ')' : ''}`).join('; '),
    money(o.subtotal), money(o.discount), o.discount_label, money(o.total), o.payment_method, o.payment_ref, money(o.tendered), money(o.change_due), o.status, o.void_reason]);
  const csv = '﻿' + [head, ...rows].map(r => r.map(cell).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `sales_${st.from}_to_${st.to}.csv`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast(`Downloaded ${rows.length} orders`, 'good');
}
