/**
 * Elevation, slope and aspect for a point, read from USGS 3DEP in the browser.
 *
 * MIRROR of plant-system/ui/template.jsx (see rules.js for what that means and
 * why). This is itself a port of scripts/sitecore/sources/elevation.py — the same
 * ImageServer, the same analysis radius, the same 128-cell grid — so a reading
 * here and a reading in a site analysis are the same reading. Changing anything
 * between the markers means changing it in three places, deliberately.
 */

import { M_PER_FT, SITE_RULES } from './rules.js';

/* @mirror terrain */
const IMAGESERVER =
  "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer";

/* The same 128 cells across the AOI that elevation.py cuts, so the browser
   averages the same population the pipeline averages rather than a coarser
   sample that happens to look similar. */
const GRID = 128;

/* WGS84 -> Web Mercator metres, and a square bbox around a point.
   Both are ports of sitecore/resolve.py. The 1/cos(latitude) correction is not
   optional: Web Mercator distances are inflated by about 1.30 at 39.6°N, so a
   radius used raw would cut a tile ~30% too small. */
function to3857(lon, lat) {
  return [
    (lon * 20037508.34) / 180,
    (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180)) *
      (20037508.34 / 180),
  ];
}

function bbox3857(lat, lon, radiusM) {
  const [cx, cy] = to3857(lon, lat);
  const r = radiusM / Math.cos((lat * Math.PI) / 180);
  return { xmin: cx - r, ymin: cy - r, xmax: cx + r, ymax: cy + r, side: 2 * r };
}

/* How long the whole measurement may take before it is called off.

   Not a guess. 3DEP is slow and its latency has a long tail: measured from the
   browser on a single afternoon, one histogram returned in 13 s, another in 24,
   and a third in 52. A budget shorter than that would abort requests that were
   about to succeed, which is the worst of both — so this is set past the slow
   tail and its job is only to stop a hang, not to enforce a pace. */
const LOOKUP_BUDGET_MS = 75000;

/* 3DEP is fronted by CloudFront and intermittently answers 504 — and CloudFront
   CACHES that 504, so an immediate identical retry gets the stored failure back
   rather than a fresh attempt. The retry therefore has to change the URL. `_r`
   is ignored by the service and defeats the cache entry, which is exactly what
   makes the second try worth making.

   Its failures do not always arrive as a status code. An error response from the
   origin often carries no Access-Control-Allow-Origin header, so the browser
   rejects it as a CORS violation and `fetch` throws a TypeError before any
   status is visible. That is why the catch below is unconditional rather than
   keyed on `r.ok` — observed against Slope Degrees, which then succeeded on the
   retry with identical parameters.

   The retry is bounded by the caller's DEADLINE rather than by a count. Three
   attempts against a service answering in 52 s is a two-and-a-half minute
   spinner, and nobody waits that long — they reload, and the reload starts the
   same two and a half minutes again. */
async function getJSON(path, params, signal, deadline) {
  let err = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt && Date.now() >= deadline) break;
    const q = new URLSearchParams(params);
    if (attempt) q.set("_r", String(Math.floor(Math.random() * 1e9)));
    try {
      const r = await fetch(`${IMAGESERVER}/${path}?${q}`, { signal });
      if (!r.ok) throw new Error(`3DEP returned ${r.status}`);
      const d = await r.json();
      if (d && d.error) throw new Error(d.error.message || "3DEP reported an error");
      return d;
    } catch (e) {
      if (e.name === "AbortError") throw e;
      err = e;
    }
  }
  throw err || new Error("3DEP did not answer");
}

/* Bin mid-points. computeHistograms reports `size` bins spanning min..max, and
   the counts alone say nothing without them. */
function binCentres(h) {
  const w = (h.max - h.min) / h.size;
  return Array.from({ length: h.size }, (_, i) => h.min + w * (i + 0.5));
}

