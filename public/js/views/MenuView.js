// View: menu management (products, add-ons, categories).
import { esc, peso } from '../core/format.js';
import { field, productIcon } from '../core/ui.js';

const TABS = [['products', 'Products'], ['addons', 'Add-ons'], ['categories', 'Categories']];

export const layout = tab => `
  <div class="page-head"><div><h1>Menu</h1><p>Prices and items on the POS. Changes reach the other devices on the next sync.</p></div>
    <button class="btn primary" data-add></button></div>
  <div class="tabs" data-tabs>${TABS.map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div>
  <div data-body></div>`;
export const addLabel = tab => ({ products: 'Add product', addons: 'Add add-on', categories: 'Add category' }[tab]);

const status = active => (active ? '<span class="badge good">On sale</span>' : '<span class="badge">Hidden</span>');
const PENCIL = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/></svg>';
const editBtn = (id, name) => `<button class="btn sm" data-edit="${esc(id)}" aria-label="Edit ${esc(name)}">${PENCIL}<span>Edit</span></button>`;

/** Small picture of a product: its photo, or the drawn icon. */
export const thumb = (p, category) => `<span class="thumb">${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy">` : productIcon(category)}</span>`;

// Every table uses the same fixed column widths, so Price, Status and Edit line up from one table to the next.
const cols = (...names) => `<colgroup>${names.map(n => `<col class="c-${n}">`).join('')}</colgroup>`;

export function productsHtml(categories, products) {
  if (!categories.length) return '<div class="panel empty"><b>No categories yet.</b>Add a category first.</div>';
  return categories.map(c => {
    const list = products.filter(p => p.category_id === c.id);
    return `<div class="panel menu-panel"><div class="panel-head"><h2>${esc(c.name)}</h2><span class="muted small">${list.length} product${list.length === 1 ? '' : 's'}${c.active ? '' : ' · <span class="badge">Category hidden</span>'}</span></div>
      ${list.length ? `<div class="table-wrap"><table class="menu-table">${cols('pic', 'name', 'money', 'status', 'act')}
      <thead><tr><th></th><th>Product</th><th class="num">Price</th><th>Status</th><th></th></tr></thead><tbody>
      ${list.map(p => `<tr class="click" data-edit="${esc(p.id)}"><td>${thumb(p, c.name)}</td><td class="name-cell"><b>${esc(p.name)}</b>${p.active ? '' : '<span class="m-status"><span class="badge">Hidden</span></span>'}</td>
        <td class="num">${peso(p.price)}</td><td>${status(p.active)}</td><td class="act">${editBtn(p.id, p.name)}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted" style="margin:0">No products in this category yet.</p>'}</div>`;
  }).join('');
}

export function addonsHtml(addons, categoryName) {
  if (!addons.length) return '<div class="panel empty"><b>No add-ons yet.</b>Add-ons like Extra Shot appear as quick toggles on each drink.</div>';
  return `<div class="panel table-wrap"><table class="menu-table">${cols('name', 'money', 'name', 'status', 'act')}
    <thead><tr><th>Add-on</th><th class="num">Price</th><th>Offered for</th><th>Status</th><th></th></tr></thead><tbody>
    ${addons.map(a => `<tr class="click" data-edit="${esc(a.id)}"><td class="name-cell"><b>${esc(a.name)}</b>${a.active ? '' : '<span class="m-status"><span class="badge">Hidden</span></span>'}</td><td class="num">${peso(a.price)}</td>
      <td class="muted name-cell">${a.category_ids.map(id => esc(categoryName(id))).filter(Boolean).join(', ') || 'Nothing yet'}</td><td>${status(a.active)}</td><td class="act">${editBtn(a.id, a.name)}</td></tr>`).join('')}
    </tbody></table></div>`;
}

export function categoriesHtml(categories, products) {
  return `<div class="panel table-wrap"><table class="menu-table">${cols('name', 'money', 'money', 'status', 'act')}
    <thead><tr><th>Category</th><th class="num">Order</th><th class="num">Products</th><th>Status</th><th></th></tr></thead><tbody>
    ${categories.map(c => `<tr class="click" data-edit="${esc(c.id)}"><td class="name-cell"><b>${esc(c.name)}</b>${c.active ? '' : '<span class="m-status"><span class="badge">Hidden</span></span>'}</td><td class="num">${c.sort}</td>
      <td class="num">${products.filter(p => p.category_id === c.id).length}</td><td>${c.active ? '<span class="badge good">Shown</span>' : '<span class="badge">Hidden</span>'}</td><td class="act">${editBtn(c.id, c.name)}</td></tr>`).join('')}
    </tbody></table></div>`;
}

const activeBox = (row, label) => `<label class="check"><input type="checkbox" name="active" ${!row.id || row.active ? 'checked' : ''}> ${label}</label>`;

export const productForm = (p, categories) => `<div class="stack">
  <div class="photo-field">
    <div class="photo-preview" data-photo-preview>${photoPreview(p.image, categories.find(c => c.id === p.category_id)?.name)}</div>
    <div class="photo-side">
      <b>Photo</b>
      <span class="muted small">Shown on the POS card. A JPG or PNG from your computer or phone; it is shrunk automatically.</span>
      <div class="row">
        <button type="button" class="btn sm" data-photo-pick>${p.image ? 'Change photo' : 'Upload photo'}</button>
        <button type="button" class="btn sm danger" data-photo-remove ${p.image ? '' : 'hidden'}>Remove</button>
        <input type="file" accept="image/*" data-photo-file hidden>
      </div>
    </div>
  </div>
  ${field('Product name', `<input name="name" value="${esc(p.name || '')}">`)}
  <div class="grid2">${field('Category', `<select name="category_id">${categories.map(c => `<option value="${esc(c.id)}" ${c.id === p.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`)}
    ${field('Price (₱)', `<input name="price" inputmode="decimal" value="${p.price != null ? p.price / 100 : ''}">`)}</div>
  ${field('Position in its category (lower comes first)', `<input name="sort" inputmode="numeric" value="${p.sort ?? ''}">`)}
  ${activeBox(p, 'On sale in the POS')}</div>`;

export const photoPreview = (image, category) => image ? `<img src="${esc(image)}" alt="Product photo">` : productIcon(category || '');

export const addonForm = (a, categories) => `<div class="stack">
  <div class="grid2">${field('Add-on name', `<input name="name" value="${esc(a.name || '')}">`)}${field('Price (₱)', `<input name="price" inputmode="decimal" value="${a.price != null ? a.price / 100 : ''}">`)}</div>
  <div><div class="muted small" style="margin-bottom:6px">Offer it for</div><div class="row">${categories.map(c => `<label class="check"><input type="checkbox" data-cat="${esc(c.id)}" ${(a.category_ids || []).includes(c.id) ? 'checked' : ''}> ${esc(c.name)}</label>`).join('')}</div></div>
  ${activeBox(a, 'On sale in the POS')}</div>`;

export const categoryForm = c => `<div class="stack">
  ${field('Category name', `<input name="name" value="${esc(c.name || '')}">`)}
  ${field('Order on the POS (lower comes first)', `<input name="sort" inputmode="numeric" value="${c.sort ?? ''}">`)}
  ${activeBox(c, 'Show on the POS')}</div>`;
