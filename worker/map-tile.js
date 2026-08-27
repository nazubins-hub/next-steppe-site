/**
 * GET /api/map-tile?z=&x=&y=&layer=  — the handler; `worker/index.js` routes to it.
 *
 * One quantised XYZ imagery tile, proxied and cached at the edge.
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
 * XYZ RATHER THAN A BBOX IN THE QUERY STRING
 * A bbox parameter is a general-purpose imagery proxy with our name on the
 * bandwidth. Integer tile coordinates on a fixed grid are a closed set, they
 * are bounded below to Colorado, and they are the cache key. If the imagery
 * source is ever swapped for a real tile pyramid, the client does not change.
 *
 * WHAT THIS ROUTE KNOWS ABOUT THE VISITOR
 * Tile coordinates, and nothing else. No address reaches it — `site-lookup.js`
 * is the only route that ever sees one, and it does not pass it on. A tile is
 * coarser than the rounded coordinates that already go to USGS for the terrain
 * read, and unlike the address lookup this response is deliberately CACHEABLE
 * and shared: that sharing is the entire point. `observability` stays off in
 * wrangler.jsonc, so these URLs are not sampled into a log either.
 */

const NAIP =
  'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer/exportImage';
const ELEV =
  'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage';

// Same two layers the panel offers, and the same reasoning as the UI's
// MAP_LAYERS: JPEG for both, because a hillshade carries per-cell DEM noise
// that is photographic in character however grey it looks.
const LAYERS = {
  aerial:    { url: NAIP },
  hillshade: { url: ELEV, rule: { rasterFunction: 'Hillshade Gray' } },
};

/* 1024 and not 256. This is not a real tile pyramid — every tile is an
   on-demand render, so the per-request cost is a render, not a byte count, and
   sixteen 256 px tiles cost sixteen renders where one 1024 costs one. At z16
   that puts 471 m of ground across 1024 px, or 0.46 m/px, which is the native
   resolution of the 60 cm NAIP underneath it. */
const TILE_PX = 1024;

// Zoom range the client offers. z16 ≈ 471 m of ground across the stage, which
// is what the old 500 m default was chosen to be: wide enough to contain a
// geocode that missed by a couple of hundred metres.
const Z_MIN = 14;
const Z_MAX = 20;

const MERC = 20037508.342789244;

// SITE_RULES.coBbox, restated. A tile outside Colorado is not a tile this
// database has any business rendering, and the bound is what keeps the route
// from being a free imagery CDN for the rest of the country.
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
// and either way answering it costs a 15-second upstream render.
function badTile(z, x, y, layer) {
  if (!LAYERS[layer]) return 'unknown layer';
  if (!Number.isInteger(z) || z < Z_MIN || z > Z_MAX) return 'zoom out of range';
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

export async function handleMapTile(request, ctx) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }

  const q = new URL(request.url).searchParams;
  const z = Number(q.get('z'));
  const x = Number(q.get('x'));
  const y = Number(q.get('y'));
  const layer = q.get('layer') || 'aerial';

  const bad = badTile(z, x, y, layer);
  if (bad) return plainError(bad, 400);

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

  /* A sentinel object rather than a rejection: a timeout is an ordinary
     outcome here, not an error, and racing against a rejection would make the
     salvage path look like a failure to the catch below. */
  const TIMED_OUT = Symbol('timeout');
  let timer;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), WAIT_MS);
  });

  let res;
  try {
    res = await Promise.race([pending, deadline]);
  } catch {
    return plainError('Imagery upstream did not answer.', 504);
  } finally {
    clearTimeout(timer);
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

/* ── pre-warm ──
   Called from the address lookup with `ctx.waitUntil`, so it runs after the
   response has gone and delays nothing.

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
        if (badTile(z, x, y, 'aerial')) continue;
        // Through our own route, so the warm populates the same cache entry the
        // browser will ask for. Warming USGS directly would heat CloudFront's
        // copy and leave ours empty — the visitor would still pay for the miss.
        jobs.push(
          fetch(`${origin}/api/map-tile?z=${z}&x=${x}&y=${y}&layer=aerial`).catch(() => {}),
        );
      }
    }
  }
  return Promise.all(jobs);
}
