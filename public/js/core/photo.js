// Turns a photo picked from the computer or phone into a small JPEG, stored as text (a data URL)
// with the product. Small enough to sync quickly and to keep on the device for offline use.
const MAX_SIDE = 480;      // pixels, longest side
const TARGET = 90_000;     // characters; the server refuses anything over 200 000

function load(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be opened as a picture. Use a JPG or PNG photo.')); };
    img.src = url;
  });
}

function encode(img, side, quality) {
  const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); // transparent PNGs get a white background
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}

/** Resolves to a data URL such as "data:image/jpeg;base64,...". */
export async function shrinkPhoto(file) {
  if (file.type && !file.type.startsWith('image/')) throw new Error('Pick a picture file (JPG or PNG).');
  if (file.size > 25 * 1024 * 1024) throw new Error('That photo is over 25 MB. Pick a smaller one.');
  const img = await load(file);
  for (const side of [MAX_SIDE, 380, 300]) {
    for (const q of [0.82, 0.72, 0.6]) {
      const url = encode(img, side, q);
      if (url.length <= TARGET) return url;
    }
  }
  return encode(img, 240, 0.6);
}
