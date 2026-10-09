// View: statistics. Big number first, then the charts and tables behind it.
import { esc, peso, num, fmtDay, fmtDate } from '../core/format.js';
import { columnChart, barList } from './components/charts.js';
import { rangeHtml } from './components/rangePicker.js';

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const hourLabel = h => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;
const short = c => { const v = c / 100; return v >= 1000 ? '₱' + (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'k' : '₱' + Math.round(v); };

export const layout = st => `
  <div class="page-head"><div><h1>Statistics</h1><p>How the shop is doing for the dates you pick.</p></div>
    <div class="row"><div data-range>${rangeHtml(st)}</div>
    <label class="check small"><input type="checkbox" data-compare ${st.compare ? 'checked' : ''}> Compare with previous period</label></div></div>
  <div data-body></div>`;

function delta(cur, prev, { invert = false } = {}) {
  if (prev == null) return '';
  if (!prev) return cur ? '<span class="delta up">new</span>' : '';
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (!pct) return '<span class="delta">same as before</span>';
  const up = pct > 0;
  return `<span class="delta ${up !== invert ? 'up' : 'down'}">${Math.abs(pct)}% vs previous</span>`;
}

function dailySeries(d) {
  if (d.days.length <= 62) return d.days.map(x => ({ label: x.date.slice(5).replace('-', '/'), value: x.amount, tip: `${fmtDay(x.date)}: ${peso(x.amount)} · ${x.orders} orders` }));
  const months = new Map(); // long ranges: one bar per month
  for (const x of d.days) { const k = x.date.slice(0, 7); const m = months.get(k) || { amount: 0, orders: 0 }; m.amount += x.amount; m.orders += x.orders; months.set(k, m); }
  return [...months].map(([k, m]) => { const name = new Date(k + '-01T00:00:00').toLocaleDateString('en-PH', { month: 'short', year: '2-digit' });
    return { label: name, value: m.amount, tip: `${name}: ${peso(m.amount)} · ${m.orders} orders` }; });
}

export function bodyHtml(d, p, st, size = { wide: 720, half: 360 }) {
  const k = d.kpi, pk = p?.kpi;
  if (!k.orders && !k.voids) return `<div class="panel empty"><b>No sales from ${esc(fmtDate(d.from))} to ${esc(fmtDate(d.to))}.</b>Pick other dates, or check History.</div>`;
  const active = d.hours.filter(h => h.orders);
  const firstH = Math.min(7, ...active.map(h => h.hour)), lastH = Math.max(20, ...active.map(h => h.hour));
  const hours = d.hours.filter(h => h.hour >= firstH && h.hour <= lastH);
  const totalPay = d.payments.reduce((s, x) => s + x.amount, 0) || 1;
  const top = d.products.slice(0, 15), topQty = Math.max(1, ...top.map(x => x.qty));
  const series = dailySeries(d);
  return `
  <div class="kpis">
    <div class="kpi hero"><span class="label">Net sales</span><span class="value">${peso(k.net)}</span>
      <span class="sub">${esc(fmtDate(d.from))}${d.from !== d.to ? ' – ' + esc(fmtDate(d.to)) : ''}</span>${delta(k.net, pk?.net)}</div>
    <div class="kpi"><span class="label">Orders</span><span class="value">${num(k.orders)}</span>${delta(k.orders, pk?.orders)}</div>
    <div class="kpi"><span class="label">Average order</span><span class="value">${peso(k.avg)}</span>${delta(k.avg, pk?.avg)}</div>
    <div class="kpi"><span class="label">Items sold</span><span class="value">${num(k.itemsSold)}</span>${delta(k.itemsSold, pk?.itemsSold)}</div>
    <div class="kpi"><span class="label">Discounts given</span><span class="value">${peso(k.discounts)}</span><span class="sub">gross ${peso(k.gross)}</span></div>
    <div class="kpi"><span class="label">Average per day</span><span class="value">${peso(k.perDay)}</span>${delta(k.perDay, pk?.perDay)}</div>
    <div class="kpi"><span class="label">Voided</span><span class="value">${k.voids}</span><span class="sub">${peso(k.voidAmount)} not counted</span></div>
  </div>
  <div class="panel" style="margin-bottom:16px"><div class="highlights">
    <div><span>Best day</span><b>${d.best ? `${esc(fmtDay(d.best.date))} · ${peso(d.best.amount)}` : '–'}</b></div>
    <div><span>Busiest hour</span><b>${d.busiest?.orders ? `${hourLabel(d.busiest.hour)} · ${d.busiest.orders} orders` : '–'}</b></div>
    <div><span>Best seller</span><b>${d.products[0] ? `${esc(d.products[0].key)} · ${d.products[0].qty} sold` : '–'}</b></div>
    <div><span>Top category</span><b>${d.categories[0] ? `${esc(d.categories[0].key)} · ${peso(d.categories[0].amount)}` : '–'}</b></div>
  </div></div>
  <div class="stats-grid">
    <div class="panel wide"><div class="panel-head"><h2>Sales by ${d.days.length > 62 ? 'month' : 'day'}</h2>
      <button class="link small" data-toggle-table>${st.dailyTable ? 'Show chart' : 'Show as table'}</button></div>
      ${st.dailyTable ? `<div class="table-wrap" style="max-height:340px;overflow:auto"><table><thead><tr><th>${d.days.length > 62 ? 'Month' : 'Date'}</th><th class="num">Net sales</th></tr></thead>
        <tbody>${series.map(s => `<tr><td>${esc(s.tip.split(':')[0])}</td><td class="num">${peso(s.value)}</td></tr>`).join('')}</tbody></table></div>`
      : columnChart(series, { fmt: short, width: size.wide })}</div>
    <div class="panel"><div class="panel-head"><h2>Busiest hours</h2><span class="muted small">orders per hour</span></div>
      ${columnChart(hours.map(h => ({ label: hourLabel(h.hour), value: h.orders, tip: `${hourLabel(h.hour)}: ${h.orders} orders · ${peso(h.amount)}` })), { fmt: v => Math.round(v), height: 200, width: size.half })}</div>
    <div class="panel"><div class="panel-head"><h2>By category</h2></div>
      ${barList(d.categories.map(c => ({ label: c.key, value: c.amount, text: peso(c.amount), sub: `${c.qty} sold` })))}</div>
    <div class="panel wide"><div class="panel-head"><h2>Best sellers</h2><span class="muted small">${d.products.length} products sold</span></div>
      <div class="table-wrap"><table><thead><tr><th>#</th><th>Product</th><th>Category</th><th style="width:28%"></th><th class="num">Qty</th><th class="num">Sales</th></tr></thead>
      <tbody>${top.map((x, i) => `<tr><td class="muted">${i + 1}</td><td><b>${esc(x.key)}</b></td><td class="muted">${esc(x.category || '')}</td>
        <td><div class="track"><div class="fill" style="width:${(x.qty / topQty) * 100}%"></div></div></td><td class="num">${x.qty}</td><td class="num">${peso(x.amount)}</td></tr>`).join('')}</tbody></table></div>
      ${d.products.length > 15 ? `<details style="margin-top:10px"><summary class="link small">Show all ${d.products.length}</summary><table style="margin-top:8px"><tbody>${d.products.slice(15).map((x, i) => `<tr><td class="muted">${i + 16}</td><td>${esc(x.key)}</td><td class="muted">${esc(x.category || '')}</td><td class="num">${x.qty}</td><td class="num">${peso(x.amount)}</td></tr>`).join('')}</tbody></table></details>` : ''}</div>
    <div class="panel"><div class="panel-head"><h2>Payments & service</h2></div>
      ${barList([...d.payments.map(x => ({ label: x.key === 'gcash' ? 'GCash' : 'Cash', value: x.amount, text: peso(x.amount), sub: `${Math.round(x.amount / totalPay * 100)}% · ${x.orders}` })),
        ...d.services.map(x => ({ label: x.key === 'take-out' ? 'Take-out' : 'Dine-in', value: x.amount, text: peso(x.amount), sub: `${Math.round(x.amount / totalPay * 100)}% · ${x.orders}` }))])}</div>
    <div class="panel"><div class="panel-head"><h2>Average by weekday</h2><span class="muted small">sales per day</span></div>
      ${barList(d.weekdays.filter(w => w.days).map(w => ({ label: DOW[w.dow], value: w.amount / w.days, text: peso(Math.round(w.amount / w.days)), sub: `${w.days} day${w.days > 1 ? 's' : ''}` })))}</div>
    <div class="panel"><div class="panel-head"><h2>Add-ons</h2></div>
      ${barList(d.addons.map(a => ({ label: a.key, value: a.qty, text: `${a.qty}×`, sub: peso(a.amount) })))}</div>
    <div class="panel"><div class="panel-head"><h2>By cashier / device</h2></div>
      ${barList(d.cashiers.map(c => ({ label: c.key, value: c.amount, text: peso(c.amount), sub: `${c.orders} orders` })))}
      ${d.discountTypes.length ? `<h3 style="margin:16px 0 10px">Discounts</h3>${barList(d.discountTypes.map(x => ({ label: x.key, value: x.amount, text: peso(x.amount), sub: `${x.orders} orders` })))}` : ''}</div>
  </div>`;
}
