// Controller: the order screen. Keeps the cart (saved on the device, so it survives page switches
// and app restarts), reacts to taps, and records the sale through the Order model.
import * as View from '../views/PosView.js';
import * as Menu from '../models/MenuModel.js';
import * as Orders from '../models/OrderModel.js';
import * as Shop from '../models/ShopModel.js';
import { on } from '../core/bus.js';
import { prefs, setPref, screenState } from '../core/prefs.js';
import { celebrate, fail, confirmBox, modal, toast } from '../core/ui.js';
import * as Online from '../models/OnlineModel.js';
import * as OnlineView from '../views/OnlineView.js';
import * as OnlineScreen from './OnlineController.js';
import { openReceipt } from '../views/components/receipt.js';
import { esc, peso } from '../core/format.js';

const ui = screenState('pos', { cat: 'all', q: '' });
const cart = screenState('cart', { lines: [], service: 'dine-in', discount: { type: 'none', value: '' }, method: 'cash', tendered: '', ref: '', online: null });
let root, nextNumber = '', visible = false;
let selecting = false;
const selected = new Set(); // keys of ticket lines picked for deleting
const $ = sel => root.querySelector(sel);

export function mount(el) {
  root = el;
  el.innerHTML = View.layout();
  $('[data-search]').value = ui.q;
  bind();
  renderAll();
  refreshNumber();
  on('menu', renderAll);
  on('shop', renderTicket);
  on('orders', refreshNumber);
  on('online', renderOnline);
  on('prefs', k => { if (['cardSize', 'favorites'].includes(k)) { renderCats(); renderGrid(); } if (k === 'prefix') refreshNumber(); });
  document.addEventListener('keydown', e => {
    if (visible && e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); $('[data-search]').focus(); }
  });
}
export function show() { visible = true; refreshNumber(); }
/** Something is on the ticket (so the app should not reload itself for an update right now). */
export const hasItems = () => cart.lines.length > 0;
export function hide() { visible = false; openSheet(false); }

// ---------- state helpers ----------
function lines() {
  // Rebuild cart lines from the current menu, so price edits apply and removed items drop out.
  return cart.lines.map(l => {
    const product = Menu.product(l.product_id);
    if (!product || !product.active) return null;
    const allowed = Menu.addonsFor(product);
    const addons = l.addon_ids.map(id => allowed.find(a => a.id === id)).filter(Boolean);
    return { ...l, product, addons, unit: product.price + addons.reduce((s, a) => s + a.price, 0) };
  }).filter(Boolean);
}
const seniorRate = () => Number(Shop.get().senior_pwd_rate) || 20;
const pricing = ls => Orders.totals(ls, cart.discount, seniorRate());
const keyOf = (pid, ids) => pid + '|' + [...ids].sort().join(',');
const itemCount = ls => ls.reduce((s, l) => s + l.qty, 0);
// On phones and tablets the keyboard would cover the payment window, so it only opens when the cashier taps a box.
const touch = () => matchMedia('(pointer: coarse)').matches;
function commit() {
  // An online order whose items were all removed goes back to the Online orders list.
  if (cart.online && !cart.lines.length) { Online.putBack(cart.online.id); cart.online = null; }
  cart.save(); renderTicket(); renderGridCounts(); renderOnline();
}
async function refreshNumber() {
  nextNumber = await Orders.peekNumber();
  const el = root?.querySelector('.ticket-head .small');
  if (el) el.textContent = el.textContent.replace(/^[^·]*/, nextNumber + ' ').trim();
}

