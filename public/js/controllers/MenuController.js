// Controller: menu management.
import * as View from '../views/MenuView.js';
import * as Menu from '../models/MenuModel.js';
import { on } from '../core/bus.js';
import { screenState } from '../core/prefs.js';
import { modal, askPin, toast, fail, formValues } from '../core/ui.js';
import { shrinkPhoto } from '../core/photo.js';
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
  if (st.tab === 'products') body.innerHTML = View.productsHtml(Menu.categories(), Menu.products());
  if (st.tab === 'addons') body.innerHTML = View.addonsHtml(Menu.addons(), Menu.categoryName);
  if (st.tab === 'categories') body.innerHTML = View.categoriesHtml(Menu.categories(), Menu.products());
}

async function edit(id) {
  if (!(await askPin('change the menu'))) return;
  const table = st.tab;
  const row = id ? Menu[table]().find(r => r.id === id) : {};
  const cats = Menu.categories();
  const noun = { products: 'product', addons: 'add-on', categories: 'category' }[table];
  if (table === 'products' && !cats.length) return toast('Add a category first.', 'bad');
  const body = table === 'products' ? View.productForm(row, cats) : table === 'addons' ? View.addonForm(row, cats) : View.categoryForm(row);
  const photo = { image: row.image || null };
  modal({ title: id ? `Edit ${row.name}` : `Add ${noun}`, body, onOpen: el => { if (table === 'products') bindPhoto(el, photo); },
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
      } else saved = { ...row, name, sort: Number(f.sort) || (row.sort ?? 99), active: f.active ? 1 : 0 };
      delete saved.dirty;
      await Menu.save(table, saved);
      toast(`${name} saved`, 'good');
    } }] });
}

/** The photo part of the product form: upload (button or drag-and-drop), preview, remove. */
function bindPhoto(el, photo) {
  const file = el.querySelector('[data-photo-file]'), preview = el.querySelector('[data-photo-preview]');
  const category = el.querySelector('[name=category_id]');
  const show = () => {
    preview.innerHTML = View.photoPreview(photo.image, Menu.categoryName(category.value));
    el.querySelector('[data-photo-pick]').textContent = photo.image ? 'Change photo' : 'Upload photo';
    el.querySelector('[data-photo-remove]').hidden = !photo.image;
  };
  async function use(f) {
    if (!f) return;
    photo.busy = true; preview.classList.add('busy');
    try { photo.image = await shrinkPhoto(f); show(); } catch (e) { fail(e); } finally { photo.busy = false; preview.classList.remove('busy'); }
  }
  el.querySelector('[data-photo-pick]').addEventListener('click', () => file.click());
  el.querySelector('[data-photo-remove]').addEventListener('click', () => { photo.image = null; show(); });
  file.addEventListener('change', () => { const f = file.files[0]; file.value = ''; use(f); });
  preview.addEventListener('click', () => file.click());
  preview.addEventListener('dragover', e => { e.preventDefault(); preview.classList.add('drop'); });
  preview.addEventListener('dragleave', () => preview.classList.remove('drop'));
  preview.addEventListener('drop', e => { e.preventDefault(); preview.classList.remove('drop'); use(e.dataTransfer.files[0]); });
  category.addEventListener('change', () => { if (!photo.image) show(); }); // the drawn icon follows the category
}
