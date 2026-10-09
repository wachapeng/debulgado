// View: the printed receipt (same look as the prototype: dashed lines, "Order #… ready!", thank-you footer).
import { esc, peso, fmtDateTime } from '../../core/format.js';
import * as Shop from '../../models/ShopModel.js';
import { modal, askPin, toast, fail, field } from '../../core/ui.js';
import * as Orders from '../../models/OrderModel.js';

export function receiptHtml(o) {
  const s = Shop.get();
  return `<div class="receipt ${o.status === 'void' ? 'is-void' : ''}">
    <div class="shop">${esc((s.shop_name || '').toUpperCase())}</div>
    ${s.shop_address ? `<div class="addr">${esc(s.shop_address)}</div>` : ''}
    <div class="ready">${o.customer_name ? esc(o.customer_name) + ', order' : 'Order'} ${esc(o.number)} ${o.status === 'void' ? 'voided' : 'ready!'}</div>
    <div class="sep"></div>
    <div class="r"><span>${esc(o.number)}</span><span>${esc(fmtDateTime(o.created_at))}</span></div>
    <div class="r"><span>${esc(o.cashier || o.device || '')}</span><span>${o.service === 'take-out' ? 'Take-out' : 'Dine-in'}</span></div>
    ${o.customer_name ? `<div class="r"><span>Name</span><span><b>${esc(o.customer_name)}</b>${o.online_order_id ? ' (online)' : ''}</span></div>` : ''}
    <div class="sep"></div>
    ${o.items.map(i => `<div class="r"><span>${esc(i.name)} x${i.qty}</span><span>${peso(i.price * i.qty)}</span></div>
      ${i.addons.map(a => `<div class="r add"><span>+ ${esc(a.name)}${i.qty > 1 ? ' x' + i.qty : ''}</span><span>${peso(a.price * i.qty)}</span></div>`).join('')}`).join('')}
    <div class="sep"></div>
    ${o.discount ? `<div class="r"><span>Subtotal</span><span>${peso(o.subtotal)}</span></div><div class="r"><span>Less: ${esc(o.discount_label)}</span><span>−${peso(o.discount)}</span></div>` : ''}
    <div class="r tot"><span>TOTAL</span><span>${peso(o.total)}</span></div>
    <div class="r"><span>Payment</span><span>${o.payment_method === 'gcash' ? 'GCash' : 'Cash'}</span></div>
    ${o.payment_method === 'cash' ? `<div class="r"><span>Tendered</span><span>${peso(o.tendered)}</span></div><div class="r"><span>Change</span><span>${peso(o.change_due)}</span></div>`
      : o.payment_ref ? `<div class="r"><span>Reference</span><span>${esc(o.payment_ref)}</span></div>` : ''}
    <div class="sep"></div>
    <div class="thanks">${esc(s.receipt_footer || 'Thank you. Come again.')}</div>
    <div class="note">This is not an official receipt.</div>
  </div>`;
}

export function printReceipt(o) {
  document.getElementById('print-area').innerHTML = receiptHtml(o);
  if (window.AndroidApp?.print) window.AndroidApp.print(); // Android app: opens the phone's print screen
  else window.print();
}

/** Receipt dialog with print and void. onChange runs after a void. */
export function openReceipt(o, { onChange } = {}) {
  const actions = [];
  if (o.status === 'paid') actions.push({ label: 'Void order', cls: 'danger', onClick: async () => { await voidFlow(o, onChange); } });
  actions.push({ label: 'Print', onClick: () => { printReceipt(o); return true; } });
  actions.push({ label: 'Close', cls: 'primary' });
  modal({ title: `Order ${o.number}`, size: 'narrow', actions,
    body: receiptHtml(o) + (o.status === 'void' ? `<p class="small" style="text-align:center;color:var(--bad)">Voided ${esc(fmtDateTime(o.voided_at))}: ${esc(o.void_reason || '')}</p>` : '') });
}

async function voidFlow(o, onChange) {
  if (!(await askPin('void this order'))) return;
  modal({ title: `Void order ${o.number}?`, size: 'narrow',
    body: `<p style="margin-top:0">The sale of <b>${peso(o.total)}</b> stays in history marked as voided and is left out of the statistics.</p>${field('Reason', '<input name="reason" placeholder="e.g. wrong order, customer cancelled">')}`,
    actions: [{ label: 'Keep order' }, { label: 'Void order', cls: 'danger solid', onClick: async el => {
      const reason = el.querySelector('[name=reason]').value.trim();
      if (!reason) throw new Error('Give a reason for the void.');
      try { await Orders.voidOrder(o.id, reason); toast(`Order ${o.number} voided`); onChange?.(); } catch (e) { fail(e); }
    } }] });
}
