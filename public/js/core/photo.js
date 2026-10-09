// Product photos: the cashier places the photo in a square (drag to move, zoom in or out so
// nothing important is cut), and the result is saved as a small square JPEG (a data URL)
// with the product. Small enough to sync quickly and to keep on the device for offline use.
export const SIDE = 480;   // pixels of the saved square photo
const TARGET = 90_000;     // characters; the server refuses anything over 200 000

/** Opens a picture file (or a saved data URL) as an image. */
export function loadImage(source) {
  if (source instanceof Blob) {
    if (source.type && !source.type.startsWith('image/')) return Promise.reject(new Error('Pick a picture file (JPG or PNG).'));
    if (source.size > 25 * 1024 * 1024) return Promise.reject(new Error('That photo is over 25 MB. Pick a smaller one.'));
  }
  return new Promise((resolve, reject) => {
    const url = source instanceof Blob ? URL.createObjectURL(source) : source, img = new Image();
    const done = () => { if (source instanceof Blob) URL.revokeObjectURL(url); };
    img.onload = () => { done(); resolve(img); };
    img.onerror = () => { done(); reject(new Error('That file could not be opened as a picture. Use a JPG or PNG photo.')); };
    img.src = url;
  });
}

/**
 * Where the photo sits in the square. Units are "one square side", so it works at any size.
 * zoom 1 = the whole photo fits inside the square (nothing cut, blank space around it);
 * cover = the photo just fills the square (the longer side is cut).
 */
export function fitView(img) { return { zoom: 1, x: 0, y: 0 }; }
export const coverZoom = img => Math.max(img.naturalWidth, img.naturalHeight) / Math.min(img.naturalWidth, img.naturalHeight);
export function fillView(img) { return { zoom: coverZoom(img), x: 0, y: 0 }; }

function drawnSize(img, zoom) {
  const base = 1 / Math.max(img.naturalWidth, img.naturalHeight);
  return [img.naturalWidth * base * zoom, img.naturalHeight * base * zoom];
}
/** Keep the photo from sliding away: it can only move as far as its edges allow. */
export function clampView(img, v) {
  const [w, h] = drawnSize(img, v.zoom), rx = Math.abs(w - 1) / 2, ry = Math.abs(h - 1) / 2;
  return { zoom: v.zoom, x: Math.max(-rx, Math.min(rx, v.x)), y: Math.max(-ry, Math.min(ry, v.y)) };
}

/** Draw the square: white background, then the photo where the cashier placed it. */
export function drawSquare(ctx, img, v, size) {
  const [w, h] = drawnSize(img, v.zoom);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, (0.5 - w / 2 + v.x) * size, (0.5 - h / 2 + v.y) * size, w * size, h * size);
}

/** The finished square photo as a JPEG data URL, small enough to sync. */
export function exportSquare(img, v) {
  for (const side of [SIDE, 380, 300]) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = side;
    drawSquare(canvas.getContext('2d'), img, v, side);
    for (const q of [0.82, 0.72, 0.6]) {
      const url = canvas.toDataURL('image/jpeg', q);
      if (url.length <= TARGET) return url;
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 240;
  drawSquare(canvas.getContext('2d'), img, v, 240);
  return canvas.toDataURL('image/jpeg', 0.6);
}
