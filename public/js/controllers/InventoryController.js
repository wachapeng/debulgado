// Controller: the Inventory screen. Add items by scanning their barcode, update stock
// (received, counted, wasted), and find an item by scanning it.
import * as View from '../views/InventoryView.js';
import * as Stock from '../models/InventoryModel.js';
import * as Menu from '../models/MenuModel.js';
import { on } from '../core/bus.js';
import { api } from '../core/api.js';
import { screenState } from '../core/prefs.js';
import { modal, askPin, toast, confirmBox, formValues } from '../core/ui.js';
import { scanBarcode, listenForScanner, cleanCode } from '../core/barcode.js';
import { esc, toCentavos } from '../core/format.js';

const st = screenState('inventory', { q: '', show: '' });
let root, visible = false;
const num = v => { const n = Number(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : NaN; };

export function mount(el) {
  root = el;
  el.innerHTML = View.layout(st);
  el.querySelector('[data-q]').addEventListener('input', e => { st.q = e.target.value; st.save(); render(); });
  el.querySelector('[data-show]').addEventListener('change', e => { st.show = e.target.value; st.save(); render(); });
  el.querySelector('[data-add]').addEventListener('click', () => addByScan());
  el.querySelector('[data-scan]').addEventListener('click', () => findByScan());
  el.querySelector('[data-list]').addEventListener('click', e => {
    const ed = e.target.closest('[data-edit]'); if (ed) return editItem(Stock.item(ed.dataset.edit));
    const u = e.target.closest('[data-update]'); if (u) return updateStock(Stock.item(u.dataset.update));
  });
  listenForScanner(code => onScanned(code), () => visible); // a USB scanner on this screen
  on('inventory', render);
  on('menu', render);
  render();
}
export function show() { visible = true; render(); }
export function hide() { visible = false; }

/** Products and add-ons that use an item (for the "Used in" column). */
function usedIn(itemId) {
  return [...Menu.products(), ...Menu.addons()].filter(p => (p.recipe || []).some(l => l.item_id === itemId)).map(p => p.name);
}

function render() {
  if (!root) return;
  const all = Stock.items();
  const q = st.q.trim().toLowerCase();
  const rows = all.map(item => ({ item, qty: Stock.quantity(item), level: Stock.level(item) }))
    .filter(r => (st.show === 'hidden' ? !r.item.active : r.item.active) && (st.show !== 'low' || r.level !== 'ok')
      && (!q || r.item.name.toLowerCase().includes(q) || (r.item.barcode || '').includes(q)));
  const active = all.filter(i => i.active);
  const priced = active.filter(i => i.cost != null);
  root.querySelector('[data-summary]').innerHTML = View.summaryHtml({ count: active.length,
    low: active.filter(i => Stock.level(i) === 'low').length, out: active.filter(i => Stock.level(i) === 'out').length,
    value: priced.length ? Math.round(priced.reduce((s, i) => s + Math.max(0, Stock.quantity(i)) * i.cost, 0)) : null });
  root.querySelector('[data-list]').innerHTML = View.listHtml(rows, { usedIn });
}

// ---------- scanning ----------
async function onScanned(code) {
  const found = Stock.byBarcode(code);
  if (found) return updateStock(found, 'receive');
  if (await confirmBox('New barcode', `<b>${esc(code)}</b> isn't in the inventory yet. Add it as a new item?`, 'Add item')) editItem({ barcode: code });
}
async function findByScan() {
  const code = await scanBarcode({ title: 'Scan an item' });
  if (code) onScanned(code);
}
/** "Add item" starts by scanning the item's barcode. */
async function addByScan() {
  if (!(await askPin('change the inventory'))) return;
  const code = await scanBarcode({ title: "Scan the new item's barcode",
    extra: '<button class="link small" data-result="">This item has no barcode</button>' });
  if (code === null) return;
  const found = code && Stock.byBarcode(code);
  if (found) { toast(`${found.name} is already in the inventory`); return updateStock(found, 'receive'); }
  editItem({ barcode: code || '', noBarcode: !code });
}

// ---------- item form ----------
async function editItem(row) {
  if (!(await askPin('change the inventory'))) return;
  const isNew = !row.id;
  modal({ title: isNew ? 'Add stock item' : `Edit ${row.name}`, body: View.itemForm(row, isNew), onOpen: el => {
    const code = el.querySelector('[name=barcode]'), none = el.querySelector('[name=no_barcode]');
    if (row.noBarcode) none.checked = true;
    const sync = () => { code.disabled = none.checked; if (none.checked) code.value = ''; };
    none.addEventListener('change', sync); sync();
    el.querySelector('[data-scan-field]').addEventListener('click', async () => {
      const c = await scanBarcode({ title: 'Scan the barcode' });
      if (c) { none.checked = false; sync(); code.value = c; }
    });
    code.addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); }); // a USB scanner presses Enter after the code
    setTimeout(() => (isNew && !code.value && !none.checked ? code : el.querySelector('[name=name]')).focus(), 60);
  }, actions: [{ label: 'Cancel' }, { label: isNew ? 'Add item' : 'Save item', cls: 'primary', onClick: async el => {
    const f = formValues(el);
    const name = String(f.name || '').trim(), barcode = f.no_barcode ? '' : cleanCode(f.barcode);
    if (!barcode && !f.no_barcode) throw new Error('Scan the barcode, or tick “This item has no barcode”.');
    if (!name) throw new Error('Give the item a name.');
    const other = barcode && Stock.byBarcode(barcode);
    if (other && other.id !== row.id) throw new Error(`That barcode belongs to ${other.name}.`);
    const low = f.low_level === '' ? 0 : num(f.low_level), start = isNew && f.start !== '' ? num(f.start) : 0;
    if (!(low >= 0)) throw new Error('Enter a number for the warning level.');
    if (Number.isNaN(start)) throw new Error('Enter a number for the starting stock.');
    if (f.cost !== '' && !(num(f.cost) >= 0)) throw new Error('Enter a number for the cost, or leave it empty.');
    const { noBarcode, ...base } = row;
    const saved = await Stock.save({ ...base, name, barcode: barcode || null, unit: f.unit, low_level: low,
      cost: f.cost === '' ? null : toCentavos(f.cost), active: f.active ? 1 : 0 });
    if (start) await Stock.move(saved.id, start, 'start');
    toast(`${name} saved`, 'good');
  } }] });
}

