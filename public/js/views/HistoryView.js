// View: transaction history, grouped by day.
import { esc, peso, fmtDay, fmtTime, isNative } from '../core/format.js';
import { ICON } from '../core/ui.js';
import { rangeHtml } from './components/rangePicker.js';

export const layout = st => `
  <div class="page-head"><div><h1>History</h1><p>Every sale on every device, newest first.</p></div>
    ${isNative() ? '' : '<button class="btn" data-export>Download CSV</button>'}</div>
  <div class="filters">
    <div data-range>${rangeHtml(st)}</div>
    <input data-q type="search" placeholder="Order no., name, item, GCash ref…" value="${esc(st.q)}" aria-label="Search orders">
    <select data-method aria-label="Payment"><option value="">All payments</option><option value="cash" ${st.method === 'cash' ? 'selected' : ''}>Cash</option><option value="gcash" ${st.method === 'gcash' ? 'selected' : ''}>GCash</option></select>
    <select data-status aria-label="Status"><option value="">Paid & voided</option><option value="paid" ${st.status === 'paid' ? 'selected' : ''}>Paid only</option><option value="void" ${st.status === 'void' ? 'selected' : ''}>Voided only</option></select>
  </div>
  <div data-summary></div>
  <div data-list></div>`;

export function summaryHtml(s) {
  return `<div class="summary-strip">
    <div><span>Paid orders</span><b>${s.orders}</b></div><div><span>Net sales</span><b>${peso(s.net)}</b></div>
    <div><span>Cash</span><b>${peso(s.cash)}</b></div><div><span>GCash</span><b>${peso(s.gcash)}</b></div>
    ${s.voids ? `<div><span>Voided</span><b>${s.voids}</b></div>` : ''}
    ${s.pending ? `<div><span>Waiting to upload</span><b>${s.pending}</b></div>` : ''}</div>`;
}

const itemsText = o => o.items.map(i => `${i.qty > 1 ? i.qty + '× ' : ''}${i.name}${i.addons.length ? ' + ' + i.addons.map(a => a.name).join(', ') : ''}`).join(', ');

export function listHtml(groups, shown, total) {
  if (!total) return `<div class="panel empty"><b>No orders for these dates.</b>Pick other dates, or ring up a sale on the POS.</div>`;
  let left = shown;
  const html = groups.map(g => {
    if (left <= 0) return '';
    const rows = g.orders.slice(0, left); left -= rows.length;
    return `<div class="day-group"><div class="day-head">${esc(fmtDay(g.date))}<span>${g.paid} orders · ${peso(g.net)}</span></div>
      ${rows.map(o => `<button class="order-row ${o.status === 'void' ? 'void' : ''}" data-id="${esc(o.id)}">
        <span class="t">${esc(fmtTime(o.created_at))}</span><span class="n">${esc(o.number)}</span>
        <span class="items">${o.customer_name ? `<b class="who">${esc(o.customer_name)}</b> · ` : ''}${esc(itemsText(o))}</span>
        <span class="pay">${o.status === 'void' ? '<span class="badge bad">Voided</span>' : (o.payment_method === 'gcash' ? '<span class="badge gcash">GCash</span>' : '<span class="badge cash">Cash</span>')}</span>
        <span class="amt">${peso(o.total)}</span>${o.dirty ? ICON.cloudWait : ICON.cloudOk}</button>`).join('')}</div>`;
  }).join('');
  return html + (shown < total ? `<div class="row" style="justify-content:center"><button class="btn" data-more>Show more (${total - shown} left)</button></div>` : '');
}
