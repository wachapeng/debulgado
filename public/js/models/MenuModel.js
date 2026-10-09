// Model: categories, products and add-ons, kept in memory and on the device.
import { getAll, put } from '../core/db.js';
import { emit } from '../core/bus.js';
import { nowIso, uuid } from '../core/format.js';
import { defaultMenu } from './defaultMenu.js';

export const TABLES = ['categories', 'products', 'addons'];
const cache = { categories: [], products: [], addons: [] };
const bySort = (a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name);

export async function load() {
  for (const t of TABLES) cache[t] = await getAll(t);
  if (!cache.categories.length) { // first run on this device: start from the printed menu
    const m = defaultMenu();
    for (const t of TABLES) { cache[t] = m[t].map(r => ({ ...r, dirty: 0 })); await put(t, ...cache[t]); }
  }
  sortAll();
}
function sortAll() { cache.categories.sort(bySort); cache.products.sort(bySort); cache.addons.sort((a, b) => a.name.localeCompare(b.name)); }

export function categories({ activeOnly = false } = {}) { return cache.categories.filter(c => !activeOnly || c.active); }
/** Products in menu order: by category, then by position within the category. */
export function products({ activeOnly = false } = {}) {
  const cats = categories({ activeOnly });
  const rank = new Map(cats.map((c, i) => [c.id, i]));
  return cache.products
    .filter(p => (!activeOnly || p.active) && (!activeOnly || rank.has(p.category_id)))
    .sort((a, b) => (rank.get(a.category_id) ?? 999) - (rank.get(b.category_id) ?? 999) || bySort(a, b));
}
export function addons({ activeOnly = false } = {}) { return cache.addons.filter(a => !activeOnly || a.active); }
export const categoryName = id => cache.categories.find(c => c.id === id)?.name || '';
export const product = id => cache.products.find(p => p.id === id);
export const addonsFor = p => addons({ activeOnly: true }).filter(a => a.category_ids.includes(p.category_id));

export async function save(table, row) {
  const saved = { ...row, id: row.id || `${table[0]}-${uuid()}`, updated_at: nowIso(), dirty: 1 };
  const list = cache[table], i = list.findIndex(r => r.id === saved.id);
  if (i >= 0) list[i] = saved; else list.push(saved);
  await put(table, saved); sortAll();
  emit('menu'); emit('local-change');
  return saved;
}

// ---- sync ----
export const pending = table => cache[table].filter(r => r.dirty).map(({ dirty, ...r }) => r);
export async function markUploaded(table, sent) {
  const done = [];
  for (const s of sent) { const r = cache[table].find(x => x.id === s.id); if (r && r.updated_at === s.updated_at) { r.dirty = 0; done.push(r); } }
  await put(table, ...done);
}
export async function merge(table, incoming) {
  const changed = [];
  for (const r of incoming || []) {
    const list = cache[table], i = list.findIndex(x => x.id === r.id);
    if (i >= 0 && list[i].dirty && list[i].updated_at > r.updated_at) continue; // our newer edit wins
    const row = { ...r, active: r.active ? 1 : 0, dirty: 0 };
    delete row.seq;
    if (i >= 0) list[i] = row; else list.push(row);
    changed.push(row);
  }
  if (changed.length) { await put(table, ...changed); sortAll(); emit('menu'); }
}
export async function markAllForUpload() { for (const t of TABLES) { cache[t].forEach(r => { r.dirty = 1; }); await put(t, ...cache[t]); } }
