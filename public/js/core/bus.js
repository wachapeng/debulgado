// A tiny event bus so models can announce changes and controllers can react.
// Topics: 'menu', 'orders', 'shop', 'prefs', 'sync', 'local-change' (something needs uploading).
const listeners = {};
export const on = (topic, fn) => { (listeners[topic] ||= new Set()).add(fn); return () => listeners[topic].delete(fn); };
export const emit = (topic, data) => { for (const fn of listeners[topic] || []) { try { fn(data); } catch (e) { console.error(e); } } };