// ---------- update stock ----------
function updateStock(item, mode = 'receive') {
  if (!item) return;
  const m = modal({ title: item.name, size: 'narrow', body: '<div data-body></div>', actions: [
    { label: 'Edit item', onClick: () => { setTimeout(() => editItem(item), 0); } },
    { label: 'Cancel' },
    { label: 'Save', cls: 'primary', onClick: async el => {
      const q = num(el.querySelector('[name=qty]').value), note = el.querySelector('[name=note]').value.trim();
      if (el.querySelector('[name=qty]').value.trim() === '' || Number.isNaN(q) || q < 0) throw new Error('Enter how many.');
      const now = Stock.quantity(item);
      const change = mode === 'receive' ? q : mode === 'waste' ? -q : q - now;
      await Stock.move(item.id, change, mode, note);
      toast(`${item.name}: ${View.fmtQty(Stock.quantity(item))} ${item.unit} in stock`, 'good');
    } }] });
  const draw = () => {
    m.querySelector('[data-body]').innerHTML = View.updateHtml(item, Stock.quantity(item), mode);
    const input = m.querySelector('[name=qty]');
    input.addEventListener('input', preview);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); m.querySelector('.modal-foot .primary').click(); } });
    m.querySelector('[data-history]').addEventListener('toggle', loadHistory, { once: true });
    setTimeout(() => input.focus(), 40);
  };
  function preview() {
    const q = num(m.querySelector('[name=qty]').value), now = Stock.quantity(item);
    const after = Number.isNaN(q) || m.querySelector('[name=qty]').value === '' ? null : mode === 'receive' ? now + q : mode === 'waste' ? now - q : q;
    m.querySelector('[data-preview]').textContent = after == null ? '' : `After saving: ${View.fmtQty(after)} ${item.unit}${mode === 'count' ? ` (${after - now >= 0 ? '+' : ''}${View.fmtQty(after - now)})` : ''}`;
  }
  async function loadHistory() {
    const box = m.querySelector('[data-history-body]');
    try { box.innerHTML = View.historyHtml((await api(`stock/${encodeURIComponent(item.id)}/history`)).moves, item.unit); }
    catch (e) { box.textContent = e.status === 0 ? 'Needs the internet.' : e.message; }
  }
  m.addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (b) { mode = b.dataset.mode; draw(); } });
  draw();
}