// ---------- rendering ----------
function renderAll() { renderSizes(); renderCats(); renderGrid(); renderTicket(); renderOnline(); }
function renderOnline() {
  const s = Online.state;
  const waiting = s.orders.filter(o => o.id !== cart.online?.id).length;
  root.querySelectorAll('[data-online-bar]').forEach(b => {
    b.innerHTML = OnlineView.barHtml(s, cart.online?.id);
    b.classList.toggle('has', waiting > 0);
    b.classList.toggle('closed', !s.open);
  });
}
function renderSizes() { root.querySelectorAll('[data-size]').forEach(b => b.classList.toggle('on', b.dataset.size === prefs.cardSize)); }
function renderCats() {
  const cats = Menu.categories({ activeOnly: true });
  if (ui.cat === 'fav' && !prefs.favorites.length) ui.cat = 'all';
  if (!['all', 'fav'].includes(ui.cat) && !cats.some(c => c.id === ui.cat)) ui.cat = 'all';
  $('[data-cats]').innerHTML = View.categoriesHtml(cats.map(c => ({ ...c, color: Menu.colorOf(c.id) })), ui.cat, prefs.favorites.length);
}
function visibleProducts() {
  const q = ui.q.trim().toLowerCase();
  return Menu.products({ activeOnly: true }).filter(p =>
    (ui.cat === 'all' || (ui.cat === 'fav' ? prefs.favorites.includes(p.id) : p.category_id === ui.cat)) &&
    (!q || p.name.toLowerCase().includes(q) || Menu.categoryName(p.category_id).toLowerCase().includes(q)));
}
function counts() { const c = {}; for (const l of cart.lines) c[l.product_id] = (c[l.product_id] || 0) + l.qty; return c; }
function renderGrid() {
  const grid = $('[data-grid]');
  grid.dataset.size = prefs.cardSize;
  grid.innerHTML = View.gridHtml(visibleProducts(), { favorites: prefs.favorites, counts: counts(), categoryName: Menu.categoryName, colorOf: Menu.colorOf, query: ui.q, cat: ui.cat });
}
function renderGridCounts() {
  const c = counts();
  root.querySelectorAll('.prod[data-p]').forEach(el => { const n = c[el.dataset.p] || 0; el.classList.toggle('in-cart', !!n); el.querySelector('.count').textContent = n; });
}
function renderTicket() {
  const ls = lines(), t = pricing(ls);
  for (const k of [...selected]) if (!ls.some(l => l.key === k)) selected.delete(k);
  if (!ls.length) selecting = false;
  const tk = $('[data-ticket]');
  tk.innerHTML = View.ticketHtml({ lines: ls, t, cart, addonsFor: Menu.addonsFor, nextNumber, selecting, selected });
  tk.classList.toggle('selecting', selecting);
  const bar = $('[data-cart-bar]'), items = itemCount(ls);
  bar.classList.toggle('hidden', !items);
  bar.innerHTML = View.cartBarHtml(items, t.total);
  if (!items) openSheet(false);
}
function openSheet(open) { $('[data-ticket]').classList.toggle('open', open); $('[data-sheet-back]').classList.toggle('open', open); }

// ---------- adding and removing ----------
function add(pid) {
  const key = keyOf(pid, []);
  const found = cart.lines.find(l => l.key === key);
  if (found) found.qty++; else cart.lines.push({ key, product_id: pid, qty: 1, addon_ids: [] });
  commit();
  root.querySelector(`.prod[data-p="${CSS.escape(pid)}"] .count`)?.animate?.([{ transform: 'translate(-50%, -50%) scale(1.25)' }, { transform: 'translate(-50%, -50%) scale(1)' }], { duration: 180 });
}

const describe = l => `${l.qty > 1 ? l.qty + '× ' : ''}${l.product.name}${l.addons.length ? ' + ' + l.addons.map(a => a.name).join(', ') : ''}`;

/** Remove whole ticket lines, after asking. */
async function removeLines(keys) {
  const ls = lines().filter(l => keys.includes(l.key));
  if (!ls.length) return;
  const list = ls.map(l => `<li>${esc(describe(l))}</li>`).join('');
  const ok = await confirmBox(ls.length === 1 ? 'Remove this item?' : `Remove ${ls.length} items?`,
    `<ul class="confirm-list">${list}</ul>`, 'Remove', 'danger solid');
  if (!ok) return;
  cart.lines = cart.lines.filter(l => !keys.includes(l.key));
  selected.clear(); selecting = false; // done selecting once the picked items are gone
  commit();
}

/** One less of a ticket line; the last one asks before removing. */
function decLine(i) {
  const l = cart.lines[i];
  if (!l) return;
  if (l.qty > 1) { l.qty--; commit(); } else removeLines([l.key]);
}

/** One less of a product from its card: takes it off the most recently added line for that product. */
function decProduct(pid) {
  for (let i = cart.lines.length - 1; i >= 0; i--) if (cart.lines[i].product_id === pid) return decLine(i);
}

function toggleAddon(i, aid) {
  const l = cart.lines[i];
  l.addon_ids = l.addon_ids.includes(aid) ? l.addon_ids.filter(x => x !== aid) : [...l.addon_ids, aid];
  l.key = keyOf(l.product_id, l.addon_ids);
  const dup = cart.lines.findIndex((x, j) => j !== i && x.key === l.key);
  if (dup >= 0) { cart.lines[dup].qty += l.qty; cart.lines.splice(i, 1); }
  commit();
}
function toggleFavorite(pid) {
  const favs = prefs.favorites.includes(pid) ? prefs.favorites.filter(x => x !== pid) : [...prefs.favorites, pid];
  setPref('favorites', favs);
}
function resetPayment() { Object.assign(cart, { discount: { type: 'none', value: '' }, tendered: '', ref: '' }); }
async function clearAll() {
  const ls = lines();
  if (!ls.length) return;
  const text = cart.online ? `${esc(cart.online.name)}'s online order goes back to the Online orders list.` : `All ${itemCount(ls)} items will be removed from the ticket.`;
  if (!(await confirmBox('Clear the whole order?', text, 'Clear order', 'danger solid'))) return;
  cart.lines = []; resetPayment(); selected.clear(); selecting = false; commit();
}

