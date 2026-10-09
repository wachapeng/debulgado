// Controller: online orders on the POS. The list window (open an order in the ticket, cancel it,
// open or close phone ordering), the order QR code window, and the alert when a new order comes in.
import * as View from '../views/OnlineView.js';
import * as Online from '../models/OnlineModel.js';
import * as Shop from '../models/ShopModel.js';
import { on } from '../core/bus.js';
import { prefs } from '../core/prefs.js';
import { modal, confirmBox, toast, fail, chime } from '../core/ui.js';
import { qrSvg } from '../core/qr.js';
import { esc, peso } from '../core/format.js';

/** Starts checking for online orders and announces new ones on any screen. */
export function start() {
  on('online', ({ added } = {}) => {
    if (!added?.length) return;
    const o = added[added.length - 1];
    toast(added.length === 1 ? `New online order: ${o.name} · ${peso(o.total)}` : `${added.length} new online orders`, 'good');
    if (prefs.sound) { chime(); setTimeout(chime, 450); }
    navigator.vibrate?.([80, 60, 80]);
    document.querySelectorAll('[data-online-bar]').forEach(b => { b.classList.remove('ring'); void b.offsetWidth; b.classList.add('ring'); });
  });
  Online.start();
}

/**
 * The list of waiting online orders.
 * load(order): puts the order on the ticket (resolves true when it did).
 * currentId(): the online order on the ticket now. onCancelled(id): an order was cancelled.
 */
export function openList({ load, currentId, onCancelled }) {
  const m = modal({ title: 'Online orders', size: 'online', autofocus: false, body: '<div data-online-list></div>', actions: [{ label: 'Close', cls: 'primary' }] });
  const draw = () => { m.querySelector('[data-online-list]').innerHTML = View.listHtml(Online.state, currentId()); };
  draw();
  m.onClose = on('online', draw);
  Online.refresh();

  m.addEventListener('click', async e => {
    const take = e.target.closest('[data-take]');
    if (take) {
      const o = Online.state.orders.find(x => x.id === take.dataset.take);
      if (!o) return;
      take.disabled = true;
      try { if (await load(o)) m.close(); } catch (err) { fail(err); Online.refresh(); } finally { take.disabled = false; }
      return;
    }
    const cancel = e.target.closest('[data-cancel-online]');
    if (cancel) {
      const o = Online.state.orders.find(x => x.id === cancel.dataset.cancelOnline);
      if (!o) return;
      if (!(await confirmBox(`Cancel ${esc(o.name)}'s order?`, `It leaves this list, and ${esc(o.name)}'s phone shows that the order was cancelled.`, 'Cancel order', 'danger solid'))) return;
      try { await Online.cancel(o.id); onCancelled?.(o.id); toast(`${o.name}'s order cancelled`); } catch (err) { fail(err); Online.refresh(); }
      return;
    }
    if (e.target.closest('[data-qr]')) openQrCodes();
  });
  m.addEventListener('change', async e => {
    if (!e.target.matches('[data-open-toggle]')) return;
    const want = e.target.checked;
    try { await Online.setOpen(want); toast(want ? 'Phone orders are open' : 'Phone orders are closed', want ? 'good' : ''); }
    catch (err) { e.target.checked = !want; fail(err); }
  });
}

// ---------- the order QR code ----------
export async function openQrCodes() {
  const orderUrl = `${location.origin}/order`;
  let parts;
  try { parts = { orderUrl, orderSvg: await qrSvg(orderUrl, { label: 'Order QR code' }) }; } catch (e) { return fail(e); }
  modal({ title: 'Order QR code', size: 'qr', autofocus: false, body: View.qrCodesHtml(parts), actions: [
    { label: 'Print', onClick: () => { print(parts); return true; } },
    { label: 'Close', cls: 'primary' },
  ] });
}

function print(parts) {
  document.getElementById('print-area').innerHTML = View.qrPrintHtml({ ...parts, shop: Shop.get().shop_name });
  if (window.AndroidApp?.print) window.AndroidApp.print(); // Android app: the phone's print screen
  else window.print();
}
