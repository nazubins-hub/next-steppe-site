/**
 * worker/access.js — the Cloudflare Access token check.
 *
 * This is the one file in the repo where being wrong means the private tool is
 * not private, and it cannot be exercised by loading a page: `wrangler dev` has
 * no Access in front of it, and production cannot be asked for a bad token
 * without a bad token. So the tokens are made here, with a key pair generated in
 * the test, and the certificate endpoint is a function whose calls are counted.
 *
 * Counting those calls is half the point. One studio map view asks for about
 * fifty tiles at once, and each one arrives at the Worker separately; a naive
 * implementation fetches certificates fifty times, or refuses forty-nine of them.
 *
 *   node --test test/            (npm test, and `npm run build` runs it too)
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { isLocalDev, refuse, resetKeyCache, verifyAccess } from '../worker/access.js';
import { handleStudio } from '../worker/studio.js';

const TEAM = 'nextsteppe.cloudflareaccess.com';
const AUD = '7a1f3c5e9b2d4a6c8e0f2a4b6c8d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d';
const ENV = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD };
const NOW = 1_800_000_000_000; // a fixed clock; every token is dated from it

const b64url = (bytes) => Buffer.from(bytes).toString('base64url');
const utf8 = (s) => new TextEncoder().encode(s);

async function keypair(kid) {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  return { kid, priv: pair.privateKey, jwk: { kid, kty: 'RSA', alg: 'RS256', use: 'sig', n: jwk.n, e: jwk.e } };
}

async function token(key, over = {}, head = {}) {
  const claims = {
    iss: `https://${TEAM}`,
    aud: [AUD],
    exp: Math.floor(NOW / 1000) + 3600,
    nbf: Math.floor(NOW / 1000) - 10,
    email: 'someone@example.com',
    ...over,
  };
  const h = b64url(utf8(JSON.stringify({ alg: 'RS256', kid: key.kid, typ: 'JWT', ...head })));
  const p = b64url(utf8(JSON.stringify(claims)));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key.priv, utf8(`${h}.${p}`));
  return `${h}.${p}.${b64url(new Uint8Array(sig))}`;
}

/* A certificate endpoint that counts, so a test can assert on subrequests. */
function certs(keys, { fail = false } = {}) {
  const calls = { n: 0, urls: [] };
  const fetcher = async (url) => {
    calls.n += 1;
    calls.urls.push(url);
    if (fail) throw new Error('upstream down');
    return new Response(JSON.stringify({ keys: keys.map((k) => k.jwk) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return { fetcher, calls };
}

const ask = (tok, { host = 'nextsteppe.garden', path = '/studio/api/session' } = {}) =>
  new Request(`https://${host}${path}`, tok ? { headers: { 'Cf-Access-Jwt-Assertion': tok } } : undefined);

/* Key generation is slow enough to be worth doing once for the whole file. */
const K1 = await keypair('kid-one');
const K2 = await keypair('kid-two');

describe('verifyAccess', () => {
  beforeEach(() => resetKeyCache());

  it('accepts a token Access would have signed, and fetches the keys once', async () => {
    const { fetcher, calls } = certs([K1]);
    const seen = await verifyAccess(ask(await token(K1)), ENV, { now: NOW, fetcher });
    assert.equal(seen.ok, true);
    assert.equal(seen.email, 'someone@example.com');
    assert.equal(calls.n, 1);
    assert.equal(calls.urls[0], `https://${TEAM}/cdn-cgi/access/certs`);
  });

  it('accepts a string aud as well as an array', async () => {
    const { fetcher } = certs([K1]);
    const seen = await verifyAccess(ask(await token(K1, { aud: AUD })), ENV, { now: NOW, fetcher });
    assert.equal(seen.ok, true);
  });

  it('reuses the cached keys for a second request', async () => {
    const { fetcher, calls } = certs([K1]);
    const tok = await token(K1);
    assert.equal((await verifyAccess(ask(tok), ENV, { now: NOW, fetcher })).ok, true);
    assert.equal((await verifyAccess(ask(tok), ENV, { now: NOW + 1000, fetcher })).ok, true);
    assert.equal(calls.n, 1);
  });

  describe('refuses', () => {
    const cases = {
      'no header': () => null,
      'not three parts': () => 'aaa.bbb',
      'not base64url at all': () => 'ß.ß.ß',
      'an empty part': () => 'aaa..ccc',
    };
    for (const [name, make] of Object.entries(cases)) {
      it(name, async () => {
        const { fetcher, calls } = certs([K1]);
        assert.equal((await verifyAccess(ask(make()), ENV, { now: NOW, fetcher })).ok, false);
        assert.equal(calls.n, 0, 'a token this broken must not cost a subrequest');
      });
    }

    it('alg: none', async () => {
      const { fetcher, calls } = certs([K1]);
      const tok = await token(K1, {}, { alg: 'none' });
      assert.equal((await verifyAccess(ask(tok), ENV, { now: NOW, fetcher })).ok, false);
      assert.equal(calls.n, 0);
    });

    it('alg: HS256 — a symmetric token signed with the public key', async () => {
      const { fetcher, calls } = certs([K1]);
      const tok = await token(K1, {}, { alg: 'HS256' });
      assert.equal((await verifyAccess(ask(tok), ENV, { now: NOW, fetcher })).ok, false);
      assert.equal(calls.n, 0);
    });

    it('a header with no kid', async () => {
      const { fetcher, calls } = certs([K1]);
      const tok = await token({ ...K1, kid: undefined });
      assert.equal((await verifyAccess(ask(tok), ENV, { now: NOW, fetcher })).ok, false);
      assert.equal(calls.n, 0);
    });

    it('a tampered payload', async () => {
      const { fetcher } = certs([K1]);
      const tok = await token(K1);
      const [h, , s] = tok.split('.');
      const forged = b64url(utf8(JSON.stringify({
        iss: `https://${TEAM}`, aud: [AUD], exp: Math.floor(NOW / 1000) + 99999, email: 'someone-else@example.com',
      })));
      const seen = await verifyAccess(ask(`${h}.${forged}.${s}`), ENV, { now: NOW, fetcher });
      assert.equal(seen.ok, false);
    });

    it('a token signed by a key that is not in the published set', async () => {
      const { fetcher, calls } = certs([K1]);           // endpoint publishes K1
      const seen = await verifyAccess(ask(await token(K2)), ENV, { now: NOW, fetcher }); // token says K2
      assert.equal(seen.ok, false);
      assert.equal(calls.n, 1, 'one look for the unknown kid, and no more');
    });

    it('the wrong audience', async () => {
      const { fetcher, calls } = certs([K1]);
      const tok = await token(K1, { aud: ['some-other-application'] });
      assert.equal((await verifyAccess(ask(tok), ENV, { now: NOW, fetcher })).ok, false);
      assert.equal(calls.n, 0);
    });

    it('the wrong issuer', async () => {
      const { fetcher, calls } = certs([K1]);
      const tok = await token(K1, { iss: 'https://someone-elses-team.cloudflareaccess.com' });
      assert.equal((await verifyAccess(ask(tok), ENV, { now: NOW, fetcher })).ok, false);
      assert.equal(calls.n, 0);
    });

    it('an expired token, beyond the skew', async () => {
      const { fetcher } = certs([K1]);
      const tok = await token(K1, { exp: Math.floor(NOW / 1000) - 120 });
      assert.equal((await verifyAccess(ask(tok), ENV, { now: NOW, fetcher })).ok, false);
    });

    it('a token that is not valid yet', async () => {
      const { fetcher } = certs([K1]);
      const tok = await token(K1, { nbf: Math.floor(NOW / 1000) + 600 });
      assert.equal((await verifyAccess(ask(tok), ENV, { now: NOW, fetcher })).ok, false);
    });

    it('a token with no expiry at all', async () => {
      const { fetcher } = certs([K1]);
      const tok = await token(K1, { exp: undefined });
      assert.equal((await verifyAccess(ask(tok), ENV, { now: NOW, fetcher })).ok, false);
    });

    it('an unconfigured Worker — no team, no aud', async () => {
      const { fetcher, calls } = certs([K1]);
      const tok = await token(K1);
      assert.equal((await verifyAccess(ask(tok), {}, { now: NOW, fetcher })).ok, false);
      assert.equal((await verifyAccess(ask(tok), { ACCESS_AUD: AUD }, { now: NOW, fetcher })).ok, false);
      assert.equal((await verifyAccess(ask(tok), { ACCESS_TEAM_DOMAIN: TEAM }, { now: NOW, fetcher })).ok, false);
      assert.equal(calls.n, 0, 'missing configuration must not reach the network either');
    });

    it('a certificate endpoint that is down', async () => {
      const { fetcher, calls } = certs([K1], { fail: true });
      assert.equal((await verifyAccess(ask(await token(K1)), ENV, { now: NOW, fetcher })).ok, false);
      assert.equal(calls.n, 1);
    });
  });

  it('takes the team domain however the secret was pasted in', async () => {
    for (const raw of [TEAM, `https://${TEAM}`, `https://${TEAM}/`]) {
      resetKeyCache();
      const { fetcher, calls } = certs([K1]);
      const env = { ACCESS_TEAM_DOMAIN: raw, ACCESS_AUD: AUD };
      assert.equal((await verifyAccess(ask(await token(K1)), env, { now: NOW, fetcher })).ok, true, raw);
      assert.equal(calls.urls[0], `https://${TEAM}/cdn-cgi/access/certs`);
    }
  });

  it('costs ONE subrequest when a map view arrives at once', async () => {
    const { fetcher, calls } = certs([K1]);
    const tok = await token(K1);
    const all = await Promise.all(
      Array.from({ length: 20 }, () => verifyAccess(ask(tok), ENV, { now: NOW, fetcher })),
    );
    assert.ok(all.every((r) => r.ok), 'every concurrent request is answered, not just the first');
    assert.equal(calls.n, 1);
  });

  it('follows a key rotation, once', async () => {
    const first = certs([K1]);
    const tok1 = await token(K1);
    assert.equal((await verifyAccess(ask(tok1), ENV, { now: NOW, fetcher: first.fetcher })).ok, true);

    /* An hour later the team has rotated to K2 and retired K1. */
    const later = NOW + 3_600_001;
    const rotated = certs([K2]);
    const tok2 = await token(K2);
    assert.equal((await verifyAccess(ask(tok2), ENV, { now: later, fetcher: rotated.fetcher })).ok, true);
    assert.equal(rotated.calls.n, 1);

    /* And the retired key stops working rather than lingering in the cache. */
    assert.equal((await verifyAccess(ask(tok1), ENV, { now: later + 1000, fetcher: rotated.fetcher })).ok, false);
    assert.equal(rotated.calls.n, 1, 'and that refusal is free');
  });

  it('a burst of unknown kids costs one subrequest a minute, not one each', async () => {
    const { fetcher, calls } = certs([K1]);
    const strangers = [];
    for (let i = 0; i < 5; i += 1) strangers.push(await keypair(`stranger-${i}`));

    const tokens = await Promise.all(strangers.map((k) => token(k)));
    const burst = [];
    for (let i = 0; i < 50; i += 1) {
      burst.push(await verifyAccess(ask(tokens[i % tokens.length]), ENV, { now: NOW + i, fetcher }));
    }
    assert.ok(burst.every((r) => r.ok === false));
    assert.equal(calls.n, 1, 'the rate limit holds across the whole burst');

    /* A minute on, one more look is allowed — and no more than one. */
    for (let i = 0; i < 10; i += 1) {
      await verifyAccess(ask(tokens[0]), ENV, { now: NOW + 61_000 + i, fetcher });
    }
    assert.equal(calls.n, 2);
  });

  it('an unknown kid on a token whose claims already fail costs nothing', async () => {
    const { fetcher, calls } = certs([K1]);
    const stranger = await keypair('nobody');
    const tok = await token(stranger, { aud: ['not-this-application'] });
    assert.equal((await verifyAccess(ask(tok), ENV, { now: NOW, fetcher })).ok, false);
    assert.equal(calls.n, 0);
  });

  it('keeps a usable cached key when the endpoint has a bad minute', async () => {
    const good = certs([K1]);
    const tok = await token(K1);
    assert.equal((await verifyAccess(ask(tok), ENV, { now: NOW, fetcher: good.fetcher })).ok, true);

    /* Past the TTL, with the endpoint now failing: the session survives, because
       an Access key lives for weeks and the token's own expiry is the real bound. */
    const down = certs([K1], { fail: true });
    const later = NOW + 3_600_001;
    assert.equal((await verifyAccess(ask(tok), ENV, { now: later, fetcher: down.fetcher })).ok, true);
    assert.equal(down.calls.n, 1);
  });
});

describe('refuse()', () => {
  it('says nothing except no', async () => {
    const res = refuse();
    assert.equal(res.status, 403);
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
    assert.equal(res.headers.get('X-Robots-Tag'), 'noindex, nofollow');
    assert.equal(await res.text(), '{"error":"forbidden"}');
  });
});

describe('the dev bypass', () => {
  const on = { ...ENV, STUDIO_DEV_BYPASS: '1' };

  it('works on localhost', () => {
    for (const host of ['localhost:8788', '127.0.0.1:8788', '[::1]:8788']) {
      assert.equal(isLocalDev(new Request(`http://${host}/studio/api/session`), on), true, host);
    }
  });

  it('does nothing in production, even when the variable is set', () => {
    assert.equal(isLocalDev(new Request('https://nextsteppe.garden/studio/api/session'), on), false);
    assert.equal(isLocalDev(new Request('https://dry-gulch-site.workers.dev/studio/api/session'), on), false);
    /* A hostname that merely contains the word is not localhost either. */
    assert.equal(isLocalDev(new Request('https://localhost.nextsteppe.garden/studio/api/session'), on), false);
  });

  it('does nothing on localhost when the variable is not set', () => {
    const req = new Request('http://localhost:8788/studio/api/session');
    assert.equal(isLocalDev(req, ENV), false);
    assert.equal(isLocalDev(req, { ...ENV, STUDIO_DEV_BYPASS: 'true' }), false);
    assert.equal(isLocalDev(req, { ...ENV, STUDIO_DEV_BYPASS: '0' }), false);
  });
});

describe('handleStudio', () => {
  beforeEach(() => resetKeyCache());

  it('refuses every path the same way when there is no token', async () => {
    for (const path of ['/studio/api/session', '/studio/api/map-tile?z=17&x=1&y=1', '/studio/api/nonsense']) {
      const res = await handleStudio(new Request(`https://nextsteppe.garden${path}`), ENV, {});
      assert.equal(res.status, 403, path);
      assert.equal(await res.text(), '{"error":"forbidden"}', path);
    }
  });

  it('refuses a forged assertion on a host that Access does not cover', async () => {
    const stranger = await keypair('forged');
    const tok = await token(stranger);
    const res = await handleStudio(
      new Request('https://dry-gulch-site.workers.dev/studio/api/session', {
        headers: { 'Cf-Access-Jwt-Assertion': tok },
      }),
      ENV,
      {},
    );
    assert.equal(res.status, 403);
  });

  it('never repeats a token or an error message back', async () => {
    const tok = await token(K1);                     // valid shape, unknown key here
    const res = await handleStudio(
      new Request('https://nextsteppe.garden/studio/api/session', {
        headers: { 'Cf-Access-Jwt-Assertion': tok },
      }),
      { ...ENV, ACCESS_TEAM_DOMAIN: '' },            // unconfigured: the throwing path
      {},
    );
    const body = await res.text();
    assert.equal(body, '{"error":"forbidden"}');
    for (const part of tok.split('.')) assert.ok(!body.includes(part.slice(0, 12)));
  });

  it('answers the session probe when the bypass is on', async () => {
    const res = await handleStudio(
      new Request('http://localhost:8788/studio/api/session'),
      { ...ENV, STUDIO_DEV_BYPASS: '1' },
      {},
    );
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await res.json(), { ok: true, exp: 0, dev: true });
  });

  it('404s an unknown private path for a signed-in visitor', async () => {
    const res = await handleStudio(
      new Request('http://localhost:8788/studio/api/nonsense'),
      { ...ENV, STUDIO_DEV_BYPASS: '1' },
      {},
    );
    assert.equal(res.status, 404);
  });

  it('refuses a method that is not a read', async () => {
    const res = await handleStudio(
      new Request('http://localhost:8788/studio/api/session', { method: 'POST' }),
      { ...ENV, STUDIO_DEV_BYPASS: '1' },
      {},
    );
    assert.equal(res.status, 405);
  });
});