/* Mean bearing and coherence over an aspect histogram.

   An arithmetic mean is wrong on a circle — 350° and 10° average to 180°, due
   south, when every input pointed north. On a north-facing slope that inverts
   the aspect and moves effective elevation 3,000 ft the wrong way.

   Coherence is the resultant length: 1.0 unanimous, 0 none. It is returned
   beside the bearing and never dropped, because a mean without it is a trap.
   Dissected mountain ground alternates spur and draw every hundred metres, and
   averaging opposing faces yields a confident bearing that describes no ground
   on the property. SITE_RULES.aspectCoherence carries the two thresholds that
   decide whether this number may be believed.

   ArcGIS encodes flat ground as -1. Those cells hold no bearing and are dropped
   rather than counted as due north. */
function circularStats(h) {
  const centres = binCentres(h);
  let sx = 0, sy = 0, n = 0;
  for (let i = 0; i < centres.length; i++) {
    const c = centres[i], k = h.counts[i];
    if (c < 0 || !k) continue;
    sx += k * Math.sin((c * Math.PI) / 180);
    sy += k * Math.cos((c * Math.PI) / 180);
    n += k;
  }
  if (!n) return null;
  const deg = ((Math.atan2(sx, sy) * 180) / Math.PI + 360) % 360;
  return { deg, coherence: Math.hypot(sx, sy) / n, n };
}

function weightedMean(h) {
  const centres = binCentres(h);
  let num = 0, den = 0;
  for (let i = 0; i < centres.length; i++) {
    const k = h.counts[i];
    if (!k) continue;
    num += k * centres[i];
    den += k;
  }
  return den ? num / den : null;
}

/* Elevation, slope and aspect for a point. Three requests, run together —
   they do not depend on one another and 3DEP is slow enough that doing them in
   sequence is felt.

   The radius is the analysis radius for a pin. A traced bed that reaches
   further than that gets a radius that contains it — see bedRadiusM — because
   a reading that covers half a bed describes the wrong ground as confidently
   as the right. */
