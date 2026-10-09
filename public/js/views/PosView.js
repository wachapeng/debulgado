// View: the order screen (product grid, order ticket, payment window). Only builds HTML;
// the controller handles taps.
import { esc, peso } from '../core/format.js';
import { ICON, productIcon } from '../core/ui.js';
import { DISCOUNTS } from '../models/OrderModel.js';
import { ticketChipHtml } from './OnlineView.js';

export const layout = () => `
  <div class="pos">
    <section aria-label="Products">
      <div class="page-head"><div><h1>POS / Billing</h1><p>Tap a product to add it to the order.</p></div>
        <div class="seg" role="group" aria-label="Card size" data-sizes>
          <button data-size="s" title="Small cards">S</button><button data-size="m" title="Medium cards">M</button><button data-size="l" title="Large cards">L</button></div></div>
      <button class="online-bar for-phone" data-online-bar></button>
      <div class="pos-tools"><div class="search">${ICON.search}<input data-search placeholder="Search products… (press / )" aria-label="Search products" autocomplete="off"></div></div>
      <div class="chips" data-cats></div>
      <div class="products" data-grid></div>
    </section>
    <div class="pos-side">
      <aside class="ticket" data-ticket aria-label="Order ticket"></aside>
      <button class="online-bar for-desk" data-online-bar></button>
    </div>
  </div>
  <div class="sheet-back" data-sheet-back></div>
  <button class="cart-bar hidden" data-cart-bar></button>`;

export function categoriesHtml(categories, active, favCount) {
  const list = [...(favCount ? [{ id: 'fav', name: '★ Favorites' }] : []), { id: 'all', name: 'All' }, ...categories];
  return list.map(c => `<button class="chip ${active === c.id ? 'on' : ''}" data-cat="${esc(c.id)}">${c.color ? `<i class="chip-dot" style="background:${c.color}"></i>` : ''}${esc(c.name)}</button>`).join('');
}

/** The picture area of a product: its photo, or a drawn icon if it has none. */
export const productPicture = (p, category) => p.image
  ? `<img src="${esc(p.image)}" alt="" loading="lazy" decoding="async">`
  : productIcon(category);

export function gridHtml(products, { favorites, counts, categoryName, colorOf, query, cat }) {
  if (!products.length) {
    if (cat === 'fav') return `<div class="empty" style="grid-column:1/-1"><b>No favorites yet.</b>Tap the star on a product to keep it here.</div>`;
    return `<div class="empty" style="grid-column:1/-1"><b>No products match “${esc(query)}”.</b>Try another word or pick “All”.</div>`;
  }
  return products.map(p => {
    const fav = favorites.includes(p.id), n = counts[p.id] || 0, category = categoryName(p.category_id);
    return `<div class="prod ${n ? 'in-cart' : ''} ${p.image ? 'has-photo' : ''}" style="--cat:${colorOf(p.category_id)}" role="button" tabindex="0" data-p="${esc(p.id)}" aria-label="${esc(p.name)}, ${peso(p.price)}${n ? `, ${n} in order` : ''}">
      <button class="fav" data-fav="${esc(p.id)}" aria-pressed="${fav}" aria-label="${fav ? 'Remove from' : 'Add to'} favorites">${ICON.star}</button>
      <div class="pic">${productPicture(p, category)}<span class="count" aria-hidden="true">${n}</span></div>
      <div class="name">${esc(p.name)}</div><div class="cat">${esc(category)}</div>
      <div class="price-row"><span class="price">${peso(p.price)}</span>
        <span class="card-qty"><button data-card-dec="${esc(p.id)}" aria-label="One less ${esc(p.name)}">−</button><button data-card-inc="${esc(p.id)}" aria-label="One more ${esc(p.name)}">+</button></span></div>
    </div>`;
  }).join('');
}

