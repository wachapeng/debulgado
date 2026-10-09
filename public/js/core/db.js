// On-device database (IndexedDB). Everything is saved here first, so the app works with no internet.
const NAME = 'debulgado-pos';
const VERSION = 1;
let opening;

export function openDb() {
  return opening ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      for (const s of ['categories', 'products', 'addons']) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' });
      if (!d.objectStoreNames.contains('orders')) {
        const o = d.createObjectStore('orders', { keyPath: 'id' });
        o.createIndex('date', 'date');
        o.createIndex('dirty', 'dirty'); // 1 = not uploaded yet
      }
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const wait = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const finished = t => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = t.onabort = () => rej(t.error); });

export async function getAll(store) { const d = await openDb(); return wait(d.transaction(store).objectStore(store).getAll()); }
export async function get(store, key) { const d = await openDb(); return wait(d.transaction(store).objectStore(store).get(key)); }
export async function put(store, ...rows) {
  if (!rows.length) return;
  const d = await openDb(); const t = d.transaction(store, 'readwrite'); const s = t.objectStore(store);
  for (const r of rows) s.put(r);
  return finished(t);
}
export async function byIndex(store, index, range) { const d = await openDb(); return wait(d.transaction(store).objectStore(store).index(index).getAll(range)); }
export async function countIndex(store, index, key) { const d = await openDb(); return wait(d.transaction(store).objectStore(store).index(index).count(key)); }

export async function getMeta(key, fallback = null) { const r = await get('meta', key); return r ? r.value : fallback; }
export async function setMeta(key, value) { return put('meta', { key, value }); }

/** Ask the browser not to clear this app's data when the device runs low on space. */
export function keepData() { navigator.storage?.persist?.().catch(() => {}); }
