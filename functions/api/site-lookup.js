/**
 * GET /api/site-lookup?address=…
 *
 * Address -> coordinates + USDA hardiness zone, for the plant browser's
 * "tune this list to your site" panel.
 *
 * WHY THIS EXISTS AT ALL, ON A SITE THAT IS OTHERWISE ENTIRELY STATIC
 * The Census Bureau geocoder sends no `Access-Control-Allow-Origin`, so a
 * browser cannot read its response. That is the whole reason for this file. It
 * is a forwarder, not a service: it holds no logic that the Python site
 * pipeline also holds, because the moment it did, the free first pass and a
 * paid site profile could start disagreeing about where a parcel is.
 *
 * WHY THE CENSUS GEOCODER AND NOT ONE WITH CORS
 * Nominatim would work from the browser directly and needs no server at all.
 * It is also a DIFFERENT geocoder, and two geocoders resolve the same address
 * to different points on a mountain road. A different point is a different
 * aspect, and aspect moves effective elevation by up to 3,000 ft — so the
 * website would recommend one palette and the site analysis another, for the
 * same house, with nothing on screen to explain it. Same source as
 * `scripts/sitecore/sources/geocode.py`, or the two are not comparable.
 *
 * THE VISITOR'S ADDRESS
 * A street address is the most identifying thing this site ever handles, and
 * the plant database is built by a business whose own rule is that a client's
 * coordinates never reach the website. So:
 *
 *   - it is never stored, never logged, and never written to a header;
 *   - it is forwarded to exactly two upstreams and no others;
 *   - the response carries `Cache-Control: no-store`, so neither Cloudflare's
 *     cache nor the browser's keeps a copy;
 *   - the terrain half of the lookup happens in the browser against USGS, and
 *     it is given ROUNDED COORDINATES ONLY. USGS never sees the address.
 *
 * Do not add logging here "temporarily". There is no temporary in a request log.
 */

const CENSUS =
  'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';

// USDA Plant Hardiness Zone Map 2023, by ZIP, mirrored as static JSON.
//
// GRADED COARSE ON PURPOSE. This is the ZIP's zone, not the parcel's, and in
// Eagle County a single ZIP spans thousands of feet of elevation — 81657 covers
// Vail village and the ridge above it and calls both 5b. It is reported to the
// visitor as a fact about their ZIP and is NOT wired to a filter, because for
// this database it would not remove a single species: `zoneMin` is 4 or lower
// for 97 of 104, so at any zone this valley reaches, the filter is a no-op that
// would look like it was doing work.
const PHZM = 'https://phzmapi.org';

const UA = 'NextSteppe-plant-browser/1.0 (+https://nextsteppe.garden)';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // An address in a shared cache key is an address in a shared cache.
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });

// Upstreams get a bounded wait. A hung fetch here is a spinner that never
// resolves in the panel, which is worse than a clean failure the UI can explain.
async function timed(url, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, {
      signal: ctl.signal,
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
  } finally {
    clearTimeout(t);
  }
}

async function lookup(request) {
  const address = (new URL(request.url).searchParams.get('address') || '').trim();

  if (!address) return json({ error: 'no-address', message: 'Enter an address.' }, 400);
  // A geocoder query, not free text. Long enough for a rural mountain address
  // with a unit number, short enough that this is not a general-purpose proxy.
  if (address.length > 200) {
    return json({ error: 'too-long', message: 'That address is too long.' }, 400);
  }

  let res;
  try {
    res = await timed(
      `${CENSUS}?address=${encodeURIComponent(address)}` +
        '&benchmark=Public_AR_Current&format=json',
      9000,
    );
  } catch {
    return json(
      { error: 'geocoder-unreachable', message: 'The Census geocoder did not answer.' },
      502,
    );
  }
  if (!res.ok) {
    return json(
      { error: 'geocoder-error', message: `The Census geocoder returned ${res.status}.` },
      502,
    );
  }

  let matches;
  try {
    matches = ((await res.json()).result || {}).addressMatches || [];
  } catch {
    return json({ error: 'geocoder-error', message: 'Unreadable geocoder response.' }, 502);
  }
  if (!matches.length) {
    return json(
      {
        error: 'no-match',
        message:
          'No match for that address. The Census geocoder wants a street address ' +
          'with a city and state — it cannot find a place name on its own.',
      },
      404,
    );
  }

  const m = matches[0];
  const c = m.coordinates;
  const ac = m.addressComponents || {};

  // HOW WIDE WAS THE INTERPOLATION?
  // Mirrors the note geocode.py records for the same reason: a TIGER match is a
  // guess along a street centreline from the address range on that whole
  // segment, and on a winding mountain road a wide range means the returned
  // point can sit on a different hillside than the house. The panel shows this,
  // because it is the single most likely reason a measured aspect is wrong.
  let precision = null;
  const from = Number(ac.fromAddress);
  const to = Number(ac.toAddress);
  if (Number.isFinite(from) && Number.isFinite(to)) {
    precision = { span: Math.abs(to - from), fromAddress: ac.fromAddress, toAddress: ac.toAddress };
  }

  const zip = ac.zip || null;
  let hardiness = null;
  if (zip && /^\d{5}$/.test(zip)) {
    try {
      const h = await timed(`${PHZM}/${zip}.json`, 6000);
      if (h.ok) {
        const d = await h.json();
        if (d && d.zone) {
          hardiness = { zone: d.zone, tempRange: d.temperature_range || null, zip };
        }
      }
    } catch {
      // A missing hardiness zone is a missing display line, not a failed
      // lookup. Elevation and aspect are what actually filter — never fail the
      // whole request over the field that does not.
    }
  }

  return json({
    lat: Math.round(c.y * 1e6) / 1e6,
    lon: Math.round(c.x * 1e6) / 1e6,
    matchedAddress: m.matchedAddress || null,
    ambiguous: matches.length > 1 ? matches.length : 0,
    precision,
    hardiness,
    source: 'census-geocoder',
  });
}

// A single `onRequest` rather than `onRequestGet`: exporting both a catch-all and
// a method handler leaves which one wins up to the platform, and the answer has
// changed between Pages runtime versions. One export, method checked here.
export const onRequest = async ({ request }) =>
  request.method === 'GET'
    ? lookup(request)
    : new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET' } });
