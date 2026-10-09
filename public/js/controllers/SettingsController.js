// Controller: settings.
import * as View from '../views/SettingsView.js';
import * as Shop from '../models/ShopModel.js';
import * as Sync from '../services/SyncService.js';
import * as Auth from './AuthController.js';
import { on } from '../core/bus.js';
import { api } from '../core/api.js';
import { prefs, setPref } from '../core/prefs.js';
import { toast, askPin, applyTheme, formValues, confirmBox, modal } from '../core/ui.js';
import { install } from '../core/install.js';
import { openQrCodes } from './OnlineController.js';

let root;
const $ = s => root.querySelector(s);

export function mount(el) {
  root = el;
  el.innerHTML = View.layout(prefs, Shop.get());
  renderSync(); renderInstall();
  on('sync', renderSync);
  on('install', renderInstall);
  on('prefs', k => { if (k === 'prefix') $('[data-prefix]').textContent = prefs.prefix || '?'; });
  on('shop', () => { const f = $('[data-shop]'); for (const [k, v] of Object.entries(Shop.get())) { const i = f.querySelector(`[name=${k}]`); if (i && document.activeElement !== i) i.value = v; } });

  el.addEventListener('click', async e => {
    const segBtn = e.target.closest('[data-seg] [data-v]');
    if (segBtn) {
      const name = segBtn.closest('[data-seg]').dataset.seg;
      setPref(name, segBtn.dataset.v);
      segBtn.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === segBtn));
      if (name === 'theme') applyTheme();
    }
    if (e.target.closest('[data-sync-now]')) {
      if (Sync.state.phase === 'signedout') return Auth.signInAgain();
      await Sync.run();
      toast(Sync.state.phase === 'ok' ? 'Synced' : 'Could not sync. See the status above.', Sync.state.phase === 'ok' ? 'good' : 'bad');
    }
    if (e.target.closest('[data-backup]')) downloadBackup(e.target.closest('[data-backup]'));
    if (e.target.closest('[data-password]')) changePassword();
    if (e.target.closest('[data-signout]')) signOut();
    if (e.target.closest('[data-save-shop]')) saveShop();
    if (e.target.closest('[data-install-btn]')) install();
    if (e.target.closest('[data-online-qr]')) openQrCodes();
  });
  el.addEventListener('change', e => {
    const k = e.target.dataset.pref; if (!k) return;
    let v = e.target.type === 'checkbox' ? e.target.checked : e.target.value.trim();
    if (k === 'deviceName' && !v) { v = prefs.deviceName; e.target.value = v; return; }
    setPref(k, v);
    if (k === 'deviceName') Sync.soon(); // the server learns the new name on the next sync
    toast('Saved', 'good');
  });
}
export function show() { renderSync(); }
export function hide() {}

function renderSync() {
  if (!root) return;
  const s = View.syncStatusHtml(Sync.state);
  const el = $('[data-sync-status]'); el.className = 'status-line ' + s.cls; el.innerHTML = s.html;
}
function renderInstall() {
  const st = window.__installState || {};
  $('[data-install]').innerHTML = View.installHtml({ ...st, ios: /iPhone|iPad/.test(navigator.userAgent) });
}

async function downloadBackup(btn) {
  btn.disabled = true;
  try {
    const res = await api('backup/database.sql', { raw: true, timeout: 60000 });
    const name = (res.headers.get('Content-Disposition') || '').match(/filename="(.+)"/)?.[1] || 'debulgado_pos_backup.sql';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(await res.blob()); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    toast('Database downloaded', 'good');
  } catch (e) { toast(e.message, 'bad'); }
  btn.disabled = false;
}

function changePassword() {
  modal({ title: 'Change shop password', size: 'narrow', body: View.passwordForm(),
    actions: [{ label: 'Cancel' }, { label: 'Change password', cls: 'primary', onClick: async el => {
      const f = formValues(el);
      if (f.new !== f.confirm) throw new Error('The two new passwords are not the same.');
      await api('password', { method: 'POST', body: { current: f.current, new: f.new } });
      toast('Password changed. Other devices must sign in again.', 'good');
    } }] });
}

async function signOut() {
  const n = Sync.state.pending;
  const text = n ? `<b>${n} sale${n === 1 ? ' has' : 's have'} not uploaded yet.</b> They stay on this device and upload after you sign in again.`
    : 'You will need the shop password to use the POS on this device again.';
  if (await confirmBox('Sign out this device?', text, 'Sign out', 'danger solid')) Auth.signOut();
}

async function saveShop() {
  if (!(await askPin('change the shop details'))) return;
  const f = formValues($('[data-shop]'));
  const rate = Number(f.senior_pwd_rate);
  if (!(rate >= 0 && rate <= 100)) return toast('The discount must be between 0 and 100%.', 'bad');
  if (f.manager_pin && !/^\d{4,8}$/.test(f.manager_pin)) return toast('The manager PIN must be 4 to 8 digits.', 'bad');
  await Shop.save({ shop_name: f.shop_name.trim() || "Debulgado's Coffee Shop", shop_address: f.shop_address.trim(), receipt_footer: f.receipt_footer.trim(), senior_pwd_rate: rate, manager_pin: f.manager_pin });
  toast('Shop details saved', 'good');
}
