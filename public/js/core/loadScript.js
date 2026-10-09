// Loads a script file only when it is needed (the QR libraries are large and rarely used).
const loading = {};

export function loadScript(src) {
  loading[src] ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => { delete loading[src]; reject(new Error('Could not load a part of the app. Check the internet connection.')); };
    document.head.append(s);
  });
  return loading[src];
}
