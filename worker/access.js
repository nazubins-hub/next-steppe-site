/**
 * Cloudflare Access, checked a second time — the gate in front of /studio/api/*.
 *
 * WHO ACTUALLY STOPS A STRANGER
 * Cloudflare Access does, at the edge, before any of this runs: the Zero Trust
 * application covers `nextsteppe.garden/studio` and `nextsteppe.garden/studio/*`,
 * and an unauthenticated request to either is answered with a redirect to the
 * login page and never reaches the Worker. That is also what protects the studio
 * PAGE, which is a static asset and is served before the Worker gets a say.
 *
 * WHY CHECK IT AGAIN HERE, THEN
 * Because the custom domain is not the only way in. A Worker can also be reached
 * on `*.workers.dev` and on per-version preview URLs, and an Access application
 * attached to a zone hostname does not cover those. `wrangler.jsonc` turns both
 * off, but a dashboard toggle is not a guarantee I want the Esri key to rest on.
 * So the routes that spend the key, or that would answer with anything a visitor
 * should not have, verify the token Access signs — and fail closed when there
 * isn't one. On the workers.dev host there is no token, so there is no studio.
 *
 * WHAT ACCESS ACTUALLY SENDS
 * A signed JWT in `Cf-Access-Jwt-Assertion`, added by Cloudflare to the request
 * it proxies. The browser never sends that header itself; it holds only the
 * `CF_Authorization` cookie, which this file deliberately ignores — the header
 * is the one thing a client cannot forge past the edge. A forged header on a
 * host that bypasses Access fails the signature check below.
 *
 * ORDER OF CHECKS, AND WHY IT IS THIS ORDER
 * Structure, then claims, then the key, then the signature. Everything free
 * happens before anything that could touch the network: a request carrying a
 * `kid` nobody has ever seen cannot make this Worker fetch a certificate unless
 * its issuer, audience and expiry already check out. One map view asks for about
 * fifty tiles at once, so key fetching is also coalesced and rate-limited — see
 * keyFor(). The worst case is one subrequest per isolate per minute.
 *
 * NO DEPENDENCY, DELIBERATELY
 * Cloudflare's own example uses `jose`. This is RS256 over a JWKS the platform
 * publishes — about sixty lines of WebCrypto, which the runtime already has.
 * SECURITY.md pins what little this site depends on and explains why; an npm
 * package in the auth path is the opposite of that.
 *
 * NOTHING IS LOGGED, AND NOTHING IS EXPLAINED
 * Every failure returns the same 403 through refuse(). No reason, no claim, no
 * fragment of a token, no exception text — a 403 that says which check failed is
 * a 403 that helps someone pass it. There is no console call in this file, and
 * wrangler.jsonc has no `observability` block, so the token never lands in a log
 * either.
 */

/* The one shape a token may have. Anything else is refused before a key is
   looked at, let alone fetched. */
const ALG = 'RS256';

/* Cloudflare rotates the Access signing keys every few weeks, so a cached set
   stays good for a long time; an hour is short enough to pick up a rotation
   without being a per-request fetch. */
const KEY_TTL_MS = 3600_000;

/* A floor on how often this isolate may go and ask for certificates. It bounds
   two different things at once: fifty tile requests arriving together (they
   share one fetch through `inflight`), and a stream of tokens carrying a `kid`
   that does not exist (each one fails closed instead of minting a subrequest). */
const KEY_ATTEMPT_MS = 60_000;

/* A hung certificate fetch would be a studio that neither loads nor fails. */
const KEY_WAIT_MS = 5000;

/* Clocks disagree. A minute either way is generous for a token Access issues
   and this Worker reads seconds later. */
const SKEW_S = 60;

/* Imported CryptoKeys by `kid`, for one isolate. `lastAttempt` is stamped before
   a fetch starts, so a failing upstream is rate-limited exactly like a
   succeeding one, and `inflight` is what makes a burst cost one subrequest. */
let cache = { team: '', keys: new Map(), fetchedAt: 0, lastAttempt: 0, inflight: null };

/* Test-only, and never called in production: node:test needs a cold isolate
   between cases, and a module-level cache cannot otherwise be cleared. */
export function resetKeyCache() {
  cache = { team: '', keys: new Map(), fetchedAt: 0, lastAttempt: 0, inflight: null };
}

/**
 * The same answer for every failure. See the file header.
 */
export const refuse = () =>
  new Response(JSON.stringify({ error: 'forbidden' }), {
    status: 403,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });

/* `https://team.cloudflareaccess.com`, however the secret was pasted in — with
   or without a scheme, with or without a trailing slash. The issuer claim and
   the certificate URL are both built from this one value, so a mismatch between
   them is impossible. */
