// Controller: the customer's order page (opened from the order QR code on their own phone).
// Pick items, enter a name, tap Send order: the order appears on the POS, and this page shows its status.
import * as M from './CustomerModel.js';
import * as V from './CustomerView.js';

const root = document.getElementById('app');
const $ = sel => root.querySelector(sel);
const ui = { cat: 'all', error: '', showingMenu: false };
let sending = false, pollTimer = 0;

function toast(message, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = message;
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), kind === 'bad' ? 4500 : 2800);
}

// ---------- rendering ----------
function render() {
  const menu = M.state.menu;
  if (menu) {
    $('[data-shop]').textContent = menu.shop.name;
    document.title = `Order · ${menu.shop.name}`;
  }
  $('[data-notice]').innerHTML = V.noticeHtml({ open: menu?.open, error: ui.error, sent: M.state.sent });
  if (!menu) { $('[data-grid]').innerHTML = ui.error ? '' : '<div class="empty" style="grid-column:1/-1">Loading the menu…</div>'; return; }
  if (ui.cat !== 'all' && !menu.categories.some(c => c.id === ui.cat)) ui.cat = 'all';
  $('[data-cats]').innerHTML = V.categoriesHtml(menu.categories, ui.cat);
  renderGrid();
  renderCart();
  renderDone();
}
function renderGrid() {
  const list = M.state.menu.products.filter(p => ui.cat === 'all' || p.category_id === ui.cat);
  $('[data-grid]').innerHTML = V.gridHtml(list, { counts: M.counts(), categoryName: M.categoryName, colorOf: M.colorOf, headings: ui.cat === 'all' });
}
function renderCounts() {
  const c = M.counts();
  root.querySelectorAll('.prod[data-p]').forEach(el => { const n = c[el.dataset.p] || 0; el.classList.toggle('in-cart', !!n); el.querySelector('.count').textContent = n; });
}
function renderCart() {
  const ls = M.lines(), n = M.count(ls), sum = M.total(ls);
  const bar = $('[data-cart-bar]');
  bar.classList.toggle('hidden', !n);
  bar.innerHTML = V.cartBarHtml(n, sum);
  const sheet = $('[data-sheet]');
  const focused = document.activeElement?.matches?.('[data-name]');
  sheet.innerHTML = V.sheetHtml({ lines: ls, sum, service: M.state.cart.service, name: M.state.name, addonsFor: M.addonsFor, open: M.state.menu?.open });
  if (focused) { const i = sheet.querySelector('[data-name]'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
}
function openSheet(open) {
  if (open) M.hello();
  $('[data-sheet]').classList.toggle('open', open);
  $('[data-sheet-back]').classList.toggle('open', open);
  document.body.classList.toggle('no-scroll', open);
}
function renderDone() {
  const sent = M.state.sent, show = !!sent && !ui.showingMenu;
  $('[data-done]').classList.toggle('hidden', !show);
  document.body.classList.toggle('no-scroll', show || $('[data-sheet]').classList.contains('open'));
  if (show) $('[data-done]').innerHTML = V.doneHtml(sent);
  $('[data-notice]').innerHTML = V.noticeHtml({ open: M.state.menu?.open, error: ui.error, sent });
  schedulePoll();
}
function commit() { renderCounts(); renderCart(); M.hello(); }

// ---------- the menu ----------
async function loadMenu() {
  try { await M.loadMenu(); ui.error = ''; } catch (e) { ui.error = M.state.menu ? '' : e.message; if (M.state.menu) toast(e.message, 'bad'); }
  render();
}

// ---------- sending the order ----------
async function sendOrder() {
  const input = $('[data-name]');
  M.setName(input.value);
  if (!M.state.name.trim()) {
    $('[data-name-error]').classList.remove('hidden');
    input.classList.add('invalid');
    input.focus();
    return;
  }
  if (sending) return;
  sending = true;
  const btn = $('[data-send]');
  btn.disabled = true; btn.querySelector('span').textContent = 'Sending…';
  try {
    await M.send();
    openSheet(false);
    ui.showingMenu = false;
    renderGrid(); renderCart(); renderDone();
    navigator.vibrate?.(80);
  } catch (e) {
    const d = e.data || {};
    toast(e.message, 'bad');
    if (d.closed || d.menu_changed) await loadMenu();
    renderCart();
  } finally { sending = false; }
}

// ---------- after sending: follow the order ----------
function schedulePoll() {
  clearTimeout(pollTimer);
  const s = M.state.sent;
  if (!s || s.status !== 'waiting') return;
  pollTimer = setTimeout(async () => {
    if (document.visibilityState === 'visible') {
      try { await M.refreshSent(); } catch { /* try again next time */ }
      renderDone();
    } else schedulePoll();
  }, 7000);
}

// ---------- taps ----------
function bind() {
  $('[data-cats]').addEventListener('click', e => { const c = e.target.closest('[data-cat]'); if (c) { ui.cat = c.dataset.cat; render(); window.scrollTo({ top: 0 }); } });
  const grid = $('[data-grid]');
  grid.addEventListener('click', e => {
    const dec = e.target.closest('[data-card-dec]'); if (dec) { M.decProduct(dec.dataset.cardDec); return commit(); }
    const inc = e.target.closest('[data-card-inc]'); if (inc) { M.add(inc.dataset.cardInc); return commit(); }
    const p = e.target.closest('[data-p]'); if (p) { M.add(p.dataset.p); commit(); }
  });
  grid.addEventListener('keydown', e => { const p = e.target.closest('[data-p]'); if (p && (e.key === 'Enter' || e.key === ' ') && e.target === p) { e.preventDefault(); M.add(p.dataset.p); commit(); } });
  $('[data-cart-bar]').addEventListener('click', () => openSheet(true));
  $('[data-sheet-back]').addEventListener('click', () => openSheet(false));
  $('[data-notice]').addEventListener('click', e => {
    if (e.target.closest('[data-retry]')) loadMenu();
    if (e.target.closest('[data-view-sent]')) { ui.showingMenu = false; renderDone(); }
  });

  const sheet = $('[data-sheet]');
  sheet.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const d = b.dataset;
    if (d.closeSheet !== undefined) return openSheet(false);
    if (d.inc) { M.inc(Number(d.inc)); return commit(); }
    if (d.dec) { M.dec(Number(d.dec)); commit(); if (!M.lines().length) openSheet(false); return; }
    if (d.addon) { M.toggleAddon(Number(d.line), d.addon); return commit(); }
    if (d.service) { M.setService(d.service); return renderCart(); }
    if (d.send !== undefined) return sendOrder();
  });
  sheet.addEventListener('input', e => {
    if (e.target.matches('[data-name]')) {
      M.setName(e.target.value); M.hello();
      if (e.target.value.trim()) { e.target.classList.remove('invalid'); $('[data-name-error]').classList.add('hidden'); }
    }
  });
  sheet.addEventListener('keydown', e => { if (e.target.matches('[data-name]') && e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });

  $('[data-done]').addEventListener('click', e => {
    if (!e.target.closest('[data-new-order]')) return;
    if (['paid', 'cancelled', 'gone'].includes(M.state.sent?.status)) M.forgetSent(); else ui.showingMenu = true;
    renderDone(); window.scrollTo({ top: 0 });
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    openSheet(false);
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { schedulePoll(); if (M.state.sent?.status === 'waiting') M.refreshSent().then(renderDone, () => {}); } });
}

// ---------- start ----------
root.innerHTML = V.layout();
bind();
render();
loadMenu().then(() => { if (M.state.cart.lines.length) M.hello(); });
if (M.state.sent?.status === 'waiting') M.refreshSent().then(renderDone, () => {});
