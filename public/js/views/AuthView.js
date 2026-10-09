// View: first-time setup and sign-in screens.
import { esc } from '../core/format.js';
import { field } from '../core/ui.js';

const brand = `<div class="auth-brand"><img src="icons/icon.svg" alt="" width="52" height="52">
  <div><div class="auth-shop">Debulgado's</div><div class="auth-sub">Coffee shop POS</div></div></div>`;

export const setupHtml = deviceName => `<div class="auth"><form class="auth-card" data-form="setup" autocomplete="off">
  ${brand}
  <div><h1>Set up your shop</h1>
  <p class="muted">This POS is new. Create the shop password. Every laptop and phone signs in with it once.</p></div>
  ${field('Shop password (at least 6 characters)', '<input name="password" type="password" autocomplete="new-password" required>')}
  ${field('Type it again', '<input name="confirm" type="password" autocomplete="new-password" required>')}
  ${field('Name this device', `<input name="device_name" value="${esc(deviceName)}" maxlength="60" placeholder="e.g. Counter laptop">`)}
  <p class="error-text hidden" data-error></p>
  <button class="btn primary lg">Create password and start</button>
</form></div>`;

export const loginHtml = deviceName => `<div class="auth"><form class="auth-card" data-form="login" autocomplete="off">
  ${brand}
  <div><h1>Sign in this device</h1>
  <p class="muted">Enter the shop password. You only do this once on each device.</p></div>
  ${field('Shop password', '<input name="password" type="password" autocomplete="current-password" required>')}
  ${field('Name this device', `<input name="device_name" value="${esc(deviceName)}" maxlength="60" placeholder="e.g. Counter laptop">`)}
  <p class="error-text hidden" data-error></p>
  <button class="btn primary lg">Sign in</button>
</form></div>`;

export const offlineHtml = message => `<div class="auth"><div class="auth-card">
  ${brand}
  <div><h1>Can't reach the shop server</h1><p class="muted">${esc(message)}</p>
  <p class="muted">The first sign-in needs internet. After that, the POS also works offline.</p></div>
  <button class="btn primary lg" data-retry>Try again</button>
</div></div>`;

export const problemHtml = message => `<div class="auth"><div class="auth-card">
  ${brand}
  <div><h1>The server needs its database</h1><p class="muted">${esc(message)}</p></div>
  <button class="btn primary lg" data-retry>Try again</button>
</div></div>`;
