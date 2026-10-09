// Controller: first-time setup, sign-in, signing in again, signing out.
import * as View from '../views/AuthView.js';
import { api } from '../core/api.js';
import { prefs, setPref } from '../core/prefs.js';
import { modal, field, toast } from '../core/ui.js';
import * as Sync from '../services/SyncService.js';

async function signedIn(result) {
  setPref('token', result.token);
  setPref('prefix', result.prefix);
  setPref('deviceName', result.device_name);
  await Sync.startFresh();
}

/** Full-screen gate shown until this device is signed in. Resolves once it is. */
export function gate(el) {
  return new Promise(resolve => {
    async function check() {
      el.innerHTML = '<div class="auth"><div class="auth-card"><p class="muted" style="margin:0">Connecting…</p></div></div>';
      try {
        const status = await api('status', { timeout: 15000 });
        show(status.needs_setup ? 'setup' : 'login');
      } catch (e) {
        el.innerHTML = e.status === 0 ? View.offlineHtml(e.message) : View.problemHtml(e.message);
        el.querySelector('[data-retry]').onclick = check;
      }
    }
    function show(mode) {
      el.innerHTML = mode === 'setup' ? View.setupHtml(prefs.deviceName) : View.loginHtml(prefs.deviceName);
      const form = el.querySelector('form');
      form.querySelector('[name=password]').focus();
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(form));
        const error = el.querySelector('[data-error]');
        const btn = form.querySelector('button');
        const fail = msg => { error.textContent = msg; error.classList.remove('hidden'); btn.disabled = false; };
        if (mode === 'setup' && f.password !== f.confirm) return fail('The two passwords are not the same.');
        btn.disabled = true;
        try {
          const result = await api(mode === 'setup' ? 'setup' : 'login', { method: 'POST', body: { password: f.password, device_name: f.device_name.trim() || prefs.deviceName } });
          await signedIn(result);
          resolve();
        } catch (err) {
          if (err.data?.needs_setup === true && mode !== 'setup') return show('setup');
          if (err.data?.needs_setup === false && mode === 'setup') return show('login');
          fail(err.message);
        }
      });
    }
    check();
  });
}

let asking = false;
/** Shown when the server signs this device out (for example after the shop password changed). */
export function signInAgain() {
  if (asking) return;
  asking = true;
  const m = modal({ title: 'Sign in again', size: 'narrow',
    body: `<p class="muted" style="margin-top:0">This device was signed out, maybe because the shop password was changed. Sales made here are safe and upload after you sign in.</p>
      ${field('Shop password', '<input name="password" type="password" autocomplete="current-password">')}`,
    actions: [{ label: 'Later' }, { label: 'Sign in', cls: 'primary', onClick: async el => {
      const result = await api('login', { method: 'POST', body: { password: el.querySelector('[name=password]').value, device_name: prefs.deviceName } });
      await signedIn(result);
      toast('Signed in', 'good');
      Sync.run();
    } }],
    onOpen: el => el.querySelector('[name=password]').addEventListener('keydown', e => { if (e.key === 'Enter') el.querySelector('.modal-foot .primary').click(); }) });
  m.onClose = () => { asking = false; };
}

export async function signOut() {
  try { await api('logout', { method: 'POST' }); } catch { /* offline: still sign out here */ }
  setPref('token', '');
  location.reload();
}
