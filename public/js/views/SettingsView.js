// View: settings, in plain sections.
import { esc, isNative, timeAgo } from '../core/format.js';
import { field } from '../core/ui.js';

const seg = (name, value, options) => `<div class="seg" role="group" data-seg="${name}">${options.map(([v, l]) => `<button data-v="${v}" class="${value === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;

export function layout(p, shop) {
  return `<div class="page-head"><div><h1>Settings</h1><p>Look and feel, this device, syncing, and shop details.</p></div></div>
  <div class="settings">
    <section class="panel"><h2>Appearance</h2><p>Only affects this device.</p><div class="stack">
      <div class="row"><span style="min-width:120px">Theme</span>${seg('theme', p.theme, [['auto', 'Match device'], ['light', 'Light'], ['dark', 'Dark']])}</div>
      <div class="row"><span style="min-width:120px">Product cards</span>${seg('cardSize', p.cardSize, [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']])}</div>
      <label class="check"><input type="checkbox" data-pref="sound" ${p.sound ? 'checked' : ''}> Play a sound when a payment goes through</label></div></section>

    <section class="panel"><h2>This device</h2><p>Shown on receipts and in History, so you can tell devices apart.</p><div class="stack">
      <div class="grid2">${field('Device name', `<input data-pref="deviceName" value="${esc(p.deviceName)}" maxlength="60" placeholder="e.g. Counter laptop">`)}
        ${field('Cashier on duty', `<input data-pref="cashier" value="${esc(p.cashier)}" maxlength="60" placeholder="e.g. Juan">`)}</div>
      <p class="muted small" style="margin:0">Receipt numbers from this device start with <b data-prefix>${esc(p.prefix || '?')}</b>. The server gives each device its own letter so numbers never repeat.</p></div></section>

    <section class="panel" id="sync"><h2>Sync and sign-in</h2><p>Every sale is saved on this device first, then uploaded to the shop's database whenever there is internet.</p>
      <div class="stack">
        <div class="status-line" data-sync-status></div>
        <div class="row"><button class="btn" data-sync-now>Sync now</button>
          ${isNative() ? '' : '<button class="btn" data-backup>Download database (.sql)</button>'}
          <span class="spacer"></span><button class="btn" data-password>Change shop password</button><button class="btn danger" data-signout>Sign out this device</button></div>
        ${isNative() ? '<p class="muted small" style="margin:0">To download the database file, open the POS on a laptop.</p>'
          : '<p class="muted small" style="margin:0">The download is the whole shop database as a MySQL file. Import it in phpMyAdmin or XAMPP, or keep it as a backup.</p>'}
      </div></section>

    <section class="panel"><h2>Shop</h2><p>Shared by all devices.</p><div class="stack" data-shop>
      ${field('Shop name', `<input name="shop_name" value="${esc(shop.shop_name)}" maxlength="120">`)}
      ${field('Address (printed on receipts)', `<input name="shop_address" value="${esc(shop.shop_address)}" maxlength="200">`)}
      <div class="grid2">${field('Receipt footer', `<input name="receipt_footer" value="${esc(shop.receipt_footer)}" maxlength="200">`)}
        ${field('Senior citizen / PWD discount (%)', `<input name="senior_pwd_rate" inputmode="decimal" value="${esc(shop.senior_pwd_rate)}">`)}</div>
      ${field('Manager PIN (optional)', `<input name="manager_pin" type="password" inputmode="numeric" autocomplete="new-password" value="${esc(shop.manager_pin)}" placeholder="Leave blank for no PIN">`)}
      <p class="muted small" style="margin:0">With a PIN set, voiding an order, changing the menu and changing these shop details ask for it.</p>
      <div class="row"><span class="spacer"></span><button class="btn primary" data-save-shop>Save shop details</button></div></div></section>

    <section class="panel"><h2>Online orders</h2><p>Customers scan the order QR, choose on their phone, give their name and tap Send order. It shows up under the order ticket on the POS, where you take payment. Their phone shows the order's status.</p>
      <div class="row"><button class="btn" data-online-qr>Show and print the order QR code</button></div></section>

    <section class="panel"><h2>Install as an app</h2><div data-install></div></section>
  </div>`;
}

export function syncStatusHtml(s) {
  const waiting = s.pending ? `${s.pending} sale${s.pending === 1 ? '' : 's'} waiting to upload.` : 'Everything on this device is uploaded.';
  if (s.phase === 'syncing') return { cls: '', html: 'Syncing…' };
  if (s.phase === 'ok') return { cls: 'ok', html: `Connected. Last synced ${timeAgo(s.lastSync)}. ${waiting}` };
  if (s.phase === 'offline') return { cls: 'bad', html: `No internet right now. ${waiting} They upload by themselves when the connection is back.` };
  if (s.phase === 'signedout') return { cls: 'bad', html: `This device is signed out. ${waiting} Tap the sync badge to sign in again.` };
  if (s.phase === 'error') return { cls: 'bad', html: `${esc(s.error)} ${waiting}` };
  return { cls: '', html: 'Checking…' };
}

export function installHtml(state) {
  if (isNative()) return '<p class="muted" style="margin:0">You are using the Android app.</p>';
  if (state.installed) return '<p class="muted" style="margin:0">Installed. Open it from your home screen, dock or Start menu, even without internet.</p>';
  if (state.canPrompt) return '<p class="muted" style="margin-top:0">Adds the POS to this device like a normal app, with its own icon and window. It opens and works without internet.</p><button class="btn primary" data-install-btn>Install app</button>';
  if (state.ios) return '<p class="muted" style="margin:0">On iPhone or iPad: tap the Share button in Safari, then <b>Add to Home Screen</b>.</p>';
  return '<p class="muted" style="margin:0">Use your browser menu: <b>Install app</b> (Chrome, Edge) or <b>Add to Home screen</b>.</p>';
}

export const passwordForm = () => `<div class="stack">
  ${field('Current shop password', '<input name="current" type="password" autocomplete="current-password">')}
  ${field('New password (at least 6 characters)', '<input name="new" type="password" autocomplete="new-password">')}
  ${field('Type the new password again', '<input name="confirm" type="password" autocomplete="new-password">')}
  <p class="muted small" style="margin:0">All other devices are signed out and must sign in with the new password. Their unsent sales stay safe on them.</p></div>`;
