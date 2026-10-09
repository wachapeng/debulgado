// View (customer's phone): builds the HTML of the order page. The controller handles taps.
import { esc, peso } from '../core/format.js';
import { ICON, productIcon } from '../core/icons.js';

export const layout = () => `
  <header class="c-head">
    <img class="brand-mark" src="/icons/icon.svg" alt="" width="40" height="40">
    <div><div class="c-shop" data-shop>Coffee shop</div><div class="c-sub">Order here, then pay at the counter</div></div>
  </header>
  <main class="c-main">
    <div data-notice></div>
    <div class="chips" data-cats></div>
    <div class="products c-products" data-size="m" data-grid></div>
  </main>
  <button class="c-cart-bar hidden" data-cart-bar></button>
  <div class="sheet-back" data-sheet-back></div>
  <section class="c-sheet" data-sheet aria-label="Your order"></section>
  <section class="c-scan hidden" data-scan aria-label="Scan the counter QR code"></section>
  <section class="c-done hidden" data-done aria-live="polite"></section>`;

export const noticeHtml = ({ open, error, sent }) => [
  error ? `<div class="c-notice bad">${esc(error)} <button class="link" data-retry>Try again</button></div>` : '',
  open === false ? '<div class="c-notice">The shop is not taking phone orders right now. Please order at the counter.</div>' : '',
  sent && sent.status === 'waiting' ? `<button class="c-notice good" data-view-sent>Your order for <b>${esc(sent.name)}</b> is waiting at the counter. <u>View</u></button>` : '',
].join('');

export function categoriesHtml(categories, active) {
  return [{ id: 'all', name: 'All' }, ...categories].map(c =>
    `<button class="chip ${active === c.id ? 'on' : ''}" data-cat="${esc(c.id)}">${esc(c.name)}</button>`).join('');
}

const picture = (p, category) => p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy" decoding="async">` : productIcon(category);

export function gridHtml(products, { counts, categoryName, headings }) {
  if (!products.length) return '<div class="empty" style="grid-column:1/-1"><b>Nothing here yet.</b>Try another category.</div>';
  let last = null;
  return products.map(p => {
    const n = counts[p.id] || 0;
    const head = headings && p.category_id !== last ? `<h2 class="c-cat-head">${esc(categoryName(p.category_id))}</h2>` : '';
    last = p.category_id;
    return `${head}<div class="prod ${n ? 'in-cart' : ''} ${p.image ? 'has-photo' : ''}" role="button" tabindex="0" data-p="${esc(p.id)}" aria-label="${esc(p.name)}, ${peso(p.price)}${n ? `, ${n} in your order` : ''}">
      <div class="pic">${picture(p, categoryName(p.category_id))}<span class="count" aria-hidden="true">${n}</span></div>
      <div class="name">${esc(p.name)}</div>
      <div class="price-row"><span class="price">${peso(p.price)}</span>
        <span class="card-qty"><button data-card-dec="${esc(p.id)}" aria-label="One less ${esc(p.name)}">−</button><button data-card-inc="${esc(p.id)}" aria-label="One more ${esc(p.name)}">+</button></span></div>
    </div>`;
  }).join('');
}

export const cartBarHtml = (n, sum) => `<span>View your order · ${n} item${n === 1 ? '' : 's'}</span><b>${peso(sum)}</b>`;

