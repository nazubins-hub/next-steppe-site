/**
 * Is this Access session still good — and if not, saying so in words.
 *
 * THE PROBLEM THIS SOLVES
 * When a Cloudflare Access session lapses, nothing announces it. The next request
 * is answered with a redirect to the login page, and in a `fetch` that arrives as
 * an opaque failure, while in an <img> it arrives as a broken tile. So an expired
 * session looks exactly like Esri having a bad minute — and the map's existing
 * answer to Esri having a bad minute is to fall back to the USGS aerial, which
 * would silently drop someone onto coarser imagery mid-trace and never mention
 * signing in.
 *
 * `redirect: 'manual'` is what tells them apart. A redirect then comes back as an
 * opaque response with `type === 'opaqueredirect'` instead of being followed
 * across an origin the CSP would refuse anyway, so:
 *
 *   ok           signed in, with the expiry Access issued
 *   'signed-out' a redirect, a 401 or a 403 — reload to sign in
 *   'no-worker'  a 404: this is `npm run dev` on :4321, where no Worker runs
 *   'offline'    the fetch threw; the network is gone, not the session
 *
 * The draft is saved either way, which is what the banner says. Nothing is lost
 * by signing in again.
 */

const PROBE = '/studio/api/session';

/* Five minutes' warning: long enough to finish a bed, short enough to mean it. */
export const WARN_BEFORE_MS = 5 * 60 * 1000;

export async function probeSession() {
  let res;
  try {
    res = await fetch(PROBE, { redirect: 'manual', cache: 'no-store', credentials: 'same-origin' });
  } catch {
    return { state: 'offline' };
  }

  /* An opaque redirect carries no status, which is the signal itself. */
  if (res.type === 'opaqueredirect' || res.status === 0) return { state: 'signed-out' };
  if (res.status === 401 || res.status === 403) return { state: 'signed-out' };
  if (res.status === 404) return { state: 'no-worker' };
  if (!res.ok) return { state: 'offline' };

  try {
    const body = await res.json();
    return { state: 'ok', exp: Number(body.exp) || 0, dev: !!body.dev };
  } catch {
    return { state: 'offline' };
  }
}

export function sessionMessage(state, { exp = 0, now = Date.now() } = {}) {
  if (state === 'signed-out') {
    return 'Studio session expired — reload to sign in. Your draft is saved in this browser.';
  }
  if (state === 'no-worker') {
    return 'No Worker on this port: the studio needs `npm run dev:worker` (:8788), not `npm run dev` (:4321).';
  }
  if (state === 'offline') {
    return 'Cannot reach the site. The draft is saved in this browser; imagery will not load until the network is back.';
  }
  if (state === 'ok' && exp) {
    const left = exp * 1000 - now;
    if (left > 0 && left < WARN_BEFORE_MS) {
      const mins = Math.max(1, Math.round(left / 60000));
      return `Studio sign-in ends in about ${mins} minute${mins === 1 ? '' : 's'}. Export now, or reload to renew it.`;
    }
  }
  return null;
}
