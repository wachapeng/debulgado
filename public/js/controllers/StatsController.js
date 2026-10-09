// Controller: statistics. Computed on this device from all synced orders, so it works offline too.
import * as View from '../views/StatsView.js';
import * as Orders from '../models/OrderModel.js';
import * as Stats from '../models/StatsModel.js';
import { on } from '../core/bus.js';
import { screenState } from '../core/prefs.js';
import { resolveRange, bindRange } from '../views/components/rangePicker.js';

const st = screenState('stats', { preset: '7d', from: '', to: '', compare: true, dailyTable: false });
let root, visible = false, stale = true;

export function mount(el) {
  root = el;
  resolveRange(st);
  el.innerHTML = View.layout(st);
  bindRange(el.querySelector('[data-range]'), st, load);
  el.querySelector('[data-compare]').addEventListener('change', e => { st.compare = e.target.checked; st.save(); load(); });
  el.querySelector('[data-body]').addEventListener('click', e => {
    if (e.target.closest('[data-toggle-table]')) { st.dailyTable = !st.dailyTable; st.save(); load(); }
  });
  const refresh = () => { if (visible) load(); else stale = true; };
  let t; window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { if (visible) load(); else stale = true; }, 250); });
  on('orders', refresh);
  on('sync', s => { if (s.phase === 'ok') refresh(); });
}

export function show() {
  visible = true;
  const before = st.from + st.to;
  resolveRange(st);
  if (before !== st.from + st.to) { root.querySelector('[data-k=from]').value = st.from; root.querySelector('[data-k=to]').value = st.to; stale = true; }
  if (stale) load();
}
export function hide() { visible = false; }

async function load() {
  stale = false;
  const body = root.querySelector('[data-body]');
  body.style.opacity = '.6'; // keep the old numbers on screen while recalculating (no flash)
  const data = Stats.compute(await Orders.inRange(st.from, st.to), st.from, st.to);
  let prev = null;
  if (st.compare) { const r = Stats.previousRange(st.from, st.to); prev = Stats.compute(await Orders.inRange(r.from, r.to), r.from, r.to); }
  const scroll = root.scrollTop;
  const w = body.clientWidth, inner = w - 42; // panel padding and border
  body.innerHTML = View.bodyHtml(data, prev, st, { wide: inner, half: matchMedia('(max-width: 860px)').matches ? inner : (w - 16) / 2 - 42 });
  body.style.opacity = '';
  root.scrollTop = scroll;
}
