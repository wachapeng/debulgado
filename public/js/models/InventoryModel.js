// Model: inventory (stock items such as milk, beans and cups), kept on the device and synced.
// The server keeps each item's real quantity: sales take ingredients off there (from the recipes),
// so every device agrees. Deliveries, counts and waste are made here as "moves" and uploaded;
// until they are, they are added to the server's number so the screen is right straight away.
import { getAll, put, remove } from '../core/db.js';
import { emit } from '../core/bus.js';
import { nowIso, uuid } from '../core/format.js';
import { prefs } from '../core/prefs.js';

export const UNITS = ['pcs', 'g', 'kg', 'ml', 'L', 'pack', 'bottle', 'box'];
const cache = { items: [], moves: [] };
const round = n => Math.round(n * 1000) / 1000;

export async function load() {
  cache.items = await getAll('stock_items');
  cache.moves = await getAll('stock_moves');
}

/** Quantity shown: the server's number plus this device's changes not uploaded yet. */
export function quantity(item) {
  return round((item.quantity || 0) + cache.moves.filter(m => m.item_id === item.id).reduce((s, m) => s + m.change, 0));
}
export const level = item => { const q = quantity(item); return q <= 0 ? 'out' : q <= (item.low_level || 0) ? 'low' : 'ok'; };

export function items({ activeOnly = false } = {}) {
  return cache.items.filter(i => !activeOnly || i.active).sort((a, b) => a.name.localeCompare(b.name));
}
export const item = id => cache.items.find(i => i.id === id);
export const byBarcode = code => { const c = String(code || '').trim(); return c ? cache.items.find(i => i.barcode && i.barcode === c) : undefined; };
export const lowItems = () => items({ activeOnly: true }).filter(i => level(i) !== 'ok');

/** Worst stock level among what a product (with add-ons) uses: 'out', 'low' or 'ok'. */
export function levelFor(recipe = []) {
  let worst = 'ok';
  for (const line of recipe) {
    const i = item(line.item_id);
    if (!i || !i.active) continue;
    const q = quantity(i);
    if (q < line.qty) return 'out';
    if (q <= (i.low_level || 0)) worst = 'low';
  }
  return worst;
}

export async function save(row) {
  const saved = { quantity: 0, ...row, id: row.id || `s-${uuid()}`, updated_at: nowIso(), dirty: 1 };
  const i = cache.items.findIndex(r => r.id === saved.id);
  if (i >= 0) cache.items[i] = saved; else cache.items.push(saved);
  await put('stock_items', saved);
  emit('inventory'); emit('local-change');
  return saved;
}

/** reason: start (opening stock), receive (delivery), count (counted: change = counted − shown), waste. */
export async function move(itemId, change, reason, note = '') {
  const m = { id: uuid(), item_id: itemId, change: round(Number(change) || 0), reason, note: note || null, device: prefs.deviceName, created_at: nowIso() };
  if (!m.change && reason !== 'count') return null;
  cache.moves.push(m);
  await put('stock_moves', m);
  emit('inventory'); emit('local-change');
  return m;
}

// ---- sync ----
export const pendingItems = () => cache.items.filter(r => r.dirty).map(({ dirty, ...r }) => r);
export const pendingMoves = () => cache.moves.slice(0, 500);
export async function markUploaded(sentItems, sentMoves) {
  const done = [];
  for (const s of sentItems) { const r = cache.items.find(x => x.id === s.id); if (r && r.updated_at === s.updated_at) { r.dirty = 0; done.push(r); } }
  await put('stock_items', ...done);
  const ids = new Set(sentMoves.map(m => m.id));
  cache.moves = cache.moves.filter(m => !ids.has(m.id));
  await remove('stock_moves', ...ids);
  if (sentMoves.length) emit('inventory');
}
export async function merge(incoming) {
  const changed = [];
  for (const r of incoming || []) {
    const i = cache.items.findIndex(x => x.id === r.id);
    const mine = i >= 0 ? cache.items[i] : null;
    // our newer edit of the name/barcode/levels wins, but the quantity always comes from the server
    const row = mine && mine.dirty && mine.updated_at > r.updated_at ? { ...mine, quantity: r.quantity } : { ...r, active: r.active ? 1 : 0, dirty: 0 };
    delete row.seq;
    if (i >= 0) cache.items[i] = row; else cache.items.push(row);
    changed.push(row);
  }
  if (changed.length) { await put('stock_items', ...changed); emit('inventory'); }
}
export async function markAllForUpload() { cache.items.forEach(r => { r.dirty = 1; }); await put('stock_items', ...cache.items); }
