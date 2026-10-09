// Model: turns a list of orders into the numbers shown on the Statistics screen.
import { addDays, daysBetween } from '../core/format.js';

const sumBy = (list, key, val) => {
  const m = new Map();
  for (const x of list) { const k = key(x); const cur = m.get(k) || { key: k, qty: 0, amount: 0, orders: 0 }; val(cur, x); m.set(k, cur); }
  return [...m.values()];
};

export function compute(orders, from, to) {
  const paid = orders.filter(o => o.status === 'paid');
  const voids = orders.filter(o => o.status === 'void');
  const items = paid.flatMap(o => o.items.map(i => ({ ...i, order: o })));

  const net = paid.reduce((s, o) => s + o.total, 0);
  const gross = paid.reduce((s, o) => s + o.subtotal, 0);
  const discounts = paid.reduce((s, o) => s + o.discount, 0);
  const itemsSold = items.reduce((s, i) => s + i.qty, 0);

  // Every day in the range appears, including days with no sales.
  const days = [];
  for (let d = from, n = 0; d <= to && n < 400; d = addDays(d, 1), n++) days.push({ date: d, amount: 0, orders: 0 });
  const dayIdx = new Map(days.map((d, i) => [d.date, i]));
  for (const o of paid) { const d = days[dayIdx.get(o.date)]; if (d) { d.amount += o.total; d.orders++; } }

  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, orders: 0, amount: 0 }));
  for (const o of paid) { const h = hours[Number(o.created_at.slice(11, 13))]; h.orders++; h.amount += o.total; }

  const weekdays = Array.from({ length: 7 }, (_, d) => ({ dow: d, orders: 0, amount: 0, days: 0 }));
  for (const d of days) weekdays[new Date(d.date + 'T00:00:00').getDay()].days++;
  for (const o of paid) { const w = weekdays[new Date(o.date + 'T00:00:00').getDay()]; w.orders++; w.amount += o.total; }

  const lineSales = i => i.line_total;
  const products = sumBy(items, i => i.name, (c, i) => { c.qty += i.qty; c.amount += lineSales(i); c.category = i.category; })
    .sort((a, b) => b.qty - a.qty || b.amount - a.amount);
  const categories = sumBy(items, i => i.category || 'Other', (c, i) => { c.qty += i.qty; c.amount += lineSales(i); }).sort((a, b) => b.amount - a.amount);
  const addons = sumBy(items.flatMap(i => i.addons.map(a => ({ ...a, qty: i.qty }))), a => a.name, (c, a) => { c.qty += a.qty; c.amount += a.price * a.qty; })
    .sort((a, b) => b.qty - a.qty);
  const payments = sumBy(paid, o => o.payment_method, (c, o) => { c.orders++; c.amount += o.total; });
  const services = sumBy(paid, o => o.service, (c, o) => { c.orders++; c.amount += o.total; });
  const cashiers = sumBy(paid, o => o.cashier || o.device || 'Unnamed', (c, o) => { c.orders++; c.amount += o.total; }).sort((a, b) => b.amount - a.amount);
  const discountTypes = sumBy(paid.filter(o => o.discount), o => (o.discount_label || 'Discount').replace(/ \d+%$/, ''), (c, o) => { c.orders++; c.amount += o.discount; });

  const best = days.reduce((b, d) => (d.amount > (b?.amount || 0) ? d : b), null);
  const busiest = hours.reduce((b, h) => (h.orders > (b?.orders || 0) ? h : b), null);

  return {
    from, to, dayCount: daysBetween(from, to) + 1,
    kpi: { net, gross, discounts, orders: paid.length, avg: paid.length ? Math.round(net / paid.length) : 0, itemsSold,
      voids: voids.length, voidAmount: voids.reduce((s, o) => s + o.total, 0), perDay: Math.round(net / (daysBetween(from, to) + 1)) },
    days, hours, weekdays, products, categories, addons, payments, services, cashiers, discountTypes, best, busiest,
  };
}

/** The same-length period just before [from, to], for comparison. */
export function previousRange(from, to) {
  const len = daysBetween(from, to) + 1;
  return { from: addDays(from, -len), to: addDays(from, -1) };
}
