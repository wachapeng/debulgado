// Shared interface pieces: toasts, dialogs, the green payment confirmation, theme and sound.
import { esc, peso } from './format.js';
import { prefs } from './prefs.js';
import * as Shop from '../models/ShopModel.js';
import { ICON } from './icons.js';

export { ICON, productIcon } from './icons.js';

// ---------- Toasts ----------
export function toast(message, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = (kind === 'good' ? ICON.check : '') + `<span>${esc(message)}</span>`;
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), kind === 'bad' ? 4500 : 2800);
}
export const fail = e => toast(e?.message || String(e), 'bad');

// ---------- Dialogs ----------
/** actions: [{ label, cls, onClick(dialogEl) }]. Return true from onClick to keep the dialog open. */
export function modal({ title, body, actions = [], size = '', onOpen, autofocus = true }) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal ${size}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-head"><h2>${esc(title)}</h2><button class="x" aria-label="Close">×</button></div>
    <div class="modal-body">${body}</div>
    ${actions.length ? `<div class="modal-foot">${actions.map((a, i) => `<button class="btn ${a.cls || ''}" data-i="${i}">${esc(a.label)}</button>`).join('')}</div>` : ''}
  </div>`;
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); back.onClose?.(); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  back.addEventListener('click', async e => {
    if (e.target === back || e.target.closest('.x')) return close();
    const b = e.target.closest('.modal-foot [data-i]');
    if (!b) return;
    const a = actions[b.dataset.i];
    if (!a.onClick) return close();
    b.disabled = true;
    try { if (!(await a.onClick(back))) close(); } catch (err) { fail(err); } finally { b.disabled = false; }
  });
  back.close = close;
  document.body.append(back);
  onOpen?.(back);
  if (autofocus) setTimeout(() => (back.querySelector('.modal-body [data-autofocus]') || back.querySelector('.modal-body input:not([type=checkbox]):not([readonly]), .modal-body select'))?.focus(), 40);
  return back;
}
export const confirmBox = (title, text, okLabel = 'Confirm', okCls = 'primary') => new Promise(resolve => {
  const m = modal({ title, size: 'narrow', body: `<div class="confirm-text">${text}</div>`,
    actions: [{ label: 'Cancel', onClick: () => { resolve(false); } }, { label: okLabel, cls: okCls, onClick: () => { resolve(true); } }] });
  m.onClose = () => resolve(false);
});
export const field = (label, input) => `<label class="f"><span>${esc(label)}</span>${input}</label>`;
export function formValues(el) {
  const o = {};
  el.querySelectorAll('[name]').forEach(i => { o[i.name] = i.type === 'checkbox' ? i.checked : i.value; });
  return o;
}

/** Ask for the manager PIN before a protected action. Resolves true if allowed.
 *  After a correct PIN, protected actions stay unlocked for 5 minutes. */
let unlockedUntil = 0;
export function askPin(what) {
  if (!Shop.pinRequired() || Date.now() < unlockedUntil) return Promise.resolve(true);
  return new Promise(resolve => {
    const m = modal({ title: 'Manager PIN', size: 'narrow',
      body: `<p class="muted" style="margin-top:0">Enter the manager PIN to ${esc(what)}.</p>${field('PIN', '<input name="pin" type="password" inputmode="numeric" autocomplete="off">')}`,
      actions: [{ label: 'Cancel', onClick: () => resolve(false) }, { label: 'Continue', cls: 'primary', onClick: el => {
        if (!Shop.checkPin(el.querySelector('[name=pin]').value)) throw new Error('That PIN is not right.');
        unlockedUntil = Date.now() + 5 * 60 * 1000;
        resolve(true);
      } }],
      onOpen: el => el.querySelector('[name=pin]').addEventListener('keydown', e => { if (e.key === 'Enter') el.querySelector('.modal-foot .primary').click(); }) });
    m.onClose = () => resolve(false);
  });
}

// ---------- Payment confirmation (full-screen green) ----------
const itemCount = o => { const n = o.items.reduce((s, i) => s + i.qty, 0); return `${n} item${n === 1 ? '' : 's'}`; };
export function celebrate(order, { onReceipt } = {}) {
  const ms = 7000;
  const el = document.createElement('div');
  el.className = 'paid';
  el.setAttribute('role', 'alertdialog');
  el.setAttribute('aria-label', 'Payment received');
  const cash = order.payment_method === 'cash';
  el.innerHTML = `<div class="paid-inner">
    <svg class="paid-check" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46"/><path d="M29 52l14 14 29-31"/></svg>
    <div class="paid-title">Payment received</div>
    <div class="paid-total">${peso(order.total)}</div>
    ${cash ? `<div class="paid-change">${order.change_due ? `Change ${peso(order.change_due)}` : 'No change'}</div>`
      : `<div class="paid-change">GCash${order.payment_ref ? ' · ref ' + esc(order.payment_ref) : ''}</div>`}
    <div class="paid-meta">${order.customer_name ? `<b>${esc(order.customer_name)}</b> · ` : ''}Order ${esc(order.number)} · ${order.service === 'take-out' ? 'Take-out' : 'Dine-in'} · ${itemCount(order)}</div>
    <div class="paid-actions"><button data-a="receipt">Receipt</button><button class="go" data-a="new">New order</button></div>
    <div class="paid-timer"><i style="animation-duration:${ms}ms"></i></div>
  </div>`;
  const close = () => { el.remove(); clearTimeout(t); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (['Escape', 'Enter', ' '].includes(e.key)) { e.preventDefault(); close(); } };
  const t = setTimeout(close, ms);
  el.addEventListener('click', e => {
    if (e.target.closest('[data-a=receipt]')) { close(); onReceipt?.(order); return; }
    close();
  });
  document.addEventListener('keydown', onKey);
  document.body.append(el);
  el.querySelector('.go').focus();
  if (prefs.sound) chime();
  navigator.vibrate?.(60);
}

let audio;
export function chime() {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const now = audio.currentTime;
    [[880, 0], [1320, 0.12]].forEach(([f, d]) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now + d); g.gain.exponentialRampToValueAtTime(0.18, now + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, now + d + 0.35);
      o.connect(g).connect(audio.destination); o.start(now + d); o.stop(now + d + 0.4);
    });
  } catch { /* sound not available */ }
}

// ---------- Theme ----------
const dark = matchMedia('(prefers-color-scheme: dark)');
export function applyTheme() {
  const mode = prefs.theme === 'auto' ? (dark.matches ? 'dark' : 'light') : prefs.theme;
  document.documentElement.dataset.theme = mode;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', mode === 'dark' ? '#120c08' : '#3a2616');
  colorAndroidBars();
}
dark.addEventListener?.('change', () => { if (prefs.theme === 'auto') applyTheme(); });

/** In the Android app: color the strips behind the phone's status bar and navigation bar to match. */
function colorAndroidBars() {
  if (!window.AndroidApp?.setBarColors) return;
  const css = getComputedStyle(document.documentElement);
  const phoneLayout = matchMedia('(max-width: 760px)').matches;
  try { window.AndroidApp.setBarColors(css.getPropertyValue('--espresso').trim(), css.getPropertyValue(phoneLayout ? '--surface' : '--bg').trim()); } catch { /* older app */ }
}
let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(colorAndroidBars, 200); });

// ---------- Chart tooltips (one shared bubble; works with mouse, touch and keyboard focus) ----------
export function enableTooltips() {
  const tip = document.createElement('div'); tip.className = 'tip hidden'; document.body.append(tip);
  const show = (target, x, y) => { tip.textContent = target.dataset.tip; tip.style.left = x + 'px'; tip.style.top = y + 'px'; tip.classList.remove('hidden'); };
  document.addEventListener('pointerover', e => { const t = e.target.closest('[data-tip]'); if (t) { const r = t.getBoundingClientRect(); show(t, r.left + r.width / 2, r.top); } });
  document.addEventListener('pointerout', e => { if (e.target.closest('[data-tip]')) tip.classList.add('hidden'); });
  document.addEventListener('focusin', e => { const t = e.target.closest('[data-tip]'); if (t) { const r = t.getBoundingClientRect(); show(t, r.left + r.width / 2, r.top); } });
  document.addEventListener('focusout', () => tip.classList.add('hidden'));
  document.addEventListener('scroll', () => tip.classList.add('hidden'), true);
}
