// "Install as app" support. Loaded first, because the browser announces installability early.
import { emit } from './bus.js';

let deferred = null;
export const installState = window.__installState = {
  canPrompt: false,
  installed: matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
};
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; installState.canPrompt = true; emit('install'); });
window.addEventListener('appinstalled', () => { Object.assign(installState, { installed: true, canPrompt: false }); deferred = null; emit('install'); });

export async function install() {
  if (!deferred) return;
  deferred.prompt();
  await deferred.userChoice.catch(() => {});
  deferred = null; installState.canPrompt = false; emit('install');
}
