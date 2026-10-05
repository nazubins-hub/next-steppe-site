/**
 * GET /api/map-tile?z=&x=&y=&layer=  — the handler; `worker/index.js` routes to it.
 *
 * One quantised XYZ imagery tile, proxied. Two kinds of layer come through here,
 * and they are cached in opposite ways for opposite reasons:
 *
 *   naip, hillshade   USGS renders on demand, keyless and public domain. Held at
 *                     our edge for a week, because that cache is what makes a
 *                     15-second render usable at all.
 *   imagery           Esri World Imagery, a real 256 px pyramid behind a CDN,
 *                     reached with our ArcGIS Location Platform key. Passed
 *                     through, and NEVER put in the shared cache.
 *
 * WHY THIS EXISTS: THE CACHE WAS ALWAYS THERE AND WE ALWAYS MISSED IT
 * The map used to ask USGS for one `exportImage` render per view, with a bbox
 * built from wherever the drag happened to stop. Measured against
 * `USGSNAIPPlus` over the Vail test address:
 *
 *   new bbox, 500 m span     17.7 s      new bbox, 250 m    21.6 s
 *   new bbox, 120 m span     15.5 s      the SAME url again  0.14 s
 *
 * and the response carries `x-cache: Hit from cloudfront`, `max-age=43200`.
 * USGS renders on demand behind a twelve-hour CDN, so the imagery was never
 * slow — every pan simply minted a URL nobody had ever asked for, which is a
 * guaranteed miss, and then a 15-to-22-second wait on a beige square. Panning
 * to an arbitrary float centre CANNOT hit that cache. That is the bug.
 *
 * So tiles here are addressed by integer z/x/y on the standard Web Mercator
 * grid. The same ground always produces the same URL, which means the CDN can
 * finally do its job, the browser can reuse a decoded image across a pan, and a
 * second visitor to a street pays nothing for it.
 *
 * WHY PROXY IT RATHER THAN LET THE BROWSER ADDRESS USGS DIRECTLY
 * Quantising alone would fix the miss rate without this file. The proxy buys
 * the other half: `caches.default` holds the tile at our own edge for a week
 * rather than USGS's twelve hours, and `warmTiles()` can start the first nine
 * renders while the visitor is still reading their elevation result — which is
 * the only way to hide a cold 15-second render, because nothing makes it fast.
 *
 * WHY ESRI COMES THROUGH HERE TOO, AND WHY IT NEVER TOUCHES THE SHARED CACHE
 * The key. A Location Platform key in the page is a key anyone can lift and
 * bill against; here it never leaves the Worker, and `badTile()` bounds what it
 * can be spent on to Colorado at the zooms the map offers. Esri's product terms
 * license commercial deployment through authenticated access, and nothing in
 * them grants serving one billed tile to many visitors — so an Esri tile is
 * fetched once for each visitor who sees it, and only that visitor's browser
 * keeps it (`Cache-Control: private`). The shared cache that makes USGS usable
 * would, for Esri, be a way of not paying for tiles. Its CDN answers in a
 * fraction of a second, so there is no cold render to hide and nothing to
 * pre-warm.
 *
 * XYZ RATHER THAN A BBOX IN THE QUERY STRING
 * A bbox parameter is a general-purpose imagery proxy with our name on the
 * bandwidth. Integer tile coordinates on a fixed grid are a closed set, they
 * are bounded below to Colorado, and they are the cache key. When the imagery
 * source was swapped for a real tile pyramid, the client barely changed.
 *
 * WHAT THIS ROUTE KNOWS ABOUT THE VISITOR
 * Tile coordinates, and nothing else. No address reaches it — `site-lookup.js`
 * is the only route that ever sees one, and it does not pass it on. A tile is
 * coarser than the rounded coordinates that already go to USGS for the terrain
 * read. The USGS tiles are deliberately CACHEABLE and shared: that sharing is
 * the entire point. Esri receives the same tile coordinates from this Worker —
 * never the visitor's IP, never an address. `observability` stays off in
 * wrangler.jsonc, so these URLs are not sampled into a log either.
 */

const NAIP =
  'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer/exportImage';
const ELEV =
  'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage';
const ESRI =
  'https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer';

