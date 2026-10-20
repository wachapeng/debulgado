// Barcode scanning for the inventory, three ways:
//  1. a USB or Bluetooth barcode scanner (it "types" the code and presses Enter),
//  2. the device camera (the browser's own reader when it has one, otherwise ZXing),
//  3. typing the numbers under the barcode.
import { modal } from './ui.js';
import { loadScript } from './loadScript.js';
import { esc } from './format.js';

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'];
export const cleanCode = s => String(s || '').trim().replace(/\s+/g, '').slice(0, 64);

// ---------- camera ----------
async function cameraReader() {
  if ('BarcodeDetector' in window) {
    try {
      const supported = await BarcodeDetector.getSupportedFormats();
      const formats = FORMATS.filter(f => supported.includes(f));
      if (formats.includes('ean_13')) {
        const detector = new BarcodeDetector({ formats });
        return async video => (await detector.detect(video))[0]?.rawValue || null;
      }
    } catch { /* fall back to ZXing */ }
  }
  await loadScript(new URL('../vendor/zxing.min.js', import.meta.url).href);
  const Z = window.ZXing;
  const hints = new Map();
  hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E,
    Z.BarcodeFormat.CODE_128, Z.BarcodeFormat.CODE_39, Z.BarcodeFormat.ITF, Z.BarcodeFormat.QR_CODE]);
  hints.set(Z.DecodeHintType.TRY_HARDER, true);
  const reader = new Z.MultiFormatReader();
  reader.setHints(hints);
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
  return async video => {
    const w = Math.min(960, video.videoWidth), h = Math.round(video.videoHeight * w / video.videoWidth);
    if (!w || !h) return null;
    canvas.width = w; canvas.height = h;
    ctx.drawImage(video, 0, 0, w, h);
    try {
      return reader.decodeWithState(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(canvas)))).getText();
    } catch { return null; } // nothing found in this picture
  };
}

function startCamera(video, onCode, onMessage) {
  let stream = null, running = true, timer = 0;
  (async () => {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('No camera here. Use a barcode scanner or type the code.');
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    } catch (e) {
      throw new Error(e?.name === 'NotAllowedError' ? 'The camera is blocked for this page. Allow it in the browser, or use a barcode scanner or type the code.'
        : 'No camera found. Use a barcode scanner or type the code.');
    }
    if (!running) { stream.getTracks().forEach(t => t.stop()); return; }
    video.srcObject = stream;
    await video.play().catch(() => {});
    const read = await cameraReader();
    onMessage('Hold the barcode inside the box.', true);
    const loop = async () => {
      if (!running) return;
      if (video.readyState >= 2) { const code = await read(video).catch(() => null); if (code && running) return onCode(code); }
      timer = setTimeout(loop, 120);
    };
    loop();
  })().catch(e => onMessage(e.message, false));
  return () => { running = false; clearTimeout(timer); stream?.getTracks().forEach(t => t.stop()); video.srcObject = null; };
}

/** Opens the scan window. Resolves to the code, or null. extra: a link under the input, e.g. "It has no barcode". */
export function scanBarcode({ title = 'Scan the barcode', hint = '', extra = '' } = {}) {
  return new Promise(resolve => {
    let done = false, stop = () => {};
    const finish = code => { if (done) return; done = true; stop(); resolve(code); m.close(); };
    const m = modal({ title, size: 'scan', autofocus: false, body: `<div class="scan-box">
      <div class="scan-view"><video data-video playsinline muted autoplay></video><div class="scan-line" aria-hidden="true"></div></div>
      <p class="muted small scan-msg" data-msg role="status">Starting the camera… A USB barcode scanner works too.</p>
      <form class="scan-type" data-form><input data-code inputmode="numeric" autocomplete="off" placeholder="Scan or type the barcode" aria-label="Barcode"><button class="btn primary">OK</button></form>
      ${hint ? `<p class="muted small" style="margin:0">${esc(hint)}</p>` : ''}${extra}</div>` });
    m.onClose = () => { stop(); if (!done) { done = true; resolve(null); } };
    const input = m.querySelector('[data-code]');
    setTimeout(() => input.focus(), 50); // a USB scanner types into this box and presses Enter
    m.querySelector('[data-form]').addEventListener('submit', e => { e.preventDefault(); const c = cleanCode(input.value); if (c) finish(c); });
    m.addEventListener('click', e => { const b = e.target.closest('[data-result]'); if (b) { e.preventDefault(); finish(b.dataset.result); } });
    stop = startCamera(m.querySelector('[data-video]'), code => { navigator.vibrate?.(60); finish(cleanCode(code)); }, (text, ok) => {
      m.querySelector('[data-msg]').textContent = text;
      m.querySelector('.scan-view').classList.toggle('off', !ok);
    });
  });
}

/** A USB/Bluetooth scanner used while no box is selected: very fast typing that ends with Enter. */
export function listenForScanner(onScan, isActive) {
  let buffer = '', last = 0;
  const onKey = e => {
    if (!isActive() || document.querySelector('.modal-back')) return;
    if (/input|textarea|select/i.test(e.target.tagName)) return;
    const now = Date.now();
    if (now - last > 60) buffer = '';
    last = now;
    if (e.key === 'Enter') { if (buffer.length >= 4) { e.preventDefault(); onScan(cleanCode(buffer)); } buffer = ''; return; }
    if (e.key.length === 1) buffer += e.key;
  };
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}