function teamHost(raw) {
  const s = String(raw || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  return /^[a-z0-9][a-z0-9.-]*$/i.test(s) ? s : '';
}

const b64urlBytes = (s) => {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
};

const b64urlJson = (s) => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

/* Replace the cached set. Sets `lastAttempt` BEFORE awaiting, so concurrent
   callers and failed calls are both bounded by KEY_ATTEMPT_MS. On any failure
   the existing set is left alone: a certificate endpoint having a bad minute
   should not lock out a session whose key is already here. */
function refreshKeys(team, now, fetcher) {
  if (cache.inflight) return cache.inflight;
  cache.lastAttempt = now;
  cache.inflight = (async () => {
    const ctl = new AbortController();
    const bell = setTimeout(() => ctl.abort(), KEY_WAIT_MS);
    try {
      const res = await fetcher(`https://${team}/cdn-cgi/access/certs`, {
        signal: ctl.signal,
        headers: { Accept: 'application/json' },
      });
      if (!res || !res.ok) return;
      const body = await res.json();
      const jwks = Array.isArray(body && body.keys) ? body.keys.slice(0, 10) : [];
      const fresh = new Map();
      for (const jwk of jwks) {
        if (!jwk || jwk.kty !== 'RSA' || !jwk.kid || (jwk.alg && jwk.alg !== ALG)) continue;
        try {
          fresh.set(
            jwk.kid,
            await crypto.subtle.importKey(
              'jwk',
              { kty: 'RSA', n: jwk.n, e: jwk.e, alg: ALG, ext: true },
              { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
              false,
              ['verify'],
            ),
          );
        } catch {
          /* One unusable key in the set is not a reason to drop the others. */
        }
      }
      if (fresh.size) cache = { ...cache, team, keys: fresh, fetchedAt: now, inflight: cache.inflight };
    } catch {
      /* Timeout, network, or unreadable JSON. Keep what we have. */
    } finally {
      clearTimeout(bell);
    }
  })().finally(() => {
    cache.inflight = null;
  });
  return cache.inflight;
}

/* The key for this `kid`, or null. Never fetches for a `kid` we cannot fetch
   for yet, and never answers with a key from another team's set. */
async function keyFor(kid, team, now, fetcher) {
  const held = cache.team === team ? cache.keys.get(kid) : undefined;
  if (held && now - cache.fetchedAt < KEY_TTL_MS) return held;

  /* A fetch already running is one to WAIT for, not a reason to fail. This is
     the ordinary case on a cold isolate: a map view asks for about fifty tiles
     at once, the first request starts the fetch, and the other forty-nine would
     otherwise fall into the rate limit below and be refused for want of a key
     that was seconds away. */
  if (cache.inflight) {
    await cache.inflight;
    return (cache.team === team ? cache.keys.get(kid) : undefined) || null;
  }

  /* Inside the lockout with nothing in flight: a key we already hold still
     answers — Access keys live for weeks, and the token's own `exp` is what
     bounds a session. A `kid` we do NOT hold fails here, with no subrequest and
     no attempt at a stale match. */
  if (now - cache.lastAttempt < KEY_ATTEMPT_MS) return held || null;

  await refreshKeys(team, now, fetcher);
  /* Deliberately re-read rather than falling back to `held`: a `kid` that has
     rotated out of the published set must stop working. */
  return (cache.team === team ? cache.keys.get(kid) : undefined) || null;
}

/**
 * Verify the Access assertion on this request.
 *
 * Returns `{ok: true, exp, email}` or `{ok: false}` — and nothing else, so no
 * caller can accidentally tell a client which check failed.
 *
 * `now` and `fetcher` are seams for test/access.test.mjs, which needs a clock it
 * controls and a certificate endpoint it can count calls to.
 */
export async function verifyAccess(request, env, opts = {}) {
  const now = opts.now ?? Date.now();
  const fetcher = opts.fetcher ?? fetch;
  const nope = { ok: false };

  try {
    const team = teamHost(env && env.ACCESS_TEAM_DOMAIN);
    const aud = String((env && env.ACCESS_AUD) || '').trim();
    /* Unconfigured is refused, not waved through. A deploy that loses the
       secrets closes the studio; it does not open it. */
    if (!team || !aud) return nope;

    const token = request.headers.get('Cf-Access-Jwt-Assertion');
    if (!token) return nope;

    // ── 1. structure ──────────────────────────────────────────────────────────
    const parts = token.split('.');
    if (parts.length !== 3) return nope;
    const [h64, p64, s64] = parts;
    if (!h64 || !p64 || !s64) return nope;
    const head = b64urlJson(h64);
    if (!head || head.alg !== ALG || !head.kid) return nope;

    // ── 2. claims, before anything can reach the network ──────────────────────
    const claims = b64urlJson(p64);
    if (!claims || typeof claims !== 'object') return nope;
    if (claims.iss !== `https://${team}`) return nope;
    const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!auds.includes(aud)) return nope;
    const secs = now / 1000;
    if (!Number.isFinite(claims.exp) || claims.exp < secs - SKEW_S) return nope;
    if (Number.isFinite(claims.nbf) && claims.nbf > secs + SKEW_S) return nope;

    // ── 3. the key ────────────────────────────────────────────────────────────
    const key = await keyFor(head.kid, team, now, fetcher);
    if (!key) return nope;

    // ── 4. the signature ──────────────────────────────────────────────────────
    const ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      b64urlBytes(s64),
      new TextEncoder().encode(`${h64}.${p64}`),
    );
    if (!ok) return nope;

    return { ok: true, exp: claims.exp, email: typeof claims.email === 'string' ? claims.email : '' };
  } catch {
    /* A malformed token throws on decode. That is a refusal like any other, and
       the reason stays in here. */
    return nope;
  }
}

/* localhost, in the two spellings a URL can produce plus the bare IPv6 form. */
const DEV_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * The local development bypass, which cannot fire in production.
 *
 * TWO conditions, and the second is not a setting: `STUDIO_DEV_BYPASS=1` lives
 * only in `.dev.vars` (gitignored, and never uploaded — do not run
 * `wrangler secret bulk .dev.vars`), AND the request must have arrived on
 * localhost. On nextsteppe.garden the host check fails even if the variable is
 * somehow set, which is the point: `wrangler dev` cannot put Cloudflare Access
 * in front of the studio, and the alternative to a bypass is developing the
 * private tool without ever running it.
 */
export function isLocalDev(request, env) {
  if (!env || env.STUDIO_DEV_BYPASS !== '1') return false;
  try {
    return DEV_HOSTS.has(new URL(request.url).hostname);
  } catch {
    return false;
  }
}
