// Controller: the "Place the photo" window. The cashier drags the photo to move it and zooms
// (slider, mouse wheel or two-finger pinch) so the whole drink fits the square card picture.
import { modal } from '../core/ui.js';
import { fitView, fillView, coverZoom, clampView, drawSquare, exportSquare } from '../core/photo.js';

const viewHtml = () => `<div class="cropper">
  <div class="crop-frame" data-frame><canvas data-canvas aria-label="Photo preview"></canvas><div class="crop-grid" aria-hidden="true"></div></div>
  <p class="muted small crop-hint">Drag to move the photo. Zoom out until nothing important is cut.</p>
  <div class="crop-zoom"><span aria-hidden="true">−</span><input type="range" min="0" max="1000" step="1" data-zoom aria-label="Zoom"><span aria-hidden="true">+</span></div>
  <div class="row crop-quick"><button type="button" class="btn sm" data-fit>Show whole photo</button><button type="button" class="btn sm" data-fill>Fill the square</button></div>
</div>`;

/** Resolves to the square photo (a data URL), or null if cancelled. */
export function openCropper(img) {
  return new Promise(resolve => {
    let view = clampView(img, fillView(img));
    const minZoom = 1, maxZoom = Math.max(4, coverZoom(img) * 3);
    let finished = false;
    const m = modal({ title: 'Place the photo', size: 'crop', body: viewHtml(), autofocus: false, actions: [
      { label: 'Cancel', onClick: () => { finished = true; resolve(null); } },
      { label: 'Use photo', cls: 'primary', onClick: () => { finished = true; resolve(exportSquare(img, view)); } },
    ] });
    m.onClose = () => { if (!finished) resolve(null); };
    const frame = m.querySelector('[data-frame]'), canvas = m.querySelector('[data-canvas]'), slider = m.querySelector('[data-zoom]');
    const ctx = canvas.getContext('2d');

    const toSlider = z => Math.round(Math.log(z / minZoom) / Math.log(maxZoom / minZoom) * 1000);
    const fromSlider = n => minZoom * Math.pow(maxZoom / minZoom, n / 1000);
    function draw() {
      const px = Math.round(frame.clientWidth * (window.devicePixelRatio || 1));
      if (canvas.width !== px) canvas.width = canvas.height = px;
      drawSquare(ctx, img, view, px);
      slider.value = toSlider(view.zoom);
    }
    function zoomTo(z) {
      z = Math.max(minZoom, Math.min(maxZoom, z));
      const k = z / view.zoom;  // zoom around the middle of the square
      view = clampView(img, { zoom: z, x: view.x * k, y: view.y * k });
      draw();
    }

    // Drag with mouse or finger; pinch with two fingers.
    const pointers = new Map();
    let pinch = null;
    frame.addEventListener('pointerdown', e => {
      frame.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: view.zoom }; }
    });
    frame.addEventListener('pointermove', e => {
      const last = pointers.get(e.pointerId);
      if (!last) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2 && pinch) {
        const [a, b] = [...pointers.values()];
        zoomTo(pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d);
      } else if (pointers.size === 1) {
        const side = frame.clientWidth;
        view = clampView(img, { ...view, x: view.x + (e.clientX - last.x) / side, y: view.y + (e.clientY - last.y) / side });
        draw();
      }
    });
    const up = e => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; };
    frame.addEventListener('pointerup', up);
    frame.addEventListener('pointercancel', up);
    frame.addEventListener('wheel', e => { e.preventDefault(); zoomTo(view.zoom * Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    slider.addEventListener('input', () => zoomTo(fromSlider(Number(slider.value))));
    // Arrow keys move it a little (for keyboard users).
    frame.tabIndex = 0;
    frame.addEventListener('keydown', e => {
      const step = 0.02, moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (!moves[e.key]) return;
      e.preventDefault();
      view = clampView(img, { ...view, x: view.x + moves[e.key][0], y: view.y + moves[e.key][1] }); draw();
    });
    m.querySelector('[data-fit]').addEventListener('click', () => { view = fitView(img); draw(); });
    m.querySelector('[data-fill]').addEventListener('click', () => { view = clampView(img, fillView(img)); draw(); });
    requestAnimationFrame(draw);
  });
}