// ---------- Order ticket ----------
export function ticketHtml(v) {
  const { lines, t, cart, addonsFor, nextNumber, selecting, selected } = v;
  const online = cart.online;
  const items = lines.reduce((s, l) => s + l.qty, 0);
  const allPicked = lines.length && lines.every(l => selected.has(l.key));
  return `
    <div class="ticket-head"><h2>Order ticket</h2>
      <span class="muted small">${esc(nextNumber)}${items ? ` · ${items} item${items === 1 ? '' : 's'}` : ''}</span>
      <span class="spacer"></span>
      ${lines.length ? `<button class="link small" data-select-mode>${selecting ? 'Done' : 'Select'}</button>` : ''}
      <button class="x ticket-close" data-close-sheet aria-label="Close order">×</button></div>
    ${online ? ticketChipHtml(online.name) : ''}
    <div class="seg wide" role="group" aria-label="Service"><button data-service="dine-in" class="${cart.service === 'dine-in' ? 'on' : ''}">Dine-in</button><button data-service="take-out" class="${cart.service === 'take-out' ? 'on' : ''}">Take-out</button></div>
    <div class="lines">${lines.length ? lines.map((l, i) => {
      const options = addonsFor(l.product), picked = selected.has(l.key);
      return `<div class="line ${selecting && picked ? 'picked' : ''}" data-line-box="${i}">
        <div class="line-top">
          ${selecting ? `<input type="checkbox" data-pick="${esc(l.key)}" ${picked ? 'checked' : ''} aria-label="Select ${esc(l.product.name)}">` : ''}
          <span class="line-name">${esc(l.product.name)}</span><span>${peso(l.unit * l.qty)}</span></div>
        ${l.addons.length && selecting ? `<div class="muted small">+ ${l.addons.map(a => esc(a.name)).join(', ')}</div>` : ''}
        ${selecting ? '' : `<div class="line-ctl"><button class="qbtn" data-dec="${i}" aria-label="One less">−</button><b>${l.qty}</b><button class="qbtn" data-inc="${i}" aria-label="One more">+</button>
          <span class="muted small">× ${peso(l.unit)}</span><span class="spacer"></span><button class="link bad small" data-remove="${i}">Remove</button></div>
        ${options.length ? `<div class="addon-toggles">${options.map(a => { const on = l.addons.some(x => x.id === a.id);
          return `<button data-line="${i}" data-addon="${esc(a.id)}" class="${on ? 'on' : ''}" aria-pressed="${on}">${on ? '✓' : '+'} ${esc(a.name)} ${peso(a.price)}</button>`; }).join('')}</div>` : ''}`}
      </div>`; }).join('') : '<div class="empty">No items yet. Tap a product to start.</div>'}</div>
    <div class="ticket-foot">
      ${selecting ? `
        <div class="row"><button class="link small" data-pick-all>${allPicked ? 'Unselect all' : 'Select all'}</button><span class="spacer"></span><span class="muted small">${selected.size} selected</span></div>
        <div class="ticket-actions"><button class="btn soft lg" data-select-mode>Cancel</button><button class="btn danger solid lg" data-delete-picked ${selected.size ? '' : 'disabled'}>Delete ${selected.size || ''}</button></div>`
      : `
        <div class="totals">
          ${t.discount ? `<div><span>Subtotal</span><span>${peso(t.subtotal)}</span></div><div><span>${esc(t.discount_label)}</span><span>−${peso(t.discount)}</span></div>` : ''}
          <div class="grand"><span>Total</span><span>${peso(t.total)}</span></div></div>
        <div class="ticket-actions"><button class="btn soft lg" data-clear ${lines.length ? '' : 'disabled'}>Clear</button><button class="btn primary lg" data-pay ${lines.length ? '' : 'disabled'}>Pay ${lines.length ? peso(t.total) : ''}</button></div>`}
    </div>`;
}

export const cartBarHtml = (items, total) => `<span>View order · ${items} item${items === 1 ? '' : 's'}</span><b>${peso(total)}</b>`;

// ---------- Payment window ----------
export function paymentHtml({ cart, t, items, seniorRate }) {
  const who = cart.online ? `<b>${esc(cart.online.name)}</b> · ` : '';
  const quick = [...new Set([t.total, Math.ceil(t.total / 5000) * 5000, Math.ceil(t.total / 10000) * 10000, 50000, 100000])]
    .filter(x => x >= t.total && x > 0).slice(0, 4);
  return `<div class="pay-window">
    <div class="pay-summary"><span>${who}${items} item${items === 1 ? '' : 's'} · ${cart.service === 'take-out' ? 'Take-out' : 'Dine-in'}</span><span>Subtotal ${peso(t.subtotal)}</span></div>
    <label class="f"><span>Discount</span><div class="row">
      <select data-discount style="flex:1">${Object.entries(DISCOUNTS).map(([k, label]) =>
        `<option value="${k}" ${cart.discount.type === k ? 'selected' : ''}>${label}${k === 'senior' || k === 'pwd' ? ` ${seniorRate}%` : ''}</option>`).join('')}</select>
      ${cart.discount.type.startsWith('promo') ? `<input data-discount-value style="width:110px" inputmode="decimal" placeholder="${cart.discount.type === 'promo_pct' ? '%' : '₱'}" value="${esc(cart.discount.value)}" aria-label="Promo amount">` : ''}
    </div></label>
    <div class="pay-total" data-pay-total>${payTotalHtml(t)}</div>
    <div class="pay-methods" role="group" aria-label="Payment method"><button data-method="cash" class="${cart.method === 'cash' ? 'on' : ''}">${ICON.cash} Cash</button><button data-method="gcash" class="${cart.method === 'gcash' ? 'on' : ''}">${ICON.phone} GCash</button></div>
    ${cart.method === 'cash' ? `
      <label class="f"><span>Amount tendered</span><input data-tendered inputmode="decimal" data-autofocus value="${esc(cart.tendered)}" placeholder="Blank = exact amount" autocomplete="off"></label>
      ${quick.length ? `<div class="quick-cash">${quick.map(x => `<button data-quick="${x / 100}">${x === t.total ? 'Exact' : peso(x)}</button>`).join('')}</div>` : ''}
      <div class="change" data-change>${changeHtml(t, cart.tendered)}</div>`
    : `<label class="f"><span>GCash reference no. <span class="muted">(optional)</span></span><input data-ref inputmode="numeric" data-autofocus value="${esc(cart.ref)}" placeholder="e.g. 1234 567 890123" autocomplete="off"></label>`}
  </div>`;
}

export const payTotalHtml = t => `${t.discount ? `<span class="muted small">${esc(t.discount_label)} −${peso(t.discount)}</span>` : '<span></span>'}
  <span class="pay-total-amount"><span class="muted">Total</span> ${peso(t.total)}</span>`;

export function changeHtml(t, tendered) {
  if (tendered === '') return `<span class="muted">Change</span><b>${peso(0)}</b>`;
  const given = Math.round((Number(tendered) || 0) * 100);
  return given >= t.total ? `<span class="muted">Change</span><b>${peso(given - t.total)}</b>` : `<span class="muted">Change</span><span class="short">Short by ${peso(t.total - given)}</span>`;
}