/* The same three layers the panel offers. The two USGS layers are JPEG renders,
   because a hillshade carries per-cell DEM noise that is photographic in
   character however grey it looks; Esri's pyramid is JPEG already.

   Each zoom range is in the layer's OWN tile levels. The map draws a view at
   zoom z from z itself for a 1024 px render, and from z + 2 for Esri's 256 px
   pyramid — the same ground at the same density. Esri's real detail ends at z19
   over the valley; z20 and deeper come back as a 2.5 KB grey placeholder,
   measured, so the map stretches z19 rather than asking for deeper. */
const LAYERS = {
  naip:      { kind: 'render', url: NAIP, zMin: 14, zMax: 20 },
  hillshade: { kind: 'render', url: ELEV, rule: { rasterFunction: 'Hillshade Gray' },
               zMin: 14, zMax: 20 },
  imagery:   { kind: 'esri', zMin: 16, zMax: 19 },
};

/* `aerial` was the NAIP layer's name until Esri took the default. A page loaded
   before the deploy still asks for it, and should keep getting pictures. */
const ALIASES = { aerial: 'naip' };

/* WHICH LAYERS EACH ROUTE MAY SPEND
   The table above says what this file can fetch; these two sets say who may ask.
   `/api/map-tile` is public and `/studio/api/map-tile` is behind Cloudflare
   Access, and only the second one is allowed to spend the Esri key once the
   public map has stopped asking for it — the tracing tool that needs Esri is in
   the studio now, and a keyless route cannot be billed by a stranger.
   Until the public template ships without the Esri layer, `imagery` has to stay
   in PUBLIC_LAYERS: taking it out first would blank the live map. Removing it
   here, with PUBLIC_DEFAULT set to `naip`, IS the public half of that change. */
export const PUBLIC_LAYERS = new Set(['naip', 'hillshade', 'imagery']);
export const PUBLIC_DEFAULT = 'imagery';
export const STUDIO_LAYERS = new Set(['imagery']);
export const STUDIO_DEFAULT = 'imagery';

/* 1024 and not 256, for the USGS renders. This is not a real tile pyramid —
   every tile is an on-demand render, so the per-request cost is a render, not a
   byte count, and sixteen 256 px tiles cost sixteen renders where one 1024
   costs one. At z16 that puts 471 m of ground across 1024 px, or 0.46 m/px,
   which is the native resolution of the 60 cm NAIP underneath it. */
const TILE_PX = 1024;

const MERC = 20037508.342789244;

// SITE_RULES.coBbox, restated. A tile outside Colorado is not a tile this
// database has any business rendering, and the bound is what keeps the route
// from being a free imagery CDN for the rest of the country — on our key, too.
const CO = { west: -109.06, south: 36.99, east: -102.04, north: 41 };

const tileBbox = (z, x, y) => {
  const size = (MERC * 2) / 2 ** z;
  const xmin = -MERC + x * size;
  const ymax = MERC - y * size;
  return { xmin, ymin: ymax - size, xmax: xmin + size, ymax };
};

const lonOf = (x) => (x / MERC) * 180;
const latOf = (y) =>
  (Math.atan(Math.exp(((y / MERC) * 180 * Math.PI) / 180)) * 360) / Math.PI - 90;

// Reject rather than render. An out-of-range tile is a client bug or a probe,
// and either way answering it costs a 15-second upstream render or a billed tile.
function badTile(z, x, y, layer) {
  const l = LAYERS[layer];
  if (!l) return 'unknown layer';
  if (!Number.isInteger(z) || z < l.zMin || z > l.zMax) return 'zoom out of range';
  const n = 2 ** z;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= n || y >= n) {
    return 'tile out of range';
  }
  const b = tileBbox(z, x, y);
  if (
    lonOf(b.xmax) < CO.west || lonOf(b.xmin) > CO.east ||
    latOf(b.ymax) < CO.south || latOf(b.ymin) > CO.north
  ) {
    return 'outside Colorado';
  }
  return null;
}

function upstreamUrl(z, x, y, layer) {
  const b = tileBbox(z, x, y);
  const l = LAYERS[layer];
  const p = new URLSearchParams({
    bbox: `${b.xmin},${b.ymin},${b.xmax},${b.ymax}`,
    bboxSR: '3857',
    imageSR: '3857',
    size: `${TILE_PX},${TILE_PX}`,
    format: 'jpg',
    f: 'image',
  });
  if (l.rule) p.set('renderingRule', JSON.stringify(l.rule));
  return `${l.url}?${p}`;
}

/* A week. NAIP is reflown on a multi-year cycle and the 3DEP hillshade is
   terrain, so a stale tile is not a wrong tile — it is last week's identical
   render. Anything shorter throws away the only thing that makes this fast. */
