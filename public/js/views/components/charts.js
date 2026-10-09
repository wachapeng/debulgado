// View: small SVG charts. One series, one color; thin bars with rounded tops; hairline grid;
// every bar has a hover/focus tooltip, and the screens also show the numbers as a table.
import { esc } from '../../core/format.js';

const niceMax = v => {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v)); const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
};
// A bar with a 4px rounded top and a square base.
const barPath = (x, y, w, h) => {
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
};

/** data: [{ label, value, tip }]. width = the box it is drawn in (so text stays 11px). fmt formats axis values. */
export function columnChart(data, { fmt = String, height = 220, width = 720, labelEvery } = {}) {
  if (!data.length) return '';
  const W = Math.max(240, Math.round(width)), left = 50, right = 6, top = 10, bottom = 28, plotH = height - top - bottom, plotW = W - left - right;
  const max = niceMax(Math.max(...data.map(d => d.value)));
  const slot = plotW / data.length;
  const bw = Math.max(2, Math.min(24, slot - 2)); // never fill the slot; at least a 2px gap
  const every = labelEvery || Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(plotW / 48))));
  const ticks = [0, max / 2, max];
  const grid = ticks.map(t => { const y = top + plotH - (t / max) * plotH;
    return `<line class="gridline" x1="${left}" x2="${W - right}" y1="${y}" y2="${y}"/><text x="${left - 8}" y="${y + 4}" text-anchor="end">${esc(fmt(t))}</text>`; }).join('');
  const bars = data.map((d, i) => {
    const h = (d.value / max) * plotH, x = left + i * slot + (slot - bw) / 2, y = top + plotH - h;
    const hit = `<rect x="${left + i * slot}" y="${top}" width="${slot}" height="${plotH}" fill="transparent" data-tip="${esc(d.tip)}" tabindex="-1"/>`;
    return `<g>${hit}${d.value > 0 ? `<path class="bar" d="${barPath(x, y, bw, h)}" data-tip="${esc(d.tip)}" tabindex="0" role="img" aria-label="${esc(d.tip)}"/>` : ''}
      ${i % every === 0 ? `<text x="${left + i * slot + slot / 2}" y="${height - 8}" text-anchor="middle">${esc(d.label)}</text>` : ''}</g>`;
  }).join('');
  return `<div class="chart"><svg viewBox="0 0 ${W} ${height}" width="${W}" height="${height}" role="group">${grid}${bars}</svg></div>`;
}

/** Horizontal bars with the label on the left and the value on the right. rows: [{ label, value, text, sub }] */
export function barList(rows) {
  if (!rows.length) return '<p class="muted" style="margin:0">Nothing yet for these dates.</p>';
  const max = Math.max(...rows.map(r => r.value), 1);
  return `<div class="bars">${rows.map(r => `<div class="bar-row">
    <span class="lbl" title="${esc(r.label)}">${esc(r.label)}</span>
    <div class="track"><div class="fill" style="width:${(r.value / max) * 100}%"></div></div>
    <span class="val">${esc(r.text)}${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</span></div>`).join('')}</div>`;
}