async function measureTerrain(lat, lon, radiusM = SITE_RULES.analysisRadiusM) {
  /* One controller for all three requests. They are a single measurement — two
     of three numbers is not a site — so they succeed or are called off together,
     and an abandoned tab does not leave three sockets open against USGS. */
  const ctl = new AbortController();
  const deadline = Date.now() + LOOKUP_BUDGET_MS;
  const timer = setTimeout(() => ctl.abort(), LOOKUP_BUDGET_MS);
  try {
    return await measureWith(lat, lon, radiusM, ctl.signal, deadline);
  } catch (e) {
    if (e.name === "AbortError") {
      throw new Error(
        "USGS did not answer within " + Math.round(LOOKUP_BUDGET_MS / 1000) +
        " seconds. The 3DEP service is intermittently slow and this is not " +
        "something this page can fix — try again in a minute, or set your site " +
        "by hand below.");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function measureWith(lat, lon, radiusM, signal, deadline) {
  const b = bbox3857(lat, lon, radiusM);
  const geometry = JSON.stringify({
    xmin: b.xmin, ymin: b.ymin, xmax: b.xmax, ymax: b.ymax,
    spatialReference: { wkid: 3857 },
  });
  const pixelSize = JSON.stringify({ x: b.side / GRID, y: b.side / GRID });
  const surface = rule => getJSON("computeHistograms", {
    geometry,
    geometryType: "esriGeometryEnvelope",
    renderingRule: JSON.stringify({ rasterFunction: rule }),
    pixelSize,
    f: "json",
  }, signal, deadline);

  /* The imagery year rides along with the terrain reads rather than adding a
     fourth wait. It resolves to null on any failure and never rejects, so it
     cannot take the measurement down with it. */
  const [point, aspectH, slopeH, imageryYear] = await Promise.all([
    getJSON("identify", {
      geometry: JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }),
      geometryType: "esriGeometryPoint",
      returnGeometry: "false",
      f: "json",
    }, signal, deadline),
    surface("Aspect Degrees"),
    surface("Slope Degrees"),
    naipYear(lat, lon, signal),
  ]);

  const metres = Number(point && point.value);
  /* 3DEP returns its NoData sentinel as a large negative number outside the
     tiled area. Treating that as an elevation would put the site below sea
     level and pass every filter. */
  const elevFt =
    Number.isFinite(metres) && metres > -1000 ? metres / M_PER_FT : null;

  const slopeDeg = slopeH.histograms && slopeH.histograms[0]
    ? weightedMean(slopeH.histograms[0]) : null;
  const slopePct =
    slopeDeg == null ? null : Math.tan((slopeDeg * Math.PI) / 180) * 100;

  /* GROUND THIS FLAT HAS NO ASPECT, and elevation.py refuses to report one:
     "aspect is undefined and must not be invented". The cells still average to
     a bearing — arithmetic does not know the ground is level — so without this
     the panel would print a confident direction for a flat lot and offer to
     correct its elevation for a slope that is not there.

     Note the units. This threshold is in DEGREES of slope, because that is what
     3DEP returns; SITE_RULES.minAspectSlopePct is a percent and answers a
     different question — whether a known aspect is steep enough to earn a
     correction. They are not the same number and must not be collapsed. */
  const aspectExists =
    slopeDeg != null && slopeDeg >= SITE_RULES.minAspectSlopeDeg;
  const asp = aspectExists && aspectH.histograms && aspectH.histograms[0]
    ? circularStats(aspectH.histograms[0]) : null;

  return {
    elevFt: elevFt == null ? null : Math.round(elevFt),
    slopePct: slopePct == null ? null : Math.round(slopePct * 10) / 10,
    slopeDeg: slopeDeg == null ? null : Math.round(slopeDeg * 10) / 10,
    aspectDeg: asp ? Math.round(asp.deg * 10) / 10 : null,
    aspectCoherence: asp ? Math.round(asp.coherence * 100) / 100 : null,
    radiusM,
    imageryYear,
  };
}

const NAIP_SERVER =
  "https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer";

/* When was the aerial flown?

   NAIP is a survey on a multi-year cycle, not a live feed — over Eagle County the
   current pass is 2019. A visitor looking at their own roof will read the picture
   as current unless told otherwise, and a planting put in since simply will not be
   there. So the year is shown beside the credit.

   It is read from the raster name rather than a date field, because the date
   fields come back null on this service while the name carries it:
   `m_3910622_se_13_060_20191003` is a 60 cm tile flown 2019-10-03. Newest wins;
   the mosaic overlaps several. Never hardcode a year — 2019 is true for this
   valley and nowhere else. */
async function naipYear(lat, lon, signal) {
  try {
    const q = new URLSearchParams({
      geometry: JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }),
      geometryType: "esriGeometryPoint",
      returnCatalogItems: "true", returnGeometry: "false", f: "json",
    });
    const r = await fetch(`${NAIP_SERVER}/identify?${q}`, { signal });
    if (!r.ok) return null;
    const d = await r.json();
    const feats = ((d.catalogItems || {}).features) || [];
    let best = null;
    for (const f of feats) {
      const m = /_(\d{4})(\d{2})(\d{2})$/.exec((f.attributes || {}).Name || "");
      if (m && (!best || m[1] > best)) best = m[1];
    }
    return best;
  } catch {
    /* A missing year is a missing half-sentence, not a failed lookup. The map is
       still usable and the terrain read is unaffected. */
    return null;
  }
}

/* The range guard's geographic half, on the same box as
   packs/xeric.assert_in_range(). Refusing is the feature: outside the Southern
   Rockies this database matches a handful of species on elevation alone and
   returns something that looks like a palette and is the residue of a filter. */
function outsideCoverage(lat, lon) {
  const b = SITE_RULES.coBbox;
  return lat < b.south || lat > b.north || lon < b.west || lon > b.east;
}
/* @end-mirror terrain */

export {
  IMAGESERVER,
  GRID,
  to3857,
  bbox3857,
  LOOKUP_BUDGET_MS,
  getJSON,
  binCentres,
  circularStats,
  weightedMean,
  measureTerrain,
  measureWith,
  NAIP_SERVER,
  naipYear,
  outsideCoverage,
};