const TTL = 604800;

const plainError = (msg, status) =>
  new Response(msg, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });

/* How long a visitor is made to wait before we give up on them. NOT how long
   the render is given — see salvage below, which is the point of the split. */
const WAIT_MS = 25000;

/* Esri's tiles are cached at its CDN, so a tile that has not come in ten
   seconds is not coming; there is no render worth salvaging behind it. */
const ESRI_WAIT_MS = 10000;

/* A sentinel rather than a rejection: a timeout is an ordinary outcome here,
   not an error, and racing against a rejection would make the salvage path look
   like a failure to the catch that handles real ones. */
const TIMED_OUT = Symbol('timeout');

async function withTimeout(promise, ms) {
  let timer;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
  });
  try {
    return await Promise.race([promise, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/* NEVER ABORT THE UPSTREAM. Observed in production: a cold z17 tile over Denver
   took 30.1 s, hit an AbortController, returned 504 and cached NOTHING — so the
   retry started the same render from zero and paid another 20 s. The render was
   done, or nearly; aborting threw it away and billed the next visitor for it.

   So the fetch is raced against a timer rather than cancelled by one. If the
   timer wins the visitor gets a 504 they can retry, and the fetch is handed to
   waitUntil to finish and populate the cache in the background — by the time
   they retry, or the next person arrives, it is a hit. Slow renders are exactly
   the ones worth keeping; they are the expensive ones. */
function fetchTile(z, x, y, layer) {
  return fetch(upstreamUrl(z, x, y, layer));
}

/* Store a finished upstream response under the tile's key. Shared by the fast
   path and the salvage path so they cannot drift on status handling or headers,
   which is the kind of thing that silently caches a 502 for a week. */
async function store(cache, key, res) {
  if (!res.ok) return null;
  const out = new Response(await res.arrayBuffer(), {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': `public, max-age=${TTL}, immutable`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
  await cache.put(key, out.clone());
  return out;
}

/* ── Esri World Imagery ──
   The key is added here and nowhere else. Two rules follow from it being in
   the upstream URL: no error below ever echoes that URL, and nothing Esri
   returns is kept anywhere but the visitor's own browser.

   Esri refuses a MISSING token as HTTP 200 with a JSON body — measured, the
   keyless probe answered `200` and `{"error":{"code":499,"message":"Token
   Required."}}` — so a status check alone would pass that along as a tile. The
   content type is what decides: an image is a tile, anything else is a refusal.
   A WRONG token is not refused at all: measured 2026-09-15, a junk string and
   an invented AAPK-shaped key both got real imagery, on CloudFront cache misses
   as well as hits. So a lapsed key leaves the map drawing and the site quietly
   out of licence; renewing before the expiry date is the only guard. A missing
   key is a 503 here, and the panel falls back to the 2019 aerial on that, or
   on Esri being down. */
async function esriTile(z, x, y, env) {
  const key = env && env.ARCGIS_API_KEY;
  if (!key) return plainError('Aerial imagery is not configured.', 503);

  let res;
  try {
    res = await withTimeout(
      fetch(`${ESRI}/tile/${z}/${y}/${x}?token=${encodeURIComponent(key)}`),
      ESRI_WAIT_MS,
    );
  } catch {
    return plainError('Aerial imagery upstream did not answer.', 504);
  }
  if (res === TIMED_OUT) return plainError('Aerial imagery upstream did not answer.', 504);
  if ([401, 403, 498, 499].includes(res.status)) {
    return plainError('Aerial imagery key was refused.', 502);
  }
  if (!res.ok) return plainError(`Aerial imagery upstream returned ${res.status}.`, 502);

  const type = res.headers.get('Content-Type') || '';
  if (!type.startsWith('image/')) return plainError('Aerial imagery key was refused.', 502);

  return new Response(res.body, {
    headers: {
      'Content-Type': type,
      // The visitor's browser, and nothing shared — see the header comment.
      'Cache-Control': 'private, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function handleMapTile(request, env, ctx, opts = {}) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }

  const allowed = opts.allowed || PUBLIC_LAYERS;

  const q = new URL(request.url).searchParams;
  const z = Number(q.get('z'));
  const x = Number(q.get('x'));
  const y = Number(q.get('y'));
  const asked = q.get('layer') || opts.fallback || PUBLIC_DEFAULT;
  const layer = ALIASES[asked] || asked;

  /* A layer this route does not serve is refused in the same words as a layer
     that does not exist. Which route may spend the key is not a visitor's
     business, and `badTile()` would otherwise answer for it. */
  if (!allowed.has(layer)) return plainError('unknown layer', 400);

  const bad = badTile(z, x, y, layer);
  if (bad) return plainError(bad, 400);

  if (LAYERS[layer].kind === 'esri') return esriTile(z, x, y, env);

  // Cache under a NORMALISED key, not the request as it arrived. Parameter
  // order and any stray query string a link picked up would otherwise each mint
  // a separate copy of an identical tile — the same miss-by-construction this
  // route exists to stop, one level up.
  const key = new Request(
    `${new URL(request.url).origin}/api/map-tile?z=${z}&x=${x}&y=${y}&layer=${layer}`,
    { method: 'GET' },
  );
  const cache = caches.default;

  const hit = await cache.match(key);
  if (hit) return hit;

  const pending = fetchTile(z, x, y, layer);

  let res;
  try {
    res = await withTimeout(pending, WAIT_MS);
  } catch {
    return plainError('Imagery upstream did not answer.', 504);
  }

  if (res === TIMED_OUT) {
    // Let the render finish on its own time and land in the cache. The visitor
    // is told to retry; whoever asks next — very likely them — gets a hit.
    if (ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(pending.then((r) => store(cache, key, r)).catch(() => {}));
    }
    return plainError('Imagery is still rendering upstream — try again shortly.', 504);
  }

  // Upstream failures are NOT cached. A 502 stored for a week would blank a
  // tile long after the service came back, and the visitor has no way to
  // invalidate it.
  if (!res.ok) return plainError(`Imagery upstream returned ${res.status}.`, 502);

  return (await store(cache, key, res)) || plainError('Imagery upstream returned no image.', 502);
}

/* ── why the Esri picture carries no date ──
   The capture date would be worth showing — a visitor reads an aerial as
   current unless told otherwise — and Esri publishes one per place in the
   service's metadata layers. But the Location Platform tile host answers
   tiles and nothing else: `identify` and a per-layer `query` both came back
   404 with our key, measured 2026-09-14. The metadata answers on
   services.arcgisonline.com, which answers anonymously as well, so a 200 there
   proves nothing about licence — it is the anonymous access this project
   refuses for the tiles themselves. So the caption says capture dates vary,
   and states no date. A guessed one would be worse than none. */

/* ── pre-warm ──
   Called from the address lookup with `ctx.waitUntil`, so it runs after the
   response has gone and delays nothing — and only when the 2019 aerial is what
   the map opens on, which is when the Esri key is missing. With the key, Esri's
   CDN is fast enough to need no warming, and warming NAIP would spend eighteen
   USGS renders per lookup on a layer most visitors never switch to.

   This is the only thing that can hide a cold render. The visitor spends real
   seconds reading their elevation, aspect and hardiness zone before they scroll
   to the map at all; starting the nine renders at geocode time spends that
   silence usefully. If it does not finish, the map simply loads the way it
   would have anyway — it is an optimisation, never a dependency, and nothing
   downstream waits on the promise. */
/* TWO LEVELS, not one. z16 is where the map opens, but nobody places a pin
   there — they open the map, find the roof, and zoom in once. Measured, that
   second step costs a median 15.7 s of cold render per tile, which is the
   original complaint reappearing one gesture later. Warming z17 as well makes
   the whole common path warm instead of just its first frame.

   Eighteen subrequests, against a limit of fifty. */
const WARM_LEVELS = [16, 17];

export function warmTiles(origin, lat, lon) {
  const jobs = [];
  for (const z of WARM_LEVELS) {
    const n = 2 ** z;
    const x0 = Math.floor(((lon + 180) / 360) * n);
    const y0 = Math.floor(
      ((1 -
        Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) /
        2) * n,
    );
    /* 3x3 at each level. The geocode is a point on a road and the house can be
       a couple of hundred feet off it, so a single tile is not enough to be
       sure of covering the thing the visitor is looking for. */
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = x0 + dx;
        const y = y0 + dy;
        if (badTile(z, x, y, 'naip')) continue;
        // Through our own route, so the warm populates the same cache entry the
        // browser will ask for. Warming USGS directly would heat CloudFront's
        // copy and leave ours empty — the visitor would still pay for the miss.
        jobs.push(
          fetch(`${origin}/api/map-tile?z=${z}&x=${x}&y=${y}&layer=naip`).catch(() => {}),
        );
      }
    }
  }
  return Promise.all(jobs);
}
