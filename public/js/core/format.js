// Formatting and small helpers shared by all screens.
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const nf2 = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 });
/** Centavos to "₱1,234" (or "₱1,234.50" when there are centavos). */
export function peso(c, { dec = false } = {}) {
  const v = Math.round(c || 0) / 100;
  const s = dec || !Number.isInteger(v) ? nf2.format(Math.abs(v)) : nf0.format(Math.abs(v));
  return (v < 0 ? '−₱' : '₱') + s;
}
export const num = n => nf0.format(n || 0);
export const toCentavos = v => Math.round((Number(String(v ?? '').replace(/,/g, '')) || 0) * 100);

const pad = n => String(n).padStart(2, '0');
export const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const localDateTime = (d = new Date()) => `${localDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
export const nowIso = () => new Date().toISOString();
export const addDays = (day, n) => { const d = new Date(day + 'T00:00:00'); d.setDate(d.getDate() + n); return localDate(d); };
export const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 864e5);

const asDate = s => new Date(String(s).replace(' ', 'T'));
export const fmtDate = s => s ? asDate(s.length === 10 ? s + 'T00:00:00' : s).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
export const fmtDay = s => asDate(s + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
export const fmtTime = s => s ? asDate(s).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }) : '';
export const fmtDateTime = s => s ? `${fmtDate(s)}, ${fmtTime(s)}` : '';
export function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.round((Date.now() - new Date(iso)) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return fmtDate(iso);
}

/** Unique ID. Works even on plain http (where crypto.randomUUID is unavailable). */
export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** True inside the Android app (it adds "DebulgadoPOSApp" to the browser name). */
export const isNative = () => /DebulgadoPOSApp/.test(navigator.userAgent);
export const isPhoneSized = () => matchMedia('(max-width: 760px)').matches;
