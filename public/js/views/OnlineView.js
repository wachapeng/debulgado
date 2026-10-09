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
    <button class="btn sm" data-qr>${ICON.qr} QR codes</button></div>`;
  const error = s.error ? `<p class="status-line bad">${esc(s.error)}</p>` : '';
  if (!s.orders.length) {
    return tools + error + `<div class="empty"><b>No online orders waiting.</b>${s.open
      ? 'Customers scan the order QR, choose on their phone, then scan the counter QR. Their order shows up here.'
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

export function qrCodesHtml({ orderSvg, counterSvg, code, orderUrl }) {
  return `<div class="qr-pair">
    <div class="qr-card"><h3>Order QR</h3><p class="muted small">Put it on tables, the door or the menu board. It opens the menu on the customer's phone.</p>
      <div class="qr-box">${orderSvg}</div><div class="qr-url">${esc(orderUrl.replace(/^https?:\/\//, ''))}</div></div>
    <div class="qr-card"><h3>Counter QR</h3><p class="muted small">Keep it at the counter. Customers scan it to send their order, so orders only come from people in the shop.</p>
      <div class="qr-box">${counterSvg}</div><div class="qr-code">Code: <b>${esc(code.slice(0, 3))}-${esc(code.slice(3))}</b></div></div>
  </div>
  <p class="muted small" style="margin:14px 0 0">If someone copies the counter QR, make a new code and print it again. The old one stops working.</p>`;
}

export const qrPrintHtml = ({ orderSvg, counterSvg, code, shop }) => `<div class="qr-print">
  <section><div class="qp-shop">${esc(shop)}</div><h1>Scan to order</h1><div class="qp-qr">${orderSvg}</div>
    <p>Choose on your phone, then pay at the counter.</p></section>
  <div class="qp-cut">✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -</div>
  <section><div class="qp-shop">${esc(shop)}</div><h1>Counter: scan here to send your order</h1><div class="qp-qr">${counterSvg}</div>
    <p>Can't scan? Type this code: <b>${esc(code.slice(0, 3))}-${esc(code.slice(3))}</b></p></section>
</div>`;
