// Settings that belong to this device only (theme, card size, sign-in, favorites…),
// and the remembered state of each screen so nothing resets when you switch pages.
import { emit } from './bus.js';

const KEY = 'pos:prefs';
const phone = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);

const DEFAULTS = {
  theme: 'auto',             // auto | light | dark
  cardSize: 'm',             // s | m | l
  deviceName: phone ? 'Phone' : 'Laptop',
  prefix: '',                // receipt prefix given by the server at sign-in (L for Laptop, P for Phone…)
  token: '',                 // this device's sign-in key
  cashier: '',
  sound: true,
  favorites: [],
};

function read(key, fallback) { try { return { ...fallback, ...JSON.parse(localStorage.getItem(key) || '{}') }; } catch { return { ...fallback }; } }
function write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ } }

export const prefs = read(KEY, DEFAULTS);
export function setPref(name, value) { prefs[name] = value; write(KEY, prefs); emit('prefs', name); }

/** Remembered screen state. Returns a live object; call save() after changing it. */
export function screenState(name, defaults) {
  const key = 'pos:screen:' + name;
  const state = read(key, defaults);
  Object.defineProperty(state, 'save', { value: () => write(key, state), enumerable: false });
  return state;
}
