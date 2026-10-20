// View: the Inventory screen (stock list, item form, stock update window) and the
// ingredient list in the product and add-on forms.
import { esc, peso, fmtDateTime } from '../core/format.js';
import { ICON, field } from '../core/ui.js';
import { UNITS } from '../models/InventoryModel.js';

export const fmtQty = n => (Math.round(n * 1000) / 1000).toLocaleString('en-PH', { maximumFractionDigits: 3 });
const LEVEL = { out: ['bad', 'Out'], low: ['warn', 'Low'], ok: ['good', 'OK'] };

export const layout = st => `
  <div class="page-head"><div><h1>Inventory</h1><p>Stock on hand. Each sale takes its ingredients off by itself.</p></div>
    <div class="row"><button class="btn" data-scan>${ICON.barcode} Scan</button><button class="btn primary" data-add>Add item</button></div></div>
  <div data-summary></div>
  <div class="filters">
    <input data-q type="search" placeholder="Name or barcode…" value="${esc(st.q)}" aria-label="Search stock">
    <select data-show aria-label="Show"><option value="">All items</option><option value="low" ${st.show === 'low' ? 'selected' : ''}>Low and out of stock</option><option value="hidden" ${st.show === 'hidden' ? 'selected' : ''}>Not in use</option></select>
  </div>
  <div data-list></div>
  <p class="muted small inv-tip">${ICON.barcode} With a USB barcode scanner, just scan an item on this screen: it opens that item (or offers to add a new one).</p>`;

export function summaryHtml({ count, low, out, value }) {
  return `<div class="summary-strip">
    <div><span>Items</span><b>${count}</b></div>
    <div><span>Low</span><b class="${low ? 'warn-text' : ''}">${low}</b></div>
    <div><span>Out of stock</span><b class="${out ? 'bad-text' : ''}">${out}</b></div>
    ${value != null ? `<div><span>Stock value</span><b>${peso(value)}</b></div>` : ''}</div>`;
}

export function listHtml(rows, { usedIn }) {
  if (!rows.length) return `<div class="panel empty"><b>No stock items here.</b>Tap “Add item” and scan the item's barcode, or scan it with a USB scanner.</div>`;
  return `<div class="panel table-wrap"><table class="menu-table inv-table">
    <colgroup><col class="c-name"><col class="c-qty"><col class="c-money"><col class="c-used"><col class="c-inv-act"></colgroup>
    <thead><tr><th>Item</th><th class="num">In stock</th><th class="num">Low at</th><th>Used in</th><th></th></tr></thead><tbody>
    ${rows.map(({ item, qty, level }) => {
      const [kind, label] = LEVEL[level], used = usedIn(item.id);
      return `<tr class="click ${item.active ? '' : 'muted-row'}" data-update="${esc(item.id)}">
        <td class="name-cell"><b>${esc(item.name)}</b><div class="muted small">${item.barcode ? `${ICON.barcode}<span class="code">${esc(item.barcode)}</span>` : 'No barcode'}</div></td>
        <td class="num"><span class="qty ${kind}">${fmtQty(qty)} ${esc(item.unit)}</span>${level !== 'ok' ? ` <span class="badge ${kind}">${label}</span>` : ''}</td>
        <td class="num muted">${fmtQty(item.low_level || 0)}</td>
        <td class="name-cell muted small" title="${esc(used.join(', '))}">${used.length ? esc(used.join(', ')) : '—'}</td>
        <td class="act"><button class="btn sm primary" data-update="${esc(item.id)}">Update stock</button> <button class="btn sm" data-edit="${esc(item.id)}">Edit</button></td></tr>`;
    }).join('')}</tbody></table></div>`;
}