// ---------- online orders (sent from customers' phones) ----------
/** Put an online order on the ticket. Resolves true when it is there. */
async function loadOnline(o, { force = false, asked = false } = {}) {
  if (cart.online?.id === o.id) { openSheet(true); return true; }
  const ls = lines();
  if (ls.length && !asked) {
    const text = cart.online ? `${esc(cart.online.name)}'s order goes back to the Online orders list.` : `The ${itemCount(ls)} items on the ticket now will be removed.`;
    if (!(await confirmBox(`Open ${esc(o.name)}'s order?`, text, 'Open order'))) return false;
  }
  let taken;
  try { taken = await Online.take(o.id, force); }
  catch (e) {
    if (e.data?.opened_elsewhere) {
      if (!(await confirmBox(`Open ${esc(o.name)}'s order here?`, `It is open on ${esc(e.data.opened_by_name)}. Opening it here moves it to this device.`, 'Open here'))) return false;
      return loadOnline(o, { force: true, asked: true });
    }
    throw e;
  }
  if (cart.online && cart.online.id !== taken.id) Online.putBack(cart.online.id);
  const missing = [];
  cart.lines = [];
  for (const item of taken.items) {
    const p = Menu.product(item.product_id);
    if (!p || !p.active) { missing.push(item.name); continue; }
    const ids = item.addons.map(a => a.id).filter(id => Menu.addonsFor(p).some(a => a.id === id));
    const key = keyOf(p.id, ids), found = cart.lines.find(l => l.key === key);
    if (found) found.qty += item.qty; else cart.lines.push({ key, product_id: p.id, qty: item.qty, addon_ids: ids });
  }
  cart.online = { id: taken.id, name: taken.name };
  cart.service = taken.service === 'take-out' ? 'take-out' : 'dine-in';
  resetPayment(); selected.clear(); selecting = false;
  if (!cart.lines.length) { Online.putBack(taken.id); cart.online = null; throw new Error(`None of ${taken.name}'s items are on this device's menu. Sync, then try again.`); }
  commit();
  if (missing.length) toast(`Not on this device's menu, left out: ${missing.join(', ')}`, 'bad');
  else toast(`${taken.name}'s order is on the ticket`, 'good');
  if (matchMedia('(max-width: 760px)').matches) openSheet(true);
  return true;
}
function openOnlineList() {
  OnlineScreen.openList({ load: loadOnline, currentId: () => cart.online?.id,
    onCancelled: id => { if (cart.online?.id === id) { cart.online = null; cart.lines = []; resetPayment(); commit(); } } });
}
function putBack() {
  if (!cart.online) return;
  const name = cart.online.name;
  Online.putBack(cart.online.id);
  cart.online = null; cart.lines = []; resetPayment(); selected.clear(); selecting = false; commit();
  toast(`${name}'s order is back in Online orders`);
}

// ---------- payment window ----------
function openPayment() {
  const ls = lines();
  if (!ls.length) return;
  let busy = false;
  const m = modal({ title: 'Payment', size: 'pay', body: '<div data-pay-body></div>',
    actions: [{ label: 'Cancel' }, { label: 'Confirm payment', cls: 'primary lg', onClick: () => confirm() }],
    autofocus: !touch(), onOpen: el => draw(el) });

  function draw(el = m) {
    const t = pricing(ls);
    el.querySelector('[data-pay-body]').innerHTML = View.paymentHtml({ cart, t, items: itemCount(ls), seniorRate: seniorRate() });
    updateButton(t, el);
  }
  function updateButton(t = pricing(ls), el = m) {
    const btn = el.querySelector('.modal-foot .primary');
    if (btn) btn.textContent = `Confirm payment · ${peso(t.total)}`;
  }
  function refresh() { // numbers only, so the box you are typing in keeps its cursor
    const t = pricing(ls);
    m.querySelector('[data-pay-total]').innerHTML = View.payTotalHtml(t);
    const ch = m.querySelector('[data-change]'); if (ch) ch.innerHTML = View.changeHtml(t, cart.tendered);
    updateButton(t);
  }
  async function confirm() {
    if (busy) return true;
    const t = pricing(ls);
    if (cart.method === 'cash' && cart.tendered !== '' && Math.round((Number(cart.tendered) || 0) * 100) < t.total)
      throw new Error('Amount tendered is less than the total.');
    busy = true;
    try {
      const order = await Orders.create({ lines: ls, service: cart.service, discount: cart.discount, seniorRate: seniorRate(),
        payment: { method: cart.method, tendered: cart.method === 'cash' && cart.tendered === '' ? t.total / 100 : cart.tendered, ref: cart.ref },
        customer: cart.online ? { name: cart.online.name, onlineOrderId: cart.online.id } : null });
      if (cart.online) { Online.markPaid(cart.online.id); cart.online = null; }
      cart.lines = []; resetPayment(); commit(); openSheet(false);
      setTimeout(() => celebrate(order, { onReceipt: o => openReceipt(o) }), 0);
      return false;
    } finally { busy = false; }
  }

  m.addEventListener('click', e => {
    const b = e.target.closest('[data-pay-body] button'); if (!b) return;
    const d = b.dataset;
    if (d.method) { cart.method = d.method; cart.save(); draw(); if (!touch()) m.querySelector('[data-tendered], [data-ref]')?.focus(); }
    if (d.quick) { cart.tendered = d.quick; cart.save(); m.querySelector('[data-tendered]').value = d.quick; refresh(); }
  });
  m.addEventListener('input', e => {
    if (e.target.matches('[data-tendered]')) { cart.tendered = e.target.value; cart.save(); refresh(); }
    if (e.target.matches('[data-ref]')) { cart.ref = e.target.value; cart.save(); }
    if (e.target.matches('[data-discount-value]')) { cart.discount.value = e.target.value; cart.save(); refresh(); }
  });
  m.addEventListener('change', e => {
    if (e.target.matches('[data-discount]')) { cart.discount = { type: e.target.value, value: '' }; cart.save(); draw(); m.querySelector('[data-discount-value]')?.focus(); }
  });
  m.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); m.querySelector('.modal-foot .primary').click(); } });
  m.onClose = () => commit(); // show the chosen discount on the ticket
}

