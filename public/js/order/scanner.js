// Reads the counter QR code with the phone's camera.
// Uses the phone's own QR reader when it has one (most Android phones), otherwise jsQR.
import { loadScript } from '../core/loadScript.js';

export class CameraError extends Error {}

export function startScanner(video, onCode) {
  let stream = null, running = true, timer = 0, detector = null;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) throw new CameraError('This browser cannot use the camera here.');
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    } catch (e) {
      throw new CameraError(e?.name === 'NotAllowedError' || e?.name === 'SecurityError'
        ? 'The camera is blocked. Allow the camera for this page in your browser settings, or type the code instead.'
        : 'No camera could be opened. Type the code under the counter QR instead.');
    }
    if (!running) return stop();
    video.srcObject = stream;
    await video.play().catch(() => {});
    if ('BarcodeDetector' in window) {
      try { if ((await BarcodeDetector.getSupportedFormats()).includes('qr_code')) detector = new BarcodeDetector({ formats: ['qr_code'] }); } catch { detector = null; }
    }
    if (!detector) await loadScript('/js/vendor/jsQR.js');
    loop();
  }

  async function read() {
    if (video.readyState < 2 || !video.videoWidth) return null;
    if (detector) {
      try { const found = await detector.detect(video); return found[0]?.rawValue || null; } catch { detector = null; await loadScript('/js/vendor/jsQR.js'); }
    }
    // Look at the middle square of the picture, at most 640 pixels across (fast enough for older phones).
    const vw = video.videoWidth, vh = video.videoHeight, side = Math.min(vw, vh), size = Math.min(640, side);
    canvas.width = canvas.height = size;
    ctx.drawImage(video, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, size, size);
    const found = window.jsQR(ctx.getImageData(0, 0, size, size).data, size, size, { inversionAttempts: 'attemptBoth' });
    return found?.data || null;
  }

  async function loop() {
    if (!running) return;
    try { const text = await read(); if (text && running) await onCode(text); } catch { /* keep looking */ }
    if (running) timer = setTimeout(() => requestAnimationFrame(loop), 150);
  }

  function stop() {
    running = false; clearTimeout(timer);
    stream?.getTracks().forEach(t => t.stop());
    stream = null; video.srcObject = null;
  }

  return { ready: start(), stop };
}
