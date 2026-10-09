// Model: shop details shared by all devices (name, address, receipt footer, discount rate, manager PIN).
import { getMeta, setMeta } from '../core/db.js';
import { emit } from '../core/bus.js';
import { nowIso } from '../core/format.js';
import { DEFAULT_SHOP, SEED_TIME } from './defaultMenu.js';

let shop = { data: { ...DEFAULT_SHOP }, updated_at: SEED_TIME, dirty: 0 };

export async function load() { const saved = await getMeta('shop'); if (saved) shop = { ...saved, data: { ...DEFAULT_SHOP, ...saved.data } }; }
export const get = () => shop.data;

export async function save(changes) {
  shop = { data: { ...shop.data, ...changes }, updated_at: nowIso(), dirty: 1 };
  await setMeta('shop', shop);
  emit('shop'); emit('local-change');
}

/** Manager PIN check. With no PIN set, everything is allowed. */
export const pinRequired = () => !!shop.data.manager_pin;
export const checkPin = pin => !shop.data.manager_pin || String(pin) === String(shop.data.manager_pin);

// ---- sync ----
export const pending = () => (shop.dirty ? { data: shop.data, updated_at: shop.updated_at } : null);
export async function markUploaded(sent) { if (sent && shop.updated_at === sent.updated_at) { shop.dirty = 0; await setMeta('shop', shop); } }
export async function merge(incoming) {
  if (!incoming || (shop.dirty && shop.updated_at > incoming.updated_at)) return;
  shop = { data: { ...DEFAULT_SHOP, ...incoming.data }, updated_at: incoming.updated_at, dirty: 0 };
  await setMeta('shop', shop); emit('shop');
}
export async function markAllForUpload() { shop.dirty = 1; await setMeta('shop', shop); }
