// Talks to the server that serves this app (same address, so nothing to configure).
import { prefs } from './prefs.js';

export class ApiError extends Error {
  constructor(message, status, data = {}) { super(message); this.status = status; this.data = data; }
}

/** Call the server. status 0 in an ApiError means "could not reach the server" (offline). */
export async function api(path, { method = 'GET', body, timeout = 20000, raw = false } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  let res;
  try {
    res = await Promise.race([
      fetch('api/' + path, {
        method, signal: ctl.signal, cache: 'no-store',
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(prefs.token ? { Authorization: 'Bearer ' + prefs.token } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeout + 500)),
    ]);
  } catch {
    throw new ApiError('Could not reach the shop server. Check the internet connection.', 0);
  } finally { clearTimeout(timer); }
  if (raw && res.ok) return res;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `The server answered with an error (${res.status}).`, res.status, data);
  return data;
}
