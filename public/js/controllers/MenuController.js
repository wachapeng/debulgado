// Controller: menu management.
import * as View from '../views/MenuView.js';
import * as Menu from '../models/MenuModel.js';
import { on } from '../core/bus.js';
import { screenState } from '../core/prefs.js';
import { modal, askPin, toast, fail, formValues } from '../core/ui.js';
import { loadImage } from '../core/photo.js';
import { openCropper } from './PhotoCropper.js';
import { PALETTE } from '../core/colors.js';
import * as Stock from '../models/InventoryModel.js';
import { recipeHtml, newRecipeRow } from '../views/InventoryView.js';
import { scanBarcode } from '../core/barcode.js';
import { toCentavos } from '../core/format.js';

const st = screenState('menu', { tab: 'products' });
let root;

export function mount(el) {
  root = el;
  el.innerHTML = View.layout(st.tab);
  el.querySelector('[data-tabs]').addEventListener('click', e => {
    const t = e.target.dataset.tab; if (!t) return;
    st.tab = t; st.save();
    el.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    render();
  });
  el.querySelector('[data-add]').addEventListener('click', () => edit(null));
  el.querySelector('[data-body]').addEventListener('click', e => { const r = e.target.closest('[data-edit]'); if (r) edit(r.dataset.edit); });
  on('menu', render);
  render();
}
export function show() {}
export function hide() {}

function render() {
  root.querySelector('[data-add]').textContent = View.addLabel(st.tab);
  const body = root.querySelector('[data-body]');
  if (st.tab === 'products') body.innerHTML = View.productsHtml(Menu.categories(), Menu.products(), Menu.colorOf);
  if (st.tab === 'addons') body.innerHTML = View.addonsHtml(Menu.addons(), Menu.categoryName);
  if (st.tab === 'categories') body.innerHTML = View.categoriesHtml(Menu.categories(), Menu.products(), Menu.colorOf);
}

async function edit(id) {
  if (!(await askPin('change the menu'))) return;
  const table = st.tab;
  const row = id ? Menu[table]().find(r => r.id === id) : {};
  const cats = Menu.categories();
  const noun = { products: 'product', addons: 'add-on', categories: 'category' }[table];
  if (table === 'products' && !cats.length) return toast('Add a category first.', 'bad');
  const stockItems = Stock.items({ activeOnly: true });
  const recipe = table === 'categories' ? '' : recipeHtml(row.recipe || [], stockItems, table === 'products' ? 'one serving' : 'one add-on');
  const body = (table === 'products' ? View.productForm(row, cats) : table === 'addons' ? View.addonForm(row, cats) : View.categoryForm(row, id ? Menu.colorOf(id) : PALETTE[Menu.categories().length % PALETTE.length].hex))
    .replace(/<\/div>$/, recipe + '</div>');
  const photo = { image: row.image || null };
  modal({ title: id ? `Edit ${row.name}` : `Add ${noun}`, body, onOpen: el => { if (table === 'products') bindPhoto(el, photo); if (recipe) bindRecipe(el, stockItems); },
    actions: [{ label: 'Cancel' }, { label: `Save ${noun}`, cls: 'primary', onClick: async el => {
      const f = formValues(el);
      const name = String(f.name || '').trim();
      if (!name) throw new Error('Give it a name.');
      let saved;
      if (table === 'products') {
        if (String(f.price).trim() === '' || toCentavos(f.price) < 0) throw new Error('Enter a price.');
        if (photo.busy) throw new Error('The photo is still loading. Try again in a moment.');
        saved = { ...row, name, category_id: f.category_id, price: toCentavos(f.price), sort: Number(f.sort) || (row.sort ?? 99), active: f.active ? 1 : 0, image: photo.image };
      } else if (table === 'addons') {
        if (String(f.price).trim() === '') throw new Error('Enter a price.');
        saved = { ...row, name, price: toCentavos(f.price), active: f.active ? 1 : 0, category_ids: [...el.querySelectorAll('[data-cat]:checked')].map(x => x.dataset.cat) };
      } else saved = { ...row, name, sort: Number(f.sort) || (row.sort ?? 99), active: f.active ? 1 : 0, color: el.querySelector('[name=color]:checked')?.value || null };
      if (recipe) saved.recipe = readRecipe(el);
      delete saved.dirty;
      await Menu.save(table, saved);
      toast(`${name} saved`, 'good');
    } }] });
}