export const itemForm = (i, isNew) => `<div class="stack">
  <div><label class="f"><span>Barcode</span></label>
    <div class="row"><input name="barcode" value="${esc(i.barcode || '')}" inputmode="numeric" autocomplete="off" placeholder="${i.id && !i.barcode ? 'No barcode' : 'Scan or type the barcode'}" style="flex:1" ${i.id && !i.barcode ? '' : ''}>
      <button type="button" class="btn" data-scan-field>${ICON.barcode} Scan</button></div>
    <label class="check small" style="margin-top:6px"><input type="checkbox" name="no_barcode" ${i.id && !i.barcode ? 'checked' : ''}> This item has no barcode (for example a syrup made in the shop)</label></div>
  ${field('Name', `<input name="name" value="${esc(i.name || '')}" placeholder="e.g. Fresh milk 1 L">`)}
  <div class="grid2">${field('Counted in', `<select name="unit">${UNITS.map(u => `<option ${u === (i.unit || 'pcs') ? 'selected' : ''}>${u}</option>`).join('')}</select>`)}
    ${field('Warn when stock is at or below', `<input name="low_level" inputmode="decimal" value="${i.low_level ?? ''}" placeholder="0">`)}</div>
  <div class="grid2">${field('Cost of one unit (₱, optional)', `<input name="cost" inputmode="decimal" value="${i.cost != null ? i.cost / 100 : ''}">`)}
    ${isNew ? field('Starting stock (how many you have now)', `<input name="start" inputmode="decimal" placeholder="0">`) : '<span></span>'}</div>
  <p class="muted small" style="margin:0">Use small units for ingredients: milk in ml, beans in g, cups in pcs. Recipes then say how much one drink uses.</p>
  <label class="check"><input type="checkbox" name="active" ${!i.id || i.active ? 'checked' : ''}> In use</label></div>`;

export const updateHtml = (item, qty, mode) => `<div class="stack">
  <div class="inv-now"><span class="muted">In stock now</span><b>${fmtQty(qty)} ${esc(item.unit)}</b></div>
  <div class="seg wide" role="group" aria-label="What happened" data-modes>
    <button type="button" data-mode="receive" class="${mode === 'receive' ? 'on' : ''}">Received</button>
    <button type="button" data-mode="count" class="${mode === 'count' ? 'on' : ''}">Counted</button>
    <button type="button" data-mode="waste" class="${mode === 'waste' ? 'on' : ''}">Wasted</button></div>
  <label class="f"><span data-qty-label>${{ receive: 'How many arrived', count: 'How many there are now', waste: 'How many were wasted' }[mode]} (${esc(item.unit)})</span>
    <input name="qty" inputmode="decimal" autocomplete="off" data-autofocus></label>
  <p class="muted small" data-preview style="margin:0"></p>
  ${field('Note (optional)', '<input name="note" maxlength="200" placeholder="e.g. delivery from supplier, spilled">')}
  <details class="inv-history" data-history><summary>Recent changes</summary><div data-history-body class="muted small">Loading…</div></details></div>`;

const REASON = { start: 'Starting stock', receive: 'Received', count: 'Counted', waste: 'Wasted', sale: 'Sale', void: 'Void (put back)' };
export function historyHtml(moves, unit) {
  if (!moves.length) return '<p class="muted small">No changes yet.</p>';
  return `<table class="hist"><tbody>${moves.map(m => `<tr><td>${esc(fmtDateTime(m.created_at))}</td><td>${esc(REASON[m.reason] || m.reason)}${m.order_no ? ` ${esc(m.order_no)}` : ''}${m.note ? ` · ${esc(m.note)}` : ''}</td>
    <td class="num ${m.change < 0 ? 'bad-text' : 'good-text'}">${m.change > 0 ? '+' : ''}${fmtQty(m.change)} ${esc(unit)}</td></tr>`).join('')}</tbody></table>`;
}

// ---------- ingredients in the product / add-on form ----------
const recipeRow = (line, items) => `<div class="recipe-row" data-recipe-row>
  <select data-r-item aria-label="Ingredient">${items.map(i => `<option value="${esc(i.id)}" data-unit="${esc(i.unit)}" ${i.id === line.item_id ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}</select>
  <input data-r-qty inputmode="decimal" value="${line.qty ?? ''}" placeholder="0" aria-label="Amount">
  <span class="muted small" data-r-unit>${esc(items.find(i => i.id === line.item_id)?.unit || items[0]?.unit || '')}</span>
  <button type="button" class="x" data-r-remove aria-label="Remove ingredient">×</button></div>`;

export function recipeHtml(recipe = [], items, what = 'one serving') {
  return `<div class="recipe" data-recipe>
    <div class="muted small" style="margin-bottom:6px">Ingredients for ${what} <span class="muted">(taken off the stock for each one sold)</span></div>
    <div data-recipe-rows>${recipe.filter(l => items.some(i => i.id === l.item_id)).map(l => recipeRow(l, items)).join('')}</div>
    ${items.length ? `<div class="row"><button type="button" class="btn sm" data-r-add>+ Add ingredient</button><button type="button" class="btn sm" data-r-scan>${ICON.barcode} Scan to add</button></div>`
      : '<p class="muted small" style="margin:0">Add stock items in Inventory first, then list them here.</p>'}</div>`;
}
export const newRecipeRow = (items, itemId) => recipeRow({ item_id: itemId || items[0]?.id, qty: '' }, items);