// ---------- events ----------
function bind() {
  $('[data-search]').addEventListener('input', e => { ui.q = e.target.value; ui.save(); renderGrid(); });
  $('[data-sizes]').addEventListener('click', e => { const s = e.target.dataset.size; if (s) { setPref('cardSize', s); renderSizes(); } });
  $('[data-cats]').addEventListener('click', e => { const c = e.target.closest('[data-cat]'); if (c) { ui.cat = c.dataset.cat; ui.save(); renderCats(); renderGrid(); } });
  const grid = $('[data-grid]');
  grid.addEventListener('click', e => {
    const fav = e.target.closest('[data-fav]'); if (fav) return toggleFavorite(fav.dataset.fav);
    const dec = e.target.closest('[data-card-dec]'); if (dec) return decProduct(dec.dataset.cardDec);
    const inc = e.target.closest('[data-card-inc]'); if (inc) return add(inc.dataset.cardInc);
    const p = e.target.closest('[data-p]'); if (p) add(p.dataset.p);
  });
  grid.addEventListener('keydown', e => { const p = e.target.closest('[data-p]'); if (p && (e.key === 'Enter' || e.key === ' ') && e.target === p) { e.preventDefault(); add(p.dataset.p); } });
  $('[data-cart-bar]').addEventListener('click', () => openSheet(true));
  root.querySelectorAll('[data-online-bar]').forEach(b => b.addEventListener('click', openOnlineList));
  $('[data-sheet-back]').addEventListener('click', () => openSheet(false));

  const tk = $('[data-ticket]');
  tk.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const d = b.dataset;
    if (d.closeSheet !== undefined) return openSheet(false);
    if (d.putBack !== undefined) return putBack();
    if (d.selectMode !== undefined) { selecting = !selecting; selected.clear(); return renderTicket(); }
    if (d.pickAll !== undefined) { const ls = lines(); if (ls.every(l => selected.has(l.key))) selected.clear(); else ls.forEach(l => selected.add(l.key)); return renderTicket(); }
    if (d.deletePicked !== undefined) return removeLines([...selected]);
    if (d.service) { cart.service = d.service; return commit(); }
    if (d.inc) { cart.lines[d.inc].qty++; return commit(); }
    if (d.dec) return decLine(Number(d.dec));
    if (d.remove) return removeLines([cart.lines[d.remove].key]);
    if (d.addon) return toggleAddon(Number(d.line), d.addon);
    if (d.clear !== undefined) return clearAll();
    if (d.pay !== undefined) return openPayment();
  });
  tk.addEventListener('change', e => {
    if (e.target.matches('[data-pick]')) {
      const k = e.target.dataset.pick;
      if (e.target.checked) selected.add(k); else selected.delete(k);
      renderTicket();
    }
  });
  // In select mode, tapping anywhere on an item's box ticks it.
  tk.addEventListener('click', e => {
    if (!selecting || e.target.closest('input, button')) return;
    const box = e.target.closest('[data-line-box]'); if (!box) return;
    const cb = box.querySelector('[data-pick]'); cb.checked = !cb.checked; cb.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