/** The photo part of the product form: upload (button or drag-and-drop), place it in the square, adjust, remove. */
function bindPhoto(el, photo) {
  const file = el.querySelector('[data-photo-file]'), preview = el.querySelector('[data-photo-preview]');
  const category = el.querySelector('[name=category_id]');
  const show = () => {
    preview.innerHTML = View.photoPreview(photo.image, Menu.categoryName(category.value));
    el.querySelector('[data-photo-pick]').textContent = photo.image ? 'Change photo' : 'Upload photo';
    el.querySelector('[data-photo-adjust]').hidden = !photo.image;
    el.querySelector('[data-photo-remove]').hidden = !photo.image;
  };
  async function place(source) {
    if (!source) return;
    photo.busy = true; preview.classList.add('busy');
    try {
      const img = await loadImage(source);
      const placed = await openCropper(img);
      if (placed) { photo.image = placed; show(); }
    } catch (e) { fail(e); } finally { photo.busy = false; preview.classList.remove('busy'); }
  }
  el.querySelector('[data-photo-pick]').addEventListener('click', () => file.click());
  el.querySelector('[data-photo-adjust]').addEventListener('click', () => place(photo.image));
  el.querySelector('[data-photo-remove]').addEventListener('click', () => { photo.image = null; show(); });
  file.addEventListener('change', () => { const f = file.files[0]; file.value = ''; place(f); });
  preview.addEventListener('click', () => (photo.image ? place(photo.image) : file.click()));
  preview.addEventListener('dragover', e => { e.preventDefault(); preview.classList.add('drop'); });
  preview.addEventListener('dragleave', () => preview.classList.remove('drop'));
  preview.addEventListener('drop', e => { e.preventDefault(); preview.classList.remove('drop'); place(e.dataTransfer.files[0]); });
  category.addEventListener('change', () => { if (!photo.image) show(); }); // the drawn icon follows the category
}

/** The ingredient list in the product / add-on form: add (pick or scan), change, remove. */
function bindRecipe(el, items) {
  const rows = el.querySelector('[data-recipe-rows]');
  if (!rows) return;
  const add = itemId => { rows.insertAdjacentHTML('beforeend', newRecipeRow(items, itemId)); rows.lastElementChild.querySelector('[data-r-qty]').focus(); };
  el.querySelector('[data-r-add]')?.addEventListener('click', () => add());
  el.querySelector('[data-r-scan]')?.addEventListener('click', async () => {
    const code = await scanBarcode({ title: 'Scan an ingredient' });
    if (!code) return;
    const found = Stock.byBarcode(code);
    if (!found) return toast(`No stock item has the barcode ${code}. Add it in Inventory first.`, 'bad');
    const row = [...rows.querySelectorAll('[data-recipe-row]')].find(r => r.querySelector('[data-r-item]').value === found.id);
    if (row) row.querySelector('[data-r-qty]').focus(); else add(found.id);
  });
  rows.addEventListener('click', e => { if (e.target.closest('[data-r-remove]')) e.target.closest('[data-recipe-row]').remove(); });
  rows.addEventListener('change', e => {
    if (!e.target.matches('[data-r-item]')) return;
    e.target.closest('[data-recipe-row]').querySelector('[data-r-unit]').textContent = e.target.selectedOptions[0]?.dataset.unit || '';
  });
}
function readRecipe(el) {
  const lines = [], seen = new Set();
  for (const r of el.querySelectorAll('[data-recipe-row]')) {
    const itemId = r.querySelector('[data-r-item]').value, raw = r.querySelector('[data-r-qty]').value.trim(), qty = Number(raw.replace(/,/g, ''));
    const name = r.querySelector('[data-r-item]').selectedOptions[0]?.textContent;
    if (!raw || !(qty > 0)) throw new Error(`Enter how much ${name} is used (more than 0), or remove that line.`);
    if (seen.has(itemId)) throw new Error(`${name} is listed twice.`);
    seen.add(itemId); lines.push({ item_id: itemId, qty });
  }
  return lines;
}
