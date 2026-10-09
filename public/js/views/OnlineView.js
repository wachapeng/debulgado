// View: online orders on the POS (the bar under the order ticket, the list, the QR codes).
import { esc, peso, timeAgo } from '../core/format.js';
import { ICON } from '../core/ui.js';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** currentId: the online order on this device's ticket (not counted as waiting). */
export function barHtml(s, currentId) {
  const list = s.orders.filter(o => o.id !== currentId), n = list.length;
  const names = list.slice(0, 3).map(o => esc(o.name)).join(', ') + (n > 3 ? ` +${n - 3} more` : '');
  const sub = n ? names : s.error && !s.ready ? 'Offline' : s.open ? 'None waiting' : 'Closed: not taking phone orders';
  return `<span class="ob-icon">${ICON.bell}</span>
    <span class="ob-text"><b>Online orders</b><span>${sub}</span></span>
    ${n ? `<span class="ob-count" aria-label="${plural(n, 'order')} waiting">${n}</span>` : '<span class="ob-go" aria-hidden="true">›</span>'}`;
}

const itemsHtml = items => items.map(i => `<div>${i.qty > 1 ? `<b>${i.qty}×</b> ` : ''}${esc(i.name)}${i.addons.length ? ` <span class="muted">+ ${i.addons.map(a => esc(a.name)).join(', ')}</span>` : ''}</div>`).join('');

export function listHtml(s, currentId) {
  const tools = `<div class="online-tools">
    <label class="check"><input type="checkbox" data-open-toggle ${s.open ? 'checked' : ''}> Taking phone orders</label>
    <button class="btn sm" data-qr>${ICON.qr} Order QR code</button></div>`;
  const error = s.error ? `<p class="status-line bad">${esc(s.error)}</p>` : '';
  if (!s.orders.length) {
    return tools + error + `<div class="empty"><b>No online orders waiting.</b>${s.open
      ? 'Customers scan the order QR, choose on their phone and tap Send order. Their order shows up here.'
      : 'Phone orders are closed. Tick “Taking phone orders” to open them.'}</div>`;
  }
  return tools + error + `<div class="online-list">${s.orders.map(o => {
    const here = o.id === currentId, elsewhere = o.opened_by && !o.opened_here;
    return `<div class="online-card ${here ? 'current' : ''}">
      <div class="oc-top"><span class="oc-name">${esc(o.name)}</span><b class="oc-total">${peso(o.total)}</b></div>
      <div class="muted small">${o.service === 'take-out' ? 'Take-out' : 'Dine-in'} · ${plural(o.item_count, 'item')} · ${esc(timeAgo(o.created_at))}
        ${here ? ' · <b class="oc-flag">On the ticket</b>' : elsewhere ? ` · <b class="oc-flag warn">Open on ${esc(o.opened_by_name)}</b>` : ''}</div>
      <div class="oc-items">${itemsHtml(o.items)}</div>
      <div class="oc-actions"><button class="btn sm danger" data-cancel-online="${esc(o.id)}">Cancel order</button>
        <span class="spacer"></span>
        <button class="btn sm ${here ? '' : 'primary'}" data-take="${esc(o.id)}">${here ? 'Show ticket' : 'Open in ticket'}</button></div>
    </div>`; }).join('')}</div>`;
}

export const ticketChipHtml = name => `<div class="online-chip">${ICON.user}<span>Online order for <b>${esc(name)}</b></span>
  <span class="spacer"></span><button class="link small" data-put-back>Put back</button></div>`;

export function qrCodesHtml({ orderSvg, orderUrl }) {
  return `<div class="qr-card single"><p class="muted small">Put it on tables, the door, the counter or the menu board. Customers scan it with their phone camera, choose, and send the order to this POS.</p>
    <div class="qr-box">${orderSvg}</div><div class="qr-url">${esc(orderUrl.replace(/^https?:\/\//, ''))}</div></div>`;
}

export const qrPrintHtml = ({ orderSvg, shop }) => `<div class="qr-print">
  <section><div class="qp-shop">${esc(shop)}</div><h1>Scan to order</h1><div class="qp-qr">${orderSvg}</div>
    <p>Choose on your phone, tap Send order, then pay at the counter.</p></section>
</div>`;
