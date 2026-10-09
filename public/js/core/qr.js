// Draws a QR code as a sharp, scalable picture (SVG), for the order and counter QR codes.
import { loadScript } from './loadScript.js';

export async function qrSvg(text, { label = 'QR code' } = {}) {
  await loadScript(new URL('../vendor/qrcode.js', import.meta.url).href);
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount(), quiet = 4, size = n + quiet * 2;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
  return `<svg class="qr-svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="${label.replace(/"/g, '')}" shape-rendering="crispEdges">`
    + `<rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