export function sheetHtml({ lines, sum, service, name, addonsFor, open }) {
  return `
    <div class="c-sheet-head"><h2>Your order</h2><button class="x" data-close-sheet aria-label="Close">×</button></div>
    <div class="lines">${lines.length ? lines.map((l, i) => {
      const options = addonsFor(l.product);
      return `<div class="line">
        <div class="line-top"><span class="line-name">${esc(l.product.name)}</span><span>${peso(l.unit * l.qty)}</span></div>
        <div class="line-ctl"><button class="qbtn" data-dec="${i}" aria-label="One less">−</button><b>${l.qty}</b><button class="qbtn" data-inc="${i}" aria-label="One more">+</button>
          <span class="muted small">× ${peso(l.unit)}</span></div>
        ${options.length ? `<div class="addon-toggles">${options.map(a => { const on = l.addons.some(x => x.id === a.id);
          return `<button data-line="${i}" data-addon="${esc(a.id)}" class="${on ? 'on' : ''}" aria-pressed="${on}">${on ? '✓' : '+'} ${esc(a.name)} ${peso(a.price)}</button>`; }).join('')}</div>` : ''}
      </div>`; }).join('') : '<div class="empty">Nothing yet. Tap a drink to add it.</div>'}</div>
    <div class="c-sheet-foot">
      <div class="seg wide" role="group" aria-label="Dine-in or take-out"><button data-service="dine-in" class="${service === 'dine-in' ? 'on' : ''}">Dine-in</button><button data-service="take-out" class="${service === 'take-out' ? 'on' : ''}">Take-out</button></div>
      <label class="f c-name"><span>Your name <span class="req">(required)</span></span>
        <input data-name value="${esc(name)}" maxlength="40" autocomplete="given-name" placeholder="So the cashier knows it's yours" enterkeyhint="done"></label>
      <p class="error-text hidden" data-name-error>Enter your name, so the cashier knows whose order it is.</p>
      <div class="totals"><div class="grand"><span>Total</span><span>${peso(sum)}</span></div></div>
      <button class="btn primary lg c-pay" data-pay ${lines.length && open !== false ? '' : 'disabled'}>${ICON.camera}<span>Pay ${lines.length ? peso(sum) : ''}</span></button>
      <p class="muted small c-hint">${open === false ? 'Phone orders are closed right now.' : 'Next, scan the QR code at the counter to send your order. You pay the cashier.'}</p>
    </div>`;
}

export const scanHtml = () => `
  <div class="c-scan-top"><b>Scan the QR code at the counter</b><button class="x" data-scan-close aria-label="Close">×</button></div>
  <div class="c-scan-view"><video data-video playsinline muted autoplay></video><div class="c-scan-frame" aria-hidden="true"></div></div>
  <div class="c-scan-msg" data-scan-msg role="status">Starting the camera…</div>
  <div class="c-scan-type">
    <button class="link" data-type-code>Can't scan? Type the code instead</button>
    <form class="hidden" data-code-form><input data-code placeholder="Code under the counter QR" autocapitalize="characters" autocomplete="off" spellcheck="false" maxlength="12" aria-label="Counter code"><button class="btn primary">Send</button></form>
  </div>`;

const STATUS = {
  waiting: ['wait', 'Waiting for the cashier'],
  at_counter: ['wait', 'The cashier has your order'],
  paid: ['good', 'Paid. Thank you!'],
  cancelled: ['bad', 'The shop cancelled this order. Please ask at the counter.'],
  gone: ['bad', 'This order is no longer in the shop’s list. Please ask at the counter.'],
};
const itemLine = i => `${i.qty > 1 ? i.qty + '× ' : ''}${esc(i.name)}${i.addons.length ? ` <span class="muted">+ ${i.addons.map(a => esc(a.name)).join(', ')}</span>` : ''}`;

export function doneHtml(o) {
  const key = o.status === 'waiting' && o.at_counter ? 'at_counter' : STATUS[o.status] ? o.status : 'waiting';
  const [kind, label] = STATUS[key];
  const finished = ['paid', 'cancelled', 'gone'].includes(o.status);
  return `<div class="c-done-card">
    <div class="c-done-icon ${kind}">${kind === 'good' ? ICON.check : kind === 'bad' ? '!' : ICON.bell}</div>
    <h1>${o.status === 'paid' ? 'Paid!' : finished ? 'Order not sent' : 'Order sent!'}</h1>
    ${o.status === 'paid' ? `<p>Your order is being made${o.receipt_no ? `. Receipt <b>${esc(o.receipt_no)}</b>` : ''}.</p>`
      : finished ? '' : '<p>Go to the counter and tell the cashier your name:</p>'}
    <div class="c-done-name">${esc(o.name)}</div>
    <div class="c-status ${kind}" data-status>${kind === 'wait' ? '<i class="dot"></i>' : ''}${esc(label)}</div>
    <div class="c-done-items">${o.items.map(i => `<div>${itemLine(i)}</div>`).join('')}
      <div class="c-done-total"><span>${o.service === 'take-out' ? 'Take-out' : 'Dine-in'} · ${o.status === 'paid' ? 'Paid' : 'To pay at the counter'}</span><b>${peso(o.total)}</b></div></div>
    <button class="btn ${finished ? 'primary' : 'soft'} lg" data-new-order>${finished ? 'Start a new order' : 'Back to the menu'}</button>
  </div>`;
}
