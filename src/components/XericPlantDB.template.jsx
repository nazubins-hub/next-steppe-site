// ─────────────────────────────────────────────────────────────────
// GENERATED FILE — DO NOT EDIT.
// Species data is owned by plants.json. UI is owned by ui/template.jsx.
// Regenerate with:  python3 scripts/render_jsx.py
// Editing this file directly will be overwritten and will silently
// diverge from the data every other script reads.
// ─────────────────────────────────────────────────────────────────

import { useState, useMemo, useRef, useEffect, Fragment } from "react";

/* ═══════════════════════════════════════════════════════════════════
   XERIC PLANT DATABASE v3 — Intermountain West
   
   IGNITABILITY: 0–10 scale (Idaho Firewise methodology, adopted by
   CSU Extension Fact Sheet 6.305, rev. 7/2025). HIGHER = LESS ignitable.
   CSU recommends ONLY plants rated 8+ within 30 ft of a structure
   (Home Ignition Zones 1 and 2).
   
   ignSrc: "CSU"  = value published in FS 6.305 (or genus entry therein)
           "IDFW" = value published in the Idaho Firewise "Fire Resistance of
                    Plants Master Database" — the method CSU adopted — for
                    species FS 6.305 does not list. Published, not estimated.
           "est"  = estimated from FS 6.305 ignitability criteria
                    (resin/oil content, moisture, growth form, stem type)
   
   pf = WUCOLS-style plant factor (ETo multiplier) for water budgeting.

   CULTURAL / EDIBLE FIELDS
   edible     : { part, prep } — objective food use, or null
   caution    : real hazard or regulatory flag, or null
   useTags    : Food, Beverage, Dye, Fiber, Basketry, Soap, Tool, Ceremonial
   culture    : narrative note. Names specific peoples where documented.
   cultureSrc : T = tribe-attributed in standard ethnobotanical literature
                G = general / multi-group, widely documented
                V = commonly repeated — VERIFY in NAEB before publishing

   PUBLISHING NOTE: verify every claim against the Native American
   Ethnobotany Database (naeb.brit.org), which gives tribe-level
   attribution and a source citation for each use. Name the nation, not
   "Native Americans." Use present tense — these are living practices.
   Do not publish medicinal preparation or dosage.
   ═══════════════════════════════════════════════════════════════════ */

/* __PLANTS__ */

/* __SITERULES__ */

/* ═══════════════════════ STYLE TOKENS ═══════════════════════ */
const C = {
  bg:"#f5efe2", sidebar:"#ebe2ce", card:"#fffdf7", border:"#d3c4a6",
  text:"#1c1811", muted:"#6a5f4d", primary:"#3a6a32", accent:"#9d4a1a", deep:"#28461f",
};

const TYPE_STYLE = {
  "Tree":              { bar:"#2b7a8a", badge:"#dcf1f7", text:"#0b4658" },
  "Shrub":             { bar:"#7a4d9c", badge:"#efe6f8", text:"#48186e" },
  "Cactus/Succulent":  { bar:"#b03a5b", badge:"#fbe2e9", text:"#6e0f2c" },
  "Perennial":         { bar:"#c25f2a", badge:"#fce6d9", text:"#782600" },
  "Grass":             { bar:"#57882b", badge:"#e2efd1", text:"#284e00" },
  "Groundcover":       { bar:"#9c7a17", badge:"#f8efd1", text:"#583e00" },
};

const WATER_STYLE = {
  "Very Low":     { bg:"#fef2bc", text:"#684b00", border:"#c2a51d" },
  "Low":          { bg:"#d6efd2", text:"#1c4e16", border:"#589846" },
  "Low-Moderate": { bg:"#cee7f0", text:"#0e4656", border:"#3e86a6" },
};

const USE_STYLE = {
  "Food":       { bg:"#e8f2d8", text:"#31500e", border:"#7ba33e" },
  "Beverage":   { bg:"#dceef2", text:"#134a56", border:"#489aac" },
  "Dye":        { bg:"#f6e2ee", text:"#63114a", border:"#b0508f" },
  "Fiber":      { bg:"#eee7dc", text:"#4d3b23", border:"#a08155" },
  "Basketry":   { bg:"#f5e8d2", text:"#5c3d0d", border:"#b08334" },
  "Soap":       { bg:"#e2ecf7", text:"#1d3a5c", border:"#5e83b3" },
  "Tool":       { bg:"#e6e4e0", text:"#3b382f", border:"#8b8578" },
  "Ceremonial": { bg:"#efe7f3", text:"#43205c", border:"#8b62a8" },
};
const ALL_USES = Object.keys(USE_STYLE);

const SRC_LABEL = {
  T: "Tribe-attributed in standard literature",
  G: "General / multi-group, widely documented",
  V: "Commonly repeated, attribution not yet confirmed",
};

/* Does the dataset actually CONTAIN the things the legends and footnotes describe?
   Consumers may hand this component a filtered dataset — the public site withholds
   unpublished (estimated) ignitability and unverified cultural notes entirely — and
   a legend explaining a marker that never appears is worse than no legend: it tells
   the reader to look for something that is not there, and reads as an instruction to
   whoever maintains the data rather than as information for whoever is reading.

   Keying the notes on the data means the full internal view keeps them and any gated
   view drops them, with no second copy of the text to maintain. */
const HAS_ESTIMATES = PLANTS.some(p => p.ignSrc === "est");
const HAS_UNVERIFIED_CULTURE = PLANTS.some(p => p.cultureSrc === "V");

/* Wildlife tags, read out of the dataset rather than listed here.

   plants.json holds eighteen of them and they are long-tailed — 78 species
   carry Pollinators and one carries Monarchs. A hand-written list would drift
   the first time a species is added, and a checkbox that matches one plant is
   a filter that empties the page. So the vocabulary is derived, ordered by how
   many species carry it, and cut at a count that can still be planted from:
   below MIN_WORKABLE a tag cannot compose a palette on its own, which is the
   same threshold the site panel applies to its own result.

   The narrow tags are not lost — they still show on the cards and they are
   still searchable. They are just not offered as a filter that leads nowhere. */
const WILDLIFE_TAGS = (() => {
  const n = {};
  for (const p of PLANTS) for (const w of p.wildlife) n[w] = (n[w] || 0) + 1;
  return Object.entries(n)
    .filter(([, c]) => c >= SITE_RULES.minWorkable)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([w, c]) => ({ tag:w, count:c }));
})();

/* HIZ classification derived from ignitability score.
   A NULL rating means no rating is known, which is not the same as a bad one.
   Without the first branch, null falls past both comparisons and lands on
   "avoid" — turning missing data into a fabricated safety warning. Consumers
   that withhold unpublished estimates (the public site does) pass null here. */
function hiz(ign) {
  if (ign == null) return { key:"unrated", label:"Not established", short:"—", bg:"#e8e4da", text:"#5a5344", border:"#a89f8c" };
  if (ign >= 8)  return { key:"z12",   label:"HIZ 1–2 OK",     short:"1–2", bg:"#c6efbe", text:"#0c4806", border:"#46a82e" };
  if (ign >= 5)  return { key:"z3",    label:"HIZ 3 only",     short:"3",   bg:"#f5edbe", text:"#583e00", border:"#b6961e" };
  return              { key:"avoid", label:"Avoid near structures", short:"—", bg:"#f7d6c6", text:"#581606", border:"#c6461e" };
}

const ft = v => v < 1 ? `${Math.round(v * 12)}"` : `${v}′`;

/* ═══════════════════ SITE TUNING ═══════════════════
   Every constant below comes from SITE_RULES, generated out of
   scripts/packs/xeric.py. Nothing here restates a rule — if the aspect
   correction or a home ignition zone band changes, it changes there and this
   follows on the next render. */

/* `key` labels the button; `name` is for prose. "A N slope at gentle grade" is
   what happens when a button label is dropped into a sentence. */
const ASPECT_POINTS = [
  { key:"N",  deg:0,   name:"north"      }, { key:"NE", deg:45,  name:"north-east" },
  { key:"E",  deg:90,  name:"east"       }, { key:"SE", deg:135, name:"south-east" },
  { key:"S",  deg:180, name:"south"      }, { key:"SW", deg:225, name:"south-west" },
  { key:"W",  deg:270, name:"west"       }, { key:"NW", deg:315, name:"north-west" },
];

/* Slope bands a homeowner can judge by looking, mapped to the mid-point of each
   range. The aspect correction scales with slope and reaches full strength at
   SITE_RULES.fullAspectSlopePct, so a gentle grade moves the answer far less
   than a steep one. */
const SLOPE_BANDS = [
  { key:"flat",     label:"Flat",     hint:"barely reads as a slope", pct:1,  maxPct:5  },
  { key:"gentle",   label:"Gentle",   hint:"you notice it walking",   pct:10, maxPct:16 },
  { key:"moderate", label:"Moderate", hint:"hard to mow across",      pct:22, maxPct:30 },
  { key:"steep",    label:"Steep",    hint:"you scramble",            pct:38, maxPct:Infinity },
];

/* Slope is held as a PERCENT rather than a band key, so a measured 8.8% stays
   8.8% instead of being rounded to the nearest homeowner-judgeable band and
   losing precision the aspect correction actually uses. The bands remain the
   manual control and light up whichever one contains the current value. */
const bandForPct = pct =>
  SLOPE_BANDS.find(b => pct < b.maxPct) || SLOPE_BANDS[SLOPE_BANDS.length - 1];

/* Which compass button to light for a continuous bearing. Display only — the
   offset curve is evaluated on the real bearing, never on the snapped one. */
const nearestAspectPoint = deg =>
  deg == null ? null
    : ASPECT_POINTS[Math.round(((deg % 360) + 360) % 360 / 45) % 8];

/* Short form for the facts table, spelled out for a sentence. */
const compassKey = deg => {
  const p = nearestAspectPoint(deg);
  return p ? p.key : "—";
};
const compassName = deg => {
  const p = nearestAspectPoint(deg);
  return p ? p.name : "flat or unknown";
};

/* offset(θ) = north·cos θ + east·sin θ — the same smooth curve the reports use,
   so a bearing near a compass boundary cannot swing the answer by 1,900 ft the
   way a bucketed lookup did. */
function aspectOffsetFt(deg) {
  if (deg == null) return 0;
  const t = (deg % 360) * Math.PI / 180;
  return SITE_RULES.aspectOffsetFt.north * Math.cos(t)
       + SITE_RULES.aspectOffsetFt.east  * Math.sin(t);
}

function effectiveElevation(elevFt, aspectDeg, slopePct) {
  if (!elevFt) return null;
  if (aspectDeg == null || slopePct < SITE_RULES.minAspectSlopePct) {
    return { ft: Math.round(elevFt), offset: 0, flat: true };
  }
  const strength = Math.min(1, slopePct / SITE_RULES.fullAspectSlopePct);
  const offset = aspectOffsetFt(aspectDeg) * strength;
  return { ft: Math.round(elevFt + offset), offset: Math.round(offset), flat: false };
}

/* Which zone a distance from the house falls in, and the ignitability floor
   that band imposes. */
const zoneForDistance = ftFromHouse =>
  SITE_RULES.zones.find(z => ftFromHouse >= z.fromFt && ftFromHouse < z.toFt)
  || SITE_RULES.zones[SITE_RULES.zones.length - 1];

/* THE ESTIMATE GATE, same rule as the reports and the species pages.
   An inferred rating does not place a plant in a band with a fire floor: of the
   twenty such estimates checked against a published source, every one came back
   lower and seventeen of seventeen lost this clearance. A band with no floor
   makes no claim, so nothing is withheld from it. */
const hasPublishedIgn = p => SITE_RULES.publishedIgnSources.includes(p.ignSrc);

function clearsFloor(p, minIgn) {
  if (minIgn == null) return true;
  if (!hasPublishedIgn(p)) return false;
  return p.ign >= minIgn;
}

/* ═══════════════════ MEASURING A SITE FROM AN ADDRESS ═══════════════════

   The panel used to ask three questions. It now measures two of them.

   WHAT THIS IS
   Elevation, slope and aspect for a street address, read from the same USGS
   3DEP ImageServer that scripts/sitecore/sources/elevation.py reads, over the
   same analysis radius (SITE_RULES.analysisRadiusM), at the same 128-cell grid.
   Checked against three built site profiles it returns the same numbers:

     vail-north    elev 8287.9 ft (8287.9)  aspect 23.6° (23.8)  coh 0.85 (0.85)  slope 37.4% (37.4)
     vail-test     elev 8183.9 ft (8183.9)  aspect 202.1° (203.1) coh 0.52 (0.52)  slope 10.0% (10.0)
     grenada-glen  elev 7941.9 ft (7941.9)  aspect 276.9° (278.0) coh 0.87 (0.87)  slope 25.4% (25.4)

   That agreement is the requirement, not a nicety. A visitor who runs this and
   then commissions an analysis must not be shown two different accounts of
   their own hillside, so this measures what the pipeline measures or it has no
   business reporting a number at all.

   WHY THE GEOCODE GOES THROUGH THIS ORIGIN
   The Census geocoder sends no Access-Control-Allow-Origin, so a browser cannot
   read it. /api/site-lookup forwards. Everything after the geocode is fetched
   straight from USGS — which is given COORDINATES ONLY. The visitor's typed
   address never reaches a third party.

   WHY NOT ONE POINT SAMPLE, WHICH WOULD BE ONE CALL AND NO ARITHMETIC
   Because it is wrong. `identify` with the Aspect Degrees rule at
   5027 Main Gore Dr N returns 237° — south-west — for ground whose 120 m
   average faces 302°, north-west. A 65° error on the input that moves effective
   elevation by up to 3,000 ft, produced by a single 1 m cell sitting on a
   driveway berm. The area histogram is the entire point.

   WHY A HISTOGRAM RATHER THAN THE RASTER
   `computeHistograms` returns the distribution over an envelope as JSON, in one
   request, with CORS. The Python reads a float TIFF and averages the cells;
   this reads the same cells already binned. No TIFF parser in the browser.

   WHAT IT DELIBERATELY DOES NOT DO
   No soil, no snowpack, no skyline, no surface model — and therefore no sun
   hours. The skyline needs a directional scan over a 3 km DEM, which is a
   raster read and not a histogram, so light is not measured here and nothing
   is filtered on it. A site analysis does that. This does not pretend to. */

const M_PER_FT = 0.3048;
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
   sequence is felt. */
async function measureTerrain(lat, lon) {
  /* One controller for all three requests. They are a single measurement — two
     of three numbers is not a site — so they succeed or are called off together,
     and an abandoned tab does not leave three sockets open against USGS. */
  const ctl = new AbortController();
  const deadline = Date.now() + LOOKUP_BUDGET_MS;
  const timer = setTimeout(() => ctl.abort(), LOOKUP_BUDGET_MS);
  try {
    return await measureWith(lat, lon, ctl.signal, deadline);
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

async function measureWith(lat, lon, signal, deadline) {
  const radiusM = SITE_RULES.analysisRadiusM;
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

/* ═══════════════════ THE PIN ═══════════════════

   WHY A MAP EARNS ITS PLACE HERE, when almost nothing else on this page does.

   A Census geocode is a position interpolated along a street centreline. At
   5027 Main Gore Dr N that segment carries house numbers 4901-5029, so the
   returned point is a guess good to a few hundred metres — and it lands on the
   ROAD. Measured there the aspect comes back at coherence 0.38, below
   SITE_RULES.aspectCoherence.incoherent, so the panel refuses to apply any
   aspect correction at all. The visitor gets nothing.

   Moving the analysis point onto actual ground fixes that. Measured at the same
   address, offsetting the centre and re-reading 3DEP:

     geocoded road point   302°  coherence 0.38   refused
     75 m east             276°  coherence 0.50   applied
     75 m north            278°  coherence 0.45   applied
     150 m north           266°  coherence 0.51   applied
     150 m south           345°  coherence 0.51   applied

   Five of six cross the gate. So the pin converts "no usable aspect" into a
   usable one, which is the whole reason it exists.

   AND IT IS A HIGH-LEVERAGE CONTROL, which the panel must not hide. Aspect
   across those positions spans 266° to 345°, and through the offset curve that
   is 695 ft of effective elevation across 300 m of pin movement. Today the
   geocode error is invisible and the system defends itself by refusing; a pin
   hands that responsibility to the visitor. They know which ground they are
   planting, which is exactly why they should hold it — but the consequence has
   to be on screen, not implied.

   WHAT DOES NOT WORK: SHRINKING THE RADIUS.
   `sources/elevation.py` advises narrowing `--radius` toward the planting area
   when coherence is low. At this site that made it worse — 0.24 at 30 m, 0.31
   at 60 m, against 0.38 at 120 m — because a tight radius around a road point
   just resolves cut-and-fill benching. Moving the centre is the lever. Do not
   add a radius control instead of this.

   NO MAPPING LIBRARY. Both services take a bbox and return a PNG, which is a
   static-map API: one request per view rather than a grid of tiles, no Leaflet
   or MapLibre in the bundle, and `img-src` naming two hosts instead of a CDN.
   Both are keyless, CORS-open and federal — the same trust boundary the terrain
   read already crosses. */

/* NAIP Plus, not the National Map's basemap tile cache.

   `basemap.nationalmap.gov/USGSImageryOnly` accepts any request size and serves
   a coarser cache level behind it. Measured over the Vail test address, halving
   its 512 px output lost only 1.90/255 of information — it was a 256 px image
   upscaled — and a 2048 px request differed from an upscaled 512 by 2.16/255,
   under one percent. More pixels bought nothing; the ceiling was the source.

   NAIP Plus is an ImageServer over 60 cm orthoimagery (2019 over Eagle County),
   and the same test gives 3.07/255 — roughly twice the real detail, and the
   difference between a green smear and a legible driveway at the zoom where
   someone is trying to place a pin.

   `USGSNAIPPlus` rather than `USGSNAIPImagery`: it adds High Resolution
   Orthoimagery where that exists. Over Vail the two return byte-for-byte the
   same image, so the wider one costs nothing and is better elsewhere in the
   state.

   NOT Esri World Imagery, which is sharper still at ~30 cm. Its copyright names
   Esri and Vantor, anonymous access to services.arcgisonline.com is not licensed
   for a commercial site, and `World_Imagery` is a cached tile service whose
   export endpoint 500s — so it would also mean a grid of z/y/x tiles instead of
   one image per view. `ingest.py` refuses CC-BY-NC photographs on exactly this
   reasoning; imagery is not a special case. */
/* WHICH UPSTREAM EACH LAYER MEANS NOW LIVES IN worker/map-tile.js, along with
   the JPEG decision for both (measured at 1024: aerial 199 KB as JPEG against
   935 KB as PNG; hillshade 72 KB against 367 KB — a hillshade carries per-cell
   DEM noise that is photographic in character however grey it looks). The
   browser addresses `/api/map-tile` and names a layer; it no longer holds a
   service URL, because the tile cache is what makes the map usable and the
   cache lives at the edge. What is left here is what the visitor sees. */
const MAP_LAYERS = {
  aerial: {
    label: "Aerial",
    hint: "find your roof",
    credit: "USGS NAIP orthoimagery",
  },
  hillshade: {
    label: "Landform",
    hint: "see which way it falls",
    credit: "USGS 3DEP hillshade",
  },
};

/* ═══════════════════ THE MAP IS A TILE GRID ═══════════════════

   IT WAS NOT, AND THAT WAS THE BUG. The map used to be one `exportImage`
   request per view, with a bbox built from wherever the drag happened to stop.
   Measured against USGSNAIPPlus over the Vail test address:

     new bbox, 500 m span   17.7 s        new bbox, 250 m span   21.6 s
     new bbox, 120 m span   15.5 s        the SAME url again      0.14 s

   and the response carries `x-cache: Hit from cloudfront`, `max-age=43200`.
   The imagery was never slow. USGS renders on demand behind a twelve-hour CDN,
   and every pan minted a URL nobody had ever requested — a guaranteed miss,
   then fifteen to twenty-two seconds of the stage's beige background. Panning
   to an arbitrary float centre cannot hit a cache, ever, by construction.

   So the view is quantised onto the standard Web Mercator tile grid. Integer
   z/x/y, the same ground always producing the same URL. Three consequences,
   and all three are the point:

     - the edge cache can hit, so a revisit is 0.14 s rather than 17 s;
     - a pan reuses the <img> elements already decoded, keyed by z/x/y, so
       moving half a tile costs NO network at all;
     - tiles carry one tile of margin beyond the stage, so the common small
       pan is already on screen before the finger moves.

   Tiles are fetched through `/api/map-tile` rather than from USGS directly.
   See worker/map-tile.js: it holds the render at our own edge for a week
   instead of USGS's twelve hours, and it lets the address lookup pre-warm the
   first nine tiles while the visitor is still reading their elevation — which
   is the only thing that hides a cold render, because nothing makes one fast. */

/* One tile is 1024 px and the stage shows exactly one tile of ground.

   1024 rather than 256: this is not a real tile pyramid. Every tile is an
   on-demand render, so the cost is a render and not a byte count — sixteen
   256 px tiles cost sixteen renders where one 1024 costs one. And it lands the
   resolution where the source is: at z16 a tile spans 471 m, or 0.46 m/px,
   which is the native resolution of the 60 cm NAIP underneath. The stage
   renders about 523 CSS px on desktop, so a 1024 px tile is a clean 2x on the
   retina displays this is mostly read on. */
const MAP_PX = 1024;

/* Standard Web Mercator zoom levels, not metre spans.

   The old MAP_SPANS were [1600, 800, 500, 250, 120, 60] and arbitrary. These
   are the levels the world grid actually has, which is what makes quantisation
   exact: a level is a power-of-two subdivision, so a tile boundary is an
   integer and never drifts. Ground span per tile, at Colorado's latitude:

     z14 1885 m   z15 942 m   z16 471 m   z17 235 m
     z18 118 m    z19  59 m   z20  29 m

   z16 is the default because it is what the old 500 m default was chosen to
   be — wide enough to contain a geocode that missed by a couple of hundred
   metres, tight enough that a house is a recognisable shape. NAIP is 60 cm, so
   z19 is the last level with real detail behind it; z20 is offered anyway
   because placing a pin precisely is worth an oversampled pixel. */
const MAP_Z_MIN = 14;
const MAP_Z_MAX = 20;
const MAP_Z_DEFAULT = 16;

const MERC = 20037508.342789244;

/* Mercator metres per tile at a zoom. Mercator, not ground — the grid is
   defined in projected metres, and the 1/cos(latitude) inflation is a property
   of where you then look at it, not of the grid. */
const mercTile = z => (MERC * 2) / 2 ** z;

/* Ground metres across the stage, for the caption. THIS is where the ~1.30
   inflation at 39.6°N gets divided back out; quoting the mercator figure would
   overstate the visible ground by thirty percent. */
const groundSpanM = view => mercTile(view.z) * Math.cos((view.lat * Math.PI) / 180);

function from3857(x, y) {
  const lon = x / (20037508.34 / 180);
  const yd = y / (20037508.34 / 180);
  const lat = (Math.atan(Math.exp((yd * Math.PI) / 180)) * 360) / Math.PI - 90;
  return [lat, lon];
}

/* The stage's own bbox in mercator metres: one tile wide, centred on the view.
   Square, so the pixel-to-metre conversion stays uniform however CSS sizes it —
   which is what lets a click be read against the element's bounding box. */
function mapBbox(view) {
  const [cx, cy] = to3857(view.lon, view.lat);
  const s = mercTile(view.z);
  return { xmin: cx - s / 2, ymin: cy - s / 2, xmax: cx + s / 2, ymax: cy + s / 2, s };
}

/* Which tiles cover the stage, optionally with a ring of margin around them.

   TWO CALLS, IN THIS ORDER, AND THE ORDER IS THE WHOLE POINT.

   The stage is one tile wide but sits at an arbitrary offset, so it straddles
   two tiles per axis: four tiles are visible. Ringed by a margin that is four
   per axis, or SIXTEEN — and at 187 KB a tile that is three megabytes and
   sixteen cold renders before anything appears, which would have traded one
   long wait for a longer one.

   So `margin: 0` is what renders first, and the ring follows once those four
   have decoded. The visible tiles get the browser's six connections to
   themselves instead of queueing behind twelve they do not need yet, and the
   margin — which is what makes the NEXT pan instant — arrives during the
   seconds the visitor spends looking at what just loaded.

   Returned with fractional offsets rather than pixels, so the stage can be any
   size CSS gives it. A tile is exactly one stage wide by construction. */
function mapTiles(view, margin = 0) {
  const b = mapBbox(view);
  const s = b.s;
  const tx0 = Math.floor((b.xmin + MERC) / s) - margin;
  const tx1 = Math.floor((b.xmax + MERC) / s) + margin;
  const ty0 = Math.floor((MERC - b.ymax) / s) - margin;
  const ty1 = Math.floor((MERC - b.ymin) / s) + margin;
  const n = 2 ** view.z;
  const out = [];
  for (let y = ty0; y <= ty1; y++) {
    for (let x = tx0; x <= tx1; x++) {
      if (x < 0 || y < 0 || x >= n || y >= n) continue;
      out.push({
        z: view.z, x, y,
        key: `${view.z}/${x}/${y}`,
        left: (-MERC + x * s - b.xmin) / s,
        top:  (b.ymax - (MERC - y * s)) / s,
      });
    }
  }
  return out;
}

/* Where a tile from ANOTHER zoom sits in the current view, as fractions of the
   stage. This is what keeps the previous level on screen while a new one loads:
   on a zoom the old tiles are still perfectly good imagery of the same ground,
   just at the wrong scale, so they are re-projected into the new geometry and
   left underneath until the replacements arrive. The stage never goes beige. */
function ghostPlacement(view, tile) {
  const b = mapBbox(view);
  const s = mercTile(tile.z);
  return {
    left: (-MERC + tile.x * s - b.xmin) / b.s,
    top:  (b.ymax - (MERC - tile.y * s)) / b.s,
    size: s / b.s,
  };
}

const mapTileUrl = (tile, layerKey) =>
  `/api/map-tile?z=${tile.z}&x=${tile.x}&y=${tile.y}&layer=${layerKey}`;

/* A click at (fx, fy) as a fraction of the stage -> coordinates. */
function mapPointAt(view, fx, fy) {
  const b = mapBbox(view);
  return from3857(b.xmin + fx * (b.xmax - b.xmin), b.ymax - fy * (b.ymax - b.ymin));
}

/* Where a coordinate sits within the current view, as fractions. Off-view
   values fall outside 0..1 and the caller hides the marker. */
function mapFractionOf(view, lat, lon) {
  const b = mapBbox(view);
  const [x, y] = to3857(lon, lat);
  return [(x - b.xmin) / (b.xmax - b.xmin), (b.ymax - y) / (b.ymax - b.ymin)];
}

/* Recentre so that the ground currently under (fx, fy) stays under it after a
   zoom. Without this, zooming toward a house walks it off screen and the
   visitor re-pans after every step — which is most of what made the old map
   feel like fighting it. Used by the wheel, the buttons and double-tap. */
function zoomAbout(view, dz, fx = 0.5, fy = 0.5) {
  const z = Math.max(MAP_Z_MIN, Math.min(MAP_Z_MAX, view.z + dz));
  if (z === view.z) return view;
  const [lat, lon] = mapPointAt(view, fx, fy);   // the ground under the cursor
  const [ax, ay] = to3857(lon, lat);
  const s = mercTile(z);
  // Put that same ground back at the same fraction of the new, resized stage.
  const cx = ax - (fx - 0.5) * s;
  const cy = ay + (fy - 0.5) * s;
  const [nlat, nlon] = from3857(cx, cy);
  return { ...view, z, lat: nlat, lon: nlon };
}


/* Distance in FEET between two coordinates.
   Equirectangular, not haversine: over the few hundred feet that separate a
   house from its own planting beds the difference is millimetres, and the
   defensible-space bands are 5, 30 and 100 ft. Precision beyond the band edge
   would be decoration. */
function feetBetween(a, b) {
  const mLat = (b.lat - a.lat) * 111320;
  const mLon = (b.lon - a.lon) * 111320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(mLat, mLon) / M_PER_FT;
}

/* ═══════════════ THE HOUSE IS A SHAPE, NOT A POINT ═══════════════

   A single ⌂ pin answers "how far from the house?" with the distance to
   whatever spot on the roof someone happened to tap, and that is wrong by the
   width of the house. Measured against the real footprints of the ten
   structures nearest the Vail test address, the distance from roof centre to
   the actual wall runs:

     5040 Main Gore Pl   570 m²    24–72 ft        4957 Juniper Ln  444 m²   9–54 ft
     5026 Main Gore Dr N 233 m²    16–39 ft        5125 Black Bear  130 m²  13–27 ft

   Two things follow, and both matter more than the raw error. The spread is
   ANISOTROPIC — it depends entirely on which side of the house you are
   standing — so it cannot be corrected with a constant. And SITE_RULES.zones
   are 0–5, 5–30 and 30–100 ft, so HIZ 0 is smaller than the error bar: a point
   pin cannot resolve it at all, and every house in that sample straddles the
   30 ft boundary between HIZ 1–2 and HIZ 3. The pin was not imprecise, it was
   measuring the wrong thing.

   So `pins.house` carries a RING where one is available, and the distance is
   measured to the nearest edge. Three shapes of answer, in descending order of
   what they know:

     footprint  a polygon from USA Structures, tapped
     traced     a polygon the visitor drew
     point      the old single pin, kept because coverage has holes

   HOW GOOD IS THE FOOTPRINT? It is a ROOFLINE, not a foundation. ORNL extracts
   these with a CNN over Maxar and NAIP imagery, so what it traces is the eave
   line — call it one to three feet outside the foundation wall, more on the
   deep overhangs mountain architecture likes. That is the CONSERVATIVE
   direction for defensible space, and it is arguably the more correct envelope
   anyway: HIZ 0 is a rule about what sits under the eaves. It is stated on
   screen rather than presented as survey precision. */

/* Distance in FEET from a point to a line segment, in local flat coordinates.
   Longitude is scaled by cos(latitude) first so a degree east and a degree
   north are the same size before any of the geometry runs; without that the
   projection of the point onto the segment lands in the wrong place, and the
   error grows with how east-west the wall runs. */
function feetToSegment(p, a, b, lat0) {
  const k = Math.cos((lat0 * Math.PI) / 180);
  const px = p.lon * k, py = p.lat;
  const ax = a[0] * k,  ay = a[1];
  const bx = b[0] * k,  by = b[1];
  const dx = bx - ax,   dy = by - ay;
  const t = dx === 0 && dy === 0
    ? 0
    : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) * 111320 / M_PER_FT;
}

/* Ray casting. A planting area INSIDE the footprint is a courtyard, a light
   well, or — much more likely — a mis-tap, and either way the honest distance
   is zero rather than the distance to the nearest wall from the inside. */
function ringContains(ring, lat, lon) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/* The one distance the panel actually uses. Returns null when there is nothing
   to measure to, so every caller keeps the "still a question" branch that the
   manual distance buttons live in. */
function feetToHouse(house, plant) {
  if (!house || !plant) return null;
  if (house.kind === "point") return feetBetween(house, plant);
  const ring = house.ring;
  if (!ring || ring.length < 3) return null;
  if (ringContains(ring, plant.lat, plant.lon)) return 0;
  const lat0 = ring.reduce((t, p) => t + p[1], 0) / ring.length;
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const d = feetToSegment(plant, ring[i], ring[(i + 1) % ring.length], lat0);
    if (d < best) best = d;
  }
  return best;
}

/* A representative point for a house, for the "has the pin moved?" check and
   for drawing the ⌂ glyph. The centroid of the ring, which is the one thing a
   point is still good for. */
function houseAnchor(house) {
  if (!house) return null;
  if (house.kind === "point") return { lat: house.lat, lon: house.lon };
  const r = house.ring;
  if (!r || !r.length) return null;
  return {
    lat: r.reduce((t, p) => t + p[1], 0) / r.length,
    lon: r.reduce((t, p) => t + p[0], 0) / r.length,
  };
}

/* ── building footprints ──
   FEMA/ORNL USA Structures, queried straight from the browser: it answers in
   about 0.2 s, it sends `access-control-allow-origin: *`, and it is the same
   federal trust boundary the terrain read already crosses. No key, no proxy.

   LICENCE: CC BY 4.0. Attribution is required and it is rendered under the map.
   Worth being exact about, because `ingest.py` refuses CC-BY-NC photographs and
   this is the neighbouring case: BY without NC is fine for a commercial site,
   NC would not have been.

   WHY THE VISITOR TAPS INSTEAD OF THE CODE MATCHING THE ADDRESS. The obvious
   shortcut is to pick the building whose PROP_ADDR matches the geocode. At the
   test address the geocode says 5027 MAIN GORE DR N and the three nearest
   structures are all tagged 5027 MAIN GORE PLACE — a different street — at 77,
   211 and 88 m². That is a house, a garage and a shed, and string matching
   picks one of them at random. Tapping resolves the street disagreement and the
   which-outbuilding question in the same gesture, and it is one tap. */
const FOOTPRINTS =
  "https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/" +
  "USA_Structures_View/FeatureServer/0/query";

/* Below this the stage covers enough ground to return hundreds of buildings,
   none of them big enough to tap. The overlay simply does not appear, and the
   hint tells the visitor to zoom rather than leaving them tapping at nothing. */
const FOOTPRINT_MIN_Z = 16;

async function fetchFootprints(view, signal) {
  const b = mapBbox(view);
  /* Queried in 3857 and returned in 3857 — the same projection the tiles are
     drawn in. Asking for 4326 back would mean reprojecting every vertex in the
     browser to place it, which is arithmetic that can only introduce error
     between a polygon and the imagery it has to sit on top of. */
  const q = new URLSearchParams({
    geometry: `${b.xmin},${b.ymin},${b.xmax},${b.ymax}`,
    geometryType: "esriGeometryEnvelope",
    inSR: "3857",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "PROP_ADDR,OCC_CLS,SQMETERS",
    returnGeometry: "true",
    outSR: "4326",
    f: "json",
  });
  const r = await fetch(`${FOOTPRINTS}?${q}`, { signal });
  if (!r.ok) throw new Error(`footprints ${r.status}`);
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || "footprint query failed");
  return (d.features || []).map((f, i) => ({
    id: `${f.attributes.PROP_ADDR || "?"}-${i}-${Math.round(f.attributes.SQMETERS || 0)}`,
    ring: (f.geometry.rings || [[]])[0],
    addr: f.attributes.PROP_ADDR || null,
    occ: f.attributes.OCC_CLS || null,
    sqm: f.attributes.SQMETERS || null,
  })).filter(f => f.ring.length >= 3);
}

/* ═══════════════════════ SMALL PARTS ═══════════════════════ */
const Chip = ({ label, s, title }) => (
  <span title={title} style={{
    display:"inline-block", padding:"2px 7px", borderRadius:3, fontSize:11, fontWeight:600,
    background:s.bg || s.badge, color:s.text, border:`1px solid ${s.border || s.bar}`, lineHeight:1.6,
  }}>{label}</span>
);

const IgnDot = ({ ign, src }) => {
  const h = hiz(ign);
  const unrated = h.key === "unrated";
  const title = unrated
    ? "No published ignitability rating for this species — treat as unrated and confirm placement with your local fire authority"
    : `Ignitability ${ign}/10 (${src === "CSU" ? "CSU FS 6.305" : src === "IDFW" ? "Idaho Firewise master database" : "estimated"}) — higher is less ignitable`;
  return (
    <span title={title} style={{ display:"inline-flex", alignItems:"center", gap:5 }}>
      <span style={{
        width:22, height:22, borderRadius:"50%", background:h.bg,
        border:`1.5px ${unrated ? "dashed" : "solid"} ${h.border}`,
        color:h.text, fontSize:10, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center",
        fontVariantNumeric:"tabular-nums",
      }}>{unrated ? "—" : ign}</span>
      <span style={{ fontSize:10, color:h.text, fontWeight:600 }}>
        {unrated ? "unrated" : h.key === "avoid" ? "avoid" : `HIZ ${h.short}`}
        {!unrated && src === "est" && <span style={{opacity:0.5}}>*</span>}
      </span>
    </span>
  );
};

const SortArrow = ({ active, dir }) =>
  active ? <span style={{marginLeft:4}}>{dir === "asc" ? "↑" : "↓"}</span>
         : <span style={{marginLeft:4, opacity:0.22}}>↕</span>;

/* ═══════════════════════ MAIN APP ═══════════════════════ */
export default function XericPlantDB() {
  const [search, setSearch]       = useState("");
  const [typeF, setTypeF]         = useState([]);
  const [waterF, setWaterF]       = useState([]);
  const [hizF, setHizF]           = useState([]);
  const [zoneF, setZoneF]         = useState(0);
  const [elevF, setElevF]         = useState(0);
  const [nativeOnly, setNative]   = useState(false);
  const [deerOnly, setDeer]       = useState(false);
  const [psOnly, setPs]           = useState(false);
  const [useF, setUseF]           = useState([]);
  const [wildlifeF, setWildlifeF] = useState([]);
  const [edibleOnly, setEdible]   = useState(false);
  // Starts collapsed: this only has an effect below 861px, where an expanded filter
  // panel would push the results off the first screen. Desktop ignores it.
  const [filtersOpen, setFiltersOpen] = useState(false);

  /* Site tuning. Held separately from the filter state so that clearing filters
     does not silently discard the site, and so the panel can explain what it is
     doing rather than just moving sliders on the user's behalf. */
  const [siteOn, setSiteOn]       = useState(false);
  const [siteElev, setSiteElev]   = useState(8000);
  const [siteAspect, setSiteAspect] = useState(null);   // degrees, or null = flat/unknown
  const [siteSlopePct, setSiteSlopePct] = useState(10); // percent, not a band key
  const [siteDist, setSiteDist]   = useState(15);

  /* The address lookup. Held apart from the three tuning values it fills in,
     because they are not the same thing: the measurement is a claim about the
     ground with a provenance and a confidence, while siteElev/siteAspect/
     siteSlopePct are simply what the list is currently tuned to. Keeping them
     separate is what lets the panel say "we measured 302° but you have
     overridden it to north" instead of quietly forgetting one of the two. */
  const [siteAddr, setSiteAddr]   = useState("");
  const [lookup, setLookup]       = useState({ status:"idle" });
  const [manualOpen, setManualOpen] = useState(false);

  /* ── the pin ──
     `pins.plant` is what gets measured; `pins.house` is optional and exists
     only to compute the defensible-space distance instead of asking for it.
     One pin is the common case and has to work alone, so the house pin is
     added deliberately rather than demanded up front.

     `measuredAt` records the coordinates the current reading came from. Without
     it, moving the pin would silently leave numbers on screen that describe
     somewhere else — the panel compares the two and says so. */
  const [mapView, setMapView]     = useState(null);   // {lat, lon, z}
  const [mapLayer, setMapLayer]   = useState("aerial");
  const [pins, setPins]           = useState({ plant:null, house:null });
  const [pinMode, setPinMode]     = useState("plant");
  const [useHousePin, setUseHousePin] = useState(false);

  /* How the house gets marked. "tap" is the good path — one tap on the real
     footprint. "trace" is for the house the dataset does not have, and "point"
     is the old single pin, kept because it is the only one that always works.
     See feetToHouse: the mode decides what `pins.house` holds. */
  const [houseMode, setHouseMode] = useState("tap");
  const [footprints, setFootprints] = useState({ status:"idle", list:[] });
  const [trace, setTrace]         = useState([]);   // ring under construction

  /* The tile layer, not the image. Pans translate this element and commit one
     state update on release — updating state per pointermove would re-render
     the whole component, 104 plant cards included, on every frame of a drag. */
  const mapLayerRef = useRef(null);
  const stageRef    = useRef(null);
  const dragRef     = useRef(null);
  const pinchRef    = useRef(null);
  const tapRef      = useRef(null);

  /* The previous zoom's tiles, kept on screen and rescaled until the new level
     has loaded. This is what replaced the beige square. */
  const [ghost, setGhost] = useState(null);
  const [loaded, setLoaded] = useState({});
  const [view, setView]           = useState("cards");
  const [sortBy, setSortBy]       = useState("common");
  const [sortDir, setSortDir]     = useState("asc");
  const [open, setOpen]           = useState(null);

  const toggle = (arr, set, v) => set(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);

  const clearAll = () => {
    setSearch(""); setTypeF([]); setWaterF([]); setHizF([]);
    setZoneF(0); setElevF(0); setNative(false); setDeer(false); setPs(false);
    setUseF([]); setWildlifeF([]); setEdible(false);
  };

  const nActive = typeF.length + waterF.length + hizF.length +
    (zoneF ? 1 : 0) + (elevF ? 1 : 0) + (nativeOnly ? 1 : 0) + (deerOnly ? 1 : 0) + (psOnly ? 1 : 0) +
    useF.length + wildlifeF.length + (edibleOnly ? 1 : 0) + (search ? 1 : 0);

  const effElev = effectiveElevation(siteElev, siteAspect, siteSlopePct);

  /* With both pins down the distance is measured rather than chosen, and the
     buttons stop being the source of truth. With one pin it is still a question
     no public dataset can answer, so the buttons remain. */
  const pinDistFt = useHousePin ? feetToHouse(pins.house, pins.plant) : null;
  const effDistFt = pinDistFt == null ? siteDist : pinDistFt;
  const siteZone = zoneForDistance(effDistFt);

  const plants = useMemo(() => {
    const q = search.toLowerCase().trim();
    return PLANTS.filter(p => {
      if (q) {
        const hay = `${p.common} ${p.sci} ${p.syn} ${p.family} ${p.culture || ""} ${p.useTags.join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (typeF.length  && !typeF.includes(p.type))   return false;
      if (waterF.length && !waterF.includes(p.water)) return false;
      if (hizF.length   && !hizF.includes(hiz(p.ign).key)) return false;
      if (zoneF && p.zoneMin > zoneF) return false;
      if (elevF && (p.elevMin > elevF || p.elevMax < elevF)) return false;
      /* Site tuning filters on EFFECTIVE elevation and the band's fire floor.
         It runs alongside the manual filters rather than replacing them, so a
         visitor can narrow further without the panel fighting them. */
      if (siteOn && effElev) {
        if (p.elevMin > effElev.ft || p.elevMax < effElev.ft) return false;
        if (!clearsFloor(p, siteZone.minIgn)) return false;
      }
      if (nativeOnly && !p.native) return false;
      if (deerOnly && p.deer !== "Resistant") return false;
      if (psOnly && !p.ps) return false;
      if (edibleOnly && !p.edible) return false;
      if (useF.length && !useF.some(u => p.useTags.includes(u))) return false;
      if (wildlifeF.length && !wildlifeF.some(w => p.wildlife.includes(w))) return false;
      return true;
    }).sort((a, b) => {
      const k = { common:"common", sci:"sci", type:"type", zone:"zoneMin", ign:"ign", height:"htMax", elev:"elevMax" }[sortBy] || "common";
      const av = a[k], bv = b[k];
      if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      // Unrated species have a null value. Subtracting yields NaN, which leaves
      // the comparator inconsistent and the order arbitrary — so park nulls at
      // the end in both directions instead of letting them scatter.
      if (av == null || bv == null) {
        if (av == null && bv == null) return 0;
        return av == null ? 1 : -1;
      }
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [search, typeF, waterF, hizF, zoneF, elevF, nativeOnly, deerOnly, psOnly, useF, wildlifeF,
      edibleOnly, sortBy, sortDir, siteOn, siteElev, siteAspect, siteSlopePct, effDistFt]);

  /* Species the band would take but for an unpublished rating. Shown as a count,
     never as a list of names to plant — the whole point is that they are not
     cleared. */
  const heldCount = useMemo(() => {
    if (!siteOn || !effElev || siteZone.minIgn == null) return 0;
    return PLANTS.filter(p =>
      !hasPublishedIgn(p) && p.ign >= siteZone.minIgn &&
      p.elevMin <= effElev.ft && p.elevMax >= effElev.ft).length;
  }, [siteOn, siteElev, siteAspect, siteSlopePct, effDistFt]);

  const doSort = c => { if (sortBy === c) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortBy(c); setSortDir("asc"); } };

  const exportCSV = () => {
    const cols = ["sci","syn","common","family","type","water","pf","zoneMin","zoneMax","ign","ignSrc","elevMin","elevMax","htMin","htMax","spMin","spMax","sun","soil","bloom","deer","native","ps","ediblePart","ediblePrep","caution","useTags","culture","cultureSrc","notes"];
    const esc = v => `"${String(v).replace(/"/g, '""')}"`;
    const val = (p, c) =>
      c === "ediblePart" ? (p.edible?.part ?? "") :
      c === "ediblePrep" ? (p.edible?.prep ?? "") :
      c === "useTags"    ? p.useTags.join("; ") :
      (p[c] ?? "");
    const rows = [cols.join(","), ...plants.map(p => cols.map(c => esc(val(p, c))).join(","))];
    const url = URL.createObjectURL(new Blob([rows.join("\n")], { type:"text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = "xeric-plants-imw.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const secLabel = { fontSize:10.5, fontWeight:700, color:C.muted, letterSpacing:"0.07em", textTransform:"uppercase", marginBottom:7 };
  const selStyle = { width:"100%", padding:"6px 8px", border:`1px solid ${C.border}`, borderRadius:4, fontSize:12, background:"#fff", color:C.text, fontFamily:"inherit" };
  const cbRow = { display:"flex", alignItems:"center", gap:7, marginBottom:5, cursor:"pointer" };

  /* ── Sidebar ── */
  // Collapsible on narrow screens. This deliberately does NOT use <details>: browsers
  // hide closed <details> content via content-visibility on ::details-content, not via
  // display, so a `display:block !important` rule to force it open on desktop has no
  // effect and the panel stays invisible at every width.
  //
  // Instead the panel is always in the DOM and a class toggles it. CSS decides whether
  // that class means anything: below 861px it hides, at wider widths it is ignored, so
  // desktop always shows the filters no matter what the toggle last did on mobile.
  /* ═══════════════════ SITE PANEL ═══════════════════
     An address, measured. 3DEP gives elevation, slope and aspect over the same
     120 m radius a site profile uses, and those three become the same effective
     elevation and fire band the full analysis computes.

     THE MEASUREMENT DOES NOT ALWAYS GET TO WIN.
     Aspect is the input that moves effective elevation by up to 3,000 ft, and
     on dissected mountain ground a single mean bearing frequently describes no
     part of the property — the coherence number says when. Below
     SITE_RULES.aspectCoherence.incoherent the panel reports the reading and
     refuses to tune on it, because a confident wrong aspect is worse than the
     slider it replaced. Every value stays editable underneath for the same
     reason: the geocode is a point on a road, not the house.

     It is still a first pass, and it still says so. What changed is which part
     is guessed — the ground is now measured, and the distance from the house,
     which no public dataset knows, is the one thing left to answer. */
  const measured = lookup.status === "ok" ? lookup.data : null;
  const coh = measured && measured.aspectCoherence;
  const aspectTrusted =
    coh != null && coh >= SITE_RULES.aspectCoherence.incoherent;

  /* Has the visitor moved a control away from what was measured? Compared on
     the rounded values the panel actually displays, so "8,546 ft" does not
     report itself as overridden because of a hidden decimal. */
  /* How far the planting pin now sits from the point the current reading came
     from. This is the guard against a stale number: 695 ft of effective
     elevation rides on 300 m of pin movement at the test address, so a reading
     that no longer describes the pin is worse than no reading. 30 ft of slop
     absorbs a fingertip on a phone without nagging. */
  const pinMovedFt = (measured && measured.measuredAt && pins.plant)
    ? feetBetween(measured.measuredAt, pins.plant) : 0;
  const pinMoved = pinMovedFt > 30;

  const overridden = !!measured && (
    siteElev !== measured.elevFt ||
    Math.round(siteSlopePct * 10) / 10 !== measured.slopePct ||
    (aspectTrusted && siteAspect !== measured.aspectDeg) ||
    (!aspectTrusted && siteAspect !== null)
  );

  const applyMeasurement = m => {
    if (m.elevFt != null) setSiteElev(m.elevFt);
    if (m.slopePct != null) setSiteSlopePct(m.slopePct);
    /* An incoherent bearing is not applied. It is still reported — the visitor
       is told what was read and why it was not used, and can set the aspect by
       hand from standing outside, which on this ground is the better instrument. */
    setSiteAspect(
      m.aspectDeg != null &&
      m.aspectCoherence != null &&
      m.aspectCoherence >= SITE_RULES.aspectCoherence.incoherent
        ? m.aspectDeg
        : null,
    );
  };

  const runLookup = async e => {
    if (e) e.preventDefault();
    const address = siteAddr.trim();
    if (!address) return;
    setSiteOn(true);
    setLookup({ status: "loading" });
    try {
      const r = await fetch(`/api/site-lookup?address=${encodeURIComponent(address)}`);
      const geo = await r.json();
      if (!r.ok) {
        setLookup({ status: "error", message: geo.message || "That address could not be found." });
        return;
      }
      /* Refuse before measuring, not after. The range guard is about what this
         database can answer for, and running three USGS requests to decorate a
         refusal helps nobody. */
      if (outsideCoverage(geo.lat, geo.lon)) {
        setLookup({
          status: "error",
          message:
            `${geo.matchedAddress || address} is outside Colorado. This database is ` +
            "built for the Southern Rockies, and off that map it would return the " +
            "residue of a filter rather than a palette.",
        });
        return;
      }
      setLookup({ status: "loading", phase: "terrain" });
      const terrain = await measureTerrain(geo.lat, geo.lon);
      if (terrain.elevFt == null) {
        setLookup({
          status: "error",
          message: "USGS has no elevation for that point, so there is nothing to tune to.",
        });
        return;
      }
      const at = { lat: geo.lat, lon: geo.lon };
      const data = { ...geo, ...terrain, measuredAt: at };
      applyMeasurement(data);
      /* Open the map on the geocode, with the planting pin already on it. The
         visitor refines from there rather than starting with an empty map and
         having to find their own house cold. */
      setMapView({ lat: geo.lat, lon: geo.lon, z: MAP_Z_DEFAULT });
      setPins({ plant: at, house: null });
      setPinMode("plant");
      setLookup({ status: "ok", data });
    } catch (err) {
      setLookup({
        status: "error",
        message:
          err && err.message
            ? `The terrain lookup failed: ${err.message}. USGS 3DEP is intermittent — try again, or set your site by hand below.`
            : "The lookup failed. Set your site by hand below.",
      });
    }
  };

  /* Re-measure at the planting pin. Same guards as the address path — the range
     check runs before the three USGS requests, not after them. */
  const measureAtPin = async () => {
    const at = pins.plant;
    if (!at) return;
    if (outsideCoverage(at.lat, at.lon)) {
      setLookup(l => ({ ...l, status: "error",
        message: "That pin is outside Colorado. This database is built for the "
               + "Southern Rockies, and off that map it would return the residue "
               + "of a filter rather than a palette." }));
      return;
    }
    const keep = measured;
    setLookup({ status: "loading", phase: "terrain" });
    try {
      const terrain = await measureTerrain(at.lat, at.lon);
      if (terrain.elevFt == null) {
        setLookup({ status: "error", message: "USGS has no elevation at that pin." });
        return;
      }
      /* The geocode fields — matched address, precision, hardiness — describe
         the ADDRESS and survive a pin move. Only the terrain is re-read. */
      const data = { ...(keep || {}), ...terrain, measuredAt: at };
      applyMeasurement(data);
      setLookup({ status: "ok", data });
    } catch (err) {
      setLookup({ status: "error",
        message: (err && err.message ? err.message + ". " : "")
               + "USGS 3DEP is intermittent — try again, or set your site by hand below." });
    }
  };

  /* ═══════════════════ MAP INTERACTION ═══════════════════

     Everything here commits ONE state update, on release. Updating state per
     pointermove would re-render the whole component — 104 plant cards
     included — on every frame of a drag, which is the other half of why the
     old map felt like wading. During the gesture only a CSS transform on the
     tile layer moves, which the compositor handles without React at all.

     The gestures are the ones a map is expected to have. The old map had drag
     and two buttons, so a visitor who pinched got nothing, a visitor who
     scrolled got the page, and a visitor who wanted to zoom toward their house
     had to zoom, re-pan, zoom, re-pan. All three are fixed below, and the
     re-pan one is fixed in zoomAbout: every zoom keeps the ground under the
     cursor under the cursor. */

  const stageBox = () => stageRef.current?.getBoundingClientRect();

  /* The tile layer is what moves during a gesture. Committing the pan then
     resets it to identity in the same paint the new view renders in. */
  const setLayerTransform = t => {
    const el = mapLayerRef.current;
    if (el) el.style.transform = t;
  };

  const mapPointerDown = e => {
    if (!mapView) return;
    const el = stageRef.current;
    if (!el) return;

    /* Two fingers is a pinch, not two drags. Without this the second finger
       starts its own pan and the map lurches between them. */
    if (pinchRef.current) return;
    if (dragRef.current && dragRef.current.id !== e.pointerId) {
      const d = dragRef.current;
      dragRef.current = null;
      setLayerTransform("");
      pinchRef.current = {
        a: { id: d.id, x: d.lastX, y: d.lastY },
        b: { id: e.pointerId, x: e.clientX, y: e.clientY },
        d0: null,
      };
      const dx = e.clientX - d.lastX, dy = e.clientY - d.lastY;
      pinchRef.current.d0 = Math.hypot(dx, dy) || 1;
      return;
    }

    /* Pointer capture keeps a drag tracking after the finger leaves the stage.
       It THROWS NotFoundError when the id is not an active pointer — which `?.`
       does not protect against, since the method exists and the call fails.
       Capture is an enhancement: without it a drag that wanders off the element
       simply stops, which is a degradation and not a break. Never let it reach
       the console. */
    try { el.setPointerCapture?.(e.pointerId); } catch { /* not capturable */ }
    dragRef.current = {
      id: e.pointerId,
      x0: e.clientX, y0: e.clientY,
      lastX: e.clientX, lastY: e.clientY,
      dx: 0, dy: 0, moved: false,
    };
  };

  const mapPointerMove = e => {
    const pz = pinchRef.current;
    if (pz) {
      if (e.pointerId === pz.a.id) { pz.a.x = e.clientX; pz.a.y = e.clientY; }
      else if (e.pointerId === pz.b.id) { pz.b.x = e.clientX; pz.b.y = e.clientY; }
      else return;
      const dist = Math.hypot(pz.a.x - pz.b.x, pz.a.y - pz.b.y) || 1;
      /* Scale the tile layer live so the pinch tracks the fingers. The zoom
         itself only commits on release, at whole levels — the grid has no
         fractional levels to fetch, and pretending otherwise would mean a
         render request per frame. */
      pz.scale = dist / pz.d0;
      const box = stageBox();
      if (box) {
        const mx = (pz.a.x + pz.b.x) / 2 - box.left;
        const my = (pz.a.y + pz.b.y) / 2 - box.top;
        setLayerTransform(
          `translate(${mx}px, ${my}px) scale(${pz.scale}) translate(${-mx}px, ${-my}px)`);
      }
      return;
    }

    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    d.lastX = e.clientX; d.lastY = e.clientY;
    d.dx = e.clientX - d.x0;
    d.dy = e.clientY - d.y0;
    if (Math.abs(d.dx) > 4 || Math.abs(d.dy) > 4) d.moved = true;
    setLayerTransform(`translate(${d.dx}px, ${d.dy}px)`);
  };

  /* Shift the centre by the same fraction of the stage the layer moved. */
  const panBy = (dxPx, dyPx, box) => setMapView(v => {
    if (!v) return v;
    const b = mapBbox(v);
    const [lat, lon] = from3857(
      (b.xmin + b.xmax) / 2 - (dxPx / box.width) * b.s,
      (b.ymin + b.ymax) / 2 + (dyPx / box.height) * b.s);
    return { ...v, lat, lon };
  });

  const mapPointerUp = e => {
    const box = stageBox();

    const pz = pinchRef.current;
    if (pz && (e.pointerId === pz.a.id || e.pointerId === pz.b.id)) {
      pinchRef.current = null;
      setLayerTransform("");
      if (box && pz.scale) {
        /* A pinch past 1.5x is a level in, past 0.67x a level out. Anything
           less was a wobble, and a map that changes level on a wobble is worse
           than one that does not respond. */
        const dz = pz.scale >= 1.5 ? 1 : pz.scale <= 0.67 ? -1 : 0;
        if (dz) {
          const mx = ((pz.a.x + pz.b.x) / 2 - box.left) / box.width;
          const my = ((pz.a.y + pz.b.y) / 2 - box.top) / box.height;
          zoomMap(dz, mx, my);
        }
      }
      return;
    }

    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    dragRef.current = null;
    setLayerTransform("");
    if (!box || !mapView) return;

    if (d.moved) { panBy(d.dx, d.dy, box); return; }

    const fx = (e.clientX - box.left) / box.width;
    const fy = (e.clientY - box.top) / box.height;
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return;

    /* DOUBLE-TAP TO ZOOM IN. Held in a ref rather than state so the first tap
       of a pair does not re-render on its way to becoming a zoom. 320 ms and
       24 px are the usual thresholds; wider on both would start eating
       deliberate second pins. */
    const now = e.timeStamp;
    const prev = tapRef.current;
    tapRef.current = { t: now, x: e.clientX, y: e.clientY };
    if (prev && now - prev.t < 320 &&
        Math.abs(e.clientX - prev.x) < 24 && Math.abs(e.clientY - prev.y) < 24) {
      tapRef.current = null;
      zoomMap(1, fx, fy);
      return;
    }

    mapTapAt(fx, fy);
  };

  /* What a single tap MEANS depends on what is being marked. The planting pin
     is a point and always was. The house is a shape, and the mode decides how
     the visitor describes it — see feetToHouse. */
  const mapTapAt = (fx, fy) => {
    const [lat, lon] = mapPointAt(mapView, fx, fy);

    if (pinMode === "plant") {
      setPins(pp => ({ ...pp, plant: { lat, lon } }));
      return;
    }

    if (houseMode === "trace") { setTrace(t => [...t, [lon, lat]]); return; }

    if (houseMode === "tap") {
      /* Smallest footprint containing the tap. Smallest, because a house and
         its attached garage can both contain the point and the garage is the
         more specific answer — and because overlapping polygons in the source
         should resolve toward what was actually aimed at. */
      const hit = footprints.list
        .filter(f => ringContains(f.ring, lat, lon))
        .sort((a, b) => (a.sqm || 0) - (b.sqm || 0))[0];
      if (hit) {
        setPins(pp => ({ ...pp, house: { kind:"footprint", ring: hit.ring,
                                         addr: hit.addr, sqm: hit.sqm } }));
      }
      /* A tap on open ground in tap mode does nothing on purpose. Dropping a
         point pin there would silently downgrade a measured envelope to the
         thing this replaced, and the visitor would have no way to tell. */
      return;
    }

    setPins(pp => ({ ...pp, house: { kind:"point", lat, lon } }));
  };

  /* ── zoom ──
     zoomAbout keeps the ground under (fx, fy) under (fx, fy). The old buttons
     zoomed about the centre, so zooming toward a house walked it off screen and
     the visitor re-panned after every step. */
  const zoomMap = (dir, fx = 0.5, fy = 0.5) => setMapView(v => {
    if (!v) return v;
    const next = zoomAbout(v, dir, fx, fy);
    if (next.z === v.z) return v;
    /* Hand the level we are leaving to the ghost layer, so its tiles stay on
       screen — rescaled into the new geometry — until the new ones decode.
       This is what replaced the beige square. */
    setGhost({ z: v.z, tiles: mapTiles(v, 1), layer: mapLayer });
    return next;
  });

  /* Wheel and trackpad. Bound through a ref with { passive: false } because
     React's onWheel is passive: preventDefault inside it is ignored with a
     console warning, and the page scrolls out from under the map instead. */
  useEffect(() => {
    const el = stageRef.current;
    if (!el || !mapView) return undefined;
    const onWheel = ev => {
      ev.preventDefault();
      const box = el.getBoundingClientRect();
      const fx = (ev.clientX - box.left) / box.width;
      const fy = (ev.clientY - box.top) / box.height;
      zoomMap(ev.deltaY < 0 ? 1 : -1, fx, fy);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [mapView, mapLayer]);

  /* Retire the ghost once the new level has actually painted. Keyed on the tile
     set rather than a timer: a timer either drops the ghost before the tiles
     arrive, which is the beige square again, or holds it long after, which
     leaves a stale layer under a fresh one. */
  const visibleTiles = useMemo(() => (mapView ? mapTiles(mapView, 0) : []), [mapView]);
  const visibleReady = visibleTiles.length > 0 &&
    visibleTiles.every(t => loaded[`${mapLayer}:${t.key}`]);

  /* The margin ring joins the render only once the visible four have decoded.
     Until then `currentTiles` IS the visible set, so nothing competes with it
     for a connection. Already-cached tiles satisfy this immediately, so a
     revisit or a zoom back out never waits. */
  const currentTiles = useMemo(
    () => (mapView ? mapTiles(mapView, visibleReady ? 1 : 0) : []),
    [mapView, visibleReady]);

  useEffect(() => {
    if (!ghost || !visibleTiles.length) return;
    /* Retire the ghost on the VISIBLE tiles, not on the ring — the ring is off
       screen, and waiting for it would hold a stale layer under a finished one
       for as long as the margin takes to arrive. */
    if (visibleReady) setGhost(null);
  }, [ghost, visibleTiles, visibleReady]);

  /* ── footprints for the view ──
     Refetched when the view moves, debounced, and abandoned when it moves
     again — a pan that crosses three views should issue one query, not three,
     and the two it cancelled must never land after the one it kept. */
  useEffect(() => {
    if (!mapView || !useHousePin || houseMode !== "tap") return undefined;
    if (mapView.z < FOOTPRINT_MIN_Z) { setFootprints({ status:"zoom", list:[] }); return undefined; }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      setFootprints(f => ({ status:"loading", list:f.list }));
      fetchFootprints(mapView, ctl.signal)
        .then(list => setFootprints({ status:"ok", list }))
        .catch(err => {
          if (err.name === "AbortError") return;
          /* A footprint layer that will not load is a house marked the old way,
             not a broken panel. The mode buttons stay, and the hint says so. */
          setFootprints({ status:"error", list:[] });
        });
    }, 250);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [mapView, useHousePin, houseMode]);

  /* Close the traced ring. Three points is the minimum that encloses anything;
     below that there is no inside and feetToHouse would measure to a line. */
  const closeTrace = () => {
    if (trace.length < 3) return;
    setPins(pp => ({ ...pp, house: { kind:"traced", ring: trace } }));
    setTrace([]);
  };

  const clearHouse = () => { setPins(pp => ({ ...pp, house:null })); setTrace([]); };

  const SitePanel = () => {
    const band = bandForPct(siteSlopePct);
    const aspectLabel = compassName(siteAspect);
    const nearest = nearestAspectPoint(siteAspect);
    const showManual = manualOpen || lookup.status === "error" || lookup.status === "idle";

    return (
      <div className="xpdb-site">
        <button type="button" className="xpdb-site-toggle"
          aria-expanded={siteOn} onClick={() => setSiteOn(o => !o)}>
          <span>{siteOn ? "Tuned to your site" : "Tune this list to your site"}</span>
          <span aria-hidden="true">{siteOn ? "−" : "+"}</span>
        </button>

        {siteOn && (
          <div className="xpdb-site-body">
            {/* A form, so Enter submits and the field is a real search control.
                onSubmit rather than onClick for the same reason. */}
            <form className="xpdb-site-addr" onSubmit={runLookup}>
              <label className="xpdb-site-lab" htmlFor="xpdb-addr">
                Your address
              </label>
              <div className="xpdb-site-addr-row">
                <input id="xpdb-addr" type="text" autoComplete="street-address"
                  placeholder="123 Main St, Vail, CO"
                  value={siteAddr} onChange={e => setSiteAddr(e.target.value)} />
                <button type="submit" disabled={lookup.status === "loading" || !siteAddr.trim()}>
                  {lookup.status === "loading" ? "Measuring…" : "Measure"}
                </button>
              </div>
              <p className="xpdb-site-privacy">
                Sent to the US Census geocoder to find the coordinates, and
                nowhere else. Not stored, not logged. The elevation and slope
                come from USGS, which is given the coordinates only.
              </p>
            </form>

            {/* 3DEP answers in 10-13 seconds on a good day and retries past a
                cached CloudFront 504 on a bad one, so a lookup can run 40. A
                button that says "Measuring…" for forty seconds and nothing else
                reads as broken, and the visitor reloads halfway through. Naming
                the current step costs nothing and makes the wait legible. */}
            {lookup.status === "loading" && (
              <p className="xpdb-site-prov" role="status">
                {lookup.phase === "terrain"
                  ? "Reading the terrain from USGS 3DEP — elevation, slope and aspect over 120 m. This takes a few seconds, and longer when the service is busy."
                  : "Finding the address…"}
              </p>
            )}

            {lookup.status === "error" && (
              <p className="xpdb-site-err">{lookup.message}</p>
            )}

            {measured && (
              <div className="xpdb-site-meas">
                <p className="xpdb-site-matched">
                  <b>{measured.matchedAddress}</b>
                </p>
                <dl className="xpdb-site-facts">
                  <div><dt>Elevation</dt><dd>{measured.elevFt.toLocaleString()} ft</dd></div>
                  <div><dt>Slope</dt><dd>{measured.slopePct}% · {bandForPct(measured.slopePct).label.toLowerCase()}</dd></div>
                  <div>
                    <dt>Aspect</dt>
                    <dd>
                      {measured.aspectDeg == null
                        ? "none — ground is flat"
                        : `${Math.round(measured.aspectDeg)}° ${compassKey(measured.aspectDeg)}`}
                    </dd>
                  </div>
                  {measured.hardiness && (
                    <div>
                      <dt>Hardiness zone</dt>
                      <dd>{measured.hardiness.zone}{measured.hardiness.tempRange ? ` · ${measured.hardiness.tempRange}°F` : ""}</dd>
                    </div>
                  )}
                </dl>
                <p className="xpdb-site-prov">
                  Elevation, slope and aspect measured from USGS 3DEP over a{" "}
                  {Math.round(measured.radiusM)} m radius — the same reading a
                  site analysis starts from.
                  {measured.hardiness && (
                    <> The hardiness zone is the USDA 2023 figure for ZIP{" "}
                    {measured.hardiness.zip}, not for this parcel: in this county one
                    ZIP spans thousands of feet, so it is shown as background and is
                    not filtered on. Elevation is what actually selects.</>
                  )}
                </p>

                {/* THE COHERENCE REPORT. Not a footnote — on this ground it is
                    frequently the most important line in the panel. */}
                {measured.aspectDeg == null && (
                  <p className="xpdb-site-prov">
                    At {measured.slopeDeg}° mean slope this ground is level enough
                    that it has no aspect to report — so none was invented, and no
                    correction was applied. If the patch you are planting does fall
                    one way, set it by hand.
                  </p>
                )}

                {measured.aspectDeg != null && coh != null && (
                  <p className={aspectTrusted ? "xpdb-site-prov" : "xpdb-site-held"}>
                    {coh >= SITE_RULES.aspectCoherence.coherent ? (
                      <>The slope faces one way consistently (coherence {coh.toFixed(2)}),
                      so that bearing describes your ground.</>
                    ) : aspectTrusted ? (
                      <><b>Mixed aspect</b> (coherence {coh.toFixed(2)}). This is dissected
                      ground and the bearing blends differing faces — it is applied, but
                      treat it as indicative and correct it below if you can see which way
                      your planting area actually falls.</>
                    ) : (
                      <><b>No dominant direction</b> (coherence {coh.toFixed(2)}). Within
                      {" "}{Math.round(measured.radiusM)} m the ground faces too many ways for one
                      bearing to mean anything, so <b>no aspect correction has been
                      applied</b>. Set it below from what you can see — standing outside
                      beats the average here.</>
                    )}
                  </p>
                )}

                {measured.precision && measured.precision.span >= 100 && (
                  <p className="xpdb-site-held">
                    That address was interpolated along a street carrying numbers{" "}
                    {measured.precision.fromAddress}–{measured.precision.toAddress}, so the
                    point may sit hundreds of feet from the house — and on a winding
                    mountain road that can be a different hillside. Check the elevation
                    against what you know, and adjust below.
                  </p>
                )}

                {measured.ambiguous > 0 && (
                  <p className="xpdb-site-held">
                    {measured.ambiguous} addresses matched; the first was taken.
                  </p>
                )}

                {overridden && (
                  <p className="xpdb-site-prov">
                    The list is tuned to your edits, not to the measurement.{" "}
                    <button type="button" className="xpdb-linkish"
                      onClick={() => applyMeasurement(measured)}>Reset to measured</button>
                  </p>
                )}
              </div>
            )}

            {/* ── the map ──
                Appears only once there is something to centre it on. An empty
                map asking a visitor to find their own house cold is a worse
                starting point than the geocode, however rough the geocode is. */}
            {mapView && (
              <div className="xpdb-map">
                <div className="xpdb-map-head">
                  <div className="xpdb-map-layers">
                    {Object.entries(MAP_LAYERS).map(([k, l]) => (
                      <button key={k} type="button" title={l.hint}
                        /* Hold the outgoing layer underneath while the incoming
                           one loads. Swapping src on the same <img> blanks it,
                           so without this a layer switch is the beige square
                           that the zoom fix just removed. */
                        onClick={() => {
                          if (k === mapLayer) return;
                          setGhost({ z: mapView.z, tiles: mapTiles(mapView, 1), layer: mapLayer });
                          setMapLayer(k);
                        }}
                        className={mapLayer === k ? "on" : ""}>{l.label}</button>
                    ))}
                  </div>
                  <div className="xpdb-map-zoom">
                    <button type="button" onClick={() => zoomMap(-1)} aria-label="Zoom out"
                      disabled={mapView.z === MAP_Z_MIN}>−</button>
                    {/* The GROUND span, cos-corrected out of the mercator grid.
                        Quoting the projected figure would overstate what is on
                        screen by about thirty percent at this latitude. */}
                    <span>{Math.round(groundSpanM(mapView))} m</span>
                    <button type="button" onClick={() => zoomMap(1)} aria-label="Zoom in"
                      disabled={mapView.z === MAP_Z_MAX}>+</button>
                  </div>
                </div>

                {/* touch-action:none is on the stage, so the browser hands us
                    every pointer instead of scrolling the page. */}
                <div className="xpdb-map-stage" ref={stageRef}
                  onPointerDown={mapPointerDown}
                  onPointerMove={mapPointerMove}
                  onPointerUp={mapPointerUp}
                  onPointerCancel={() => { dragRef.current = null; pinchRef.current = null;
                                           setLayerTransform(""); }}>

                  {/* THE GHOST. The level being left, rescaled into the new
                      geometry and held underneath until the new tiles decode.
                      Without it every zoom is a flash of the stage background,
                      which is what fifteen seconds of beige used to be. */}
                  {ghost && (
                    <div className="xpdb-map-ghost" aria-hidden="true">
                      {ghost.tiles.map(t => {
                        const g = ghostPlacement(mapView, t);
                        return (
                          <img key={t.key} src={mapTileUrl(t, ghost.layer)} alt=""
                            draggable="false" className="xpdb-tile"
                            style={{ left:`${g.left * 100}%`, top:`${g.top * 100}%`,
                                     width:`${g.size * 100}%`, height:`${g.size * 100}%` }} />
                        );
                      })}
                    </div>
                  )}

                  {/* The tile layer. Keyed by z/x/y and NOT by position, which
                      is what lets React keep the same <img> across a pan — the
                      browser never re-decodes, and a pan inside the margin
                      touches the network not at all. */}
                  <div className="xpdb-map-tiles" ref={mapLayerRef}>
                    {currentTiles.map(t => (
                      <img key={t.key} className="xpdb-tile" draggable="false" alt=""
                        src={mapTileUrl(t, mapLayer)}
                        onLoad={() => setLoaded(l => ({ ...l, [`${mapLayer}:${t.key}`]: true }))}
                        style={{ left:`${t.left * 100}%`, top:`${t.top * 100}%`,
                                 width:"100%", height:"100%" }} />
                    ))}
                  </div>

                  {/* ── the footprint overlay ──
                      One SVG in the stage's own fractional coordinate space, so
                      it pans and zooms with the tiles for free and needs no
                      per-polygon repositioning. pointer-events stay off: the
                      stage owns the gesture, and hit testing happens against the
                      rings in mapTapAt, where "smallest containing polygon" is a
                      rule rather than whatever the DOM stacked on top. */}
                  {useHousePin && houseMode === "tap" && footprints.list.length > 0 && (
                    <svg className="xpdb-map-fp" viewBox="0 0 1 1" preserveAspectRatio="none"
                      aria-hidden="true">
                      {footprints.list.map(f => {
                        const pts = f.ring.map(([lon, lat]) => mapFractionOf(mapView, lat, lon));
                        if (pts.every(([x, y]) => x < -0.2 || x > 1.2 || y < -0.2 || y > 1.2)) return null;
                        const chosen = pins.house && pins.house.kind === "footprint" &&
                          pins.house.ring === f.ring;
                        return (
                          <polygon key={f.id} className={chosen ? "chosen" : ""}
                            points={pts.map(([x, y]) => `${x},${y}`).join(" ")} />
                        );
                      })}
                    </svg>
                  )}

                  {/* The chosen or traced envelope, drawn over everything so it
                      reads as the answer rather than as one more candidate. */}
                  {useHousePin && pins.house && pins.house.ring && (
                    <svg className="xpdb-map-house" viewBox="0 0 1 1" preserveAspectRatio="none"
                      aria-hidden="true">
                      <polygon points={pins.house.ring
                        .map(([lon, lat]) => mapFractionOf(mapView, lat, lon))
                        .map(([x, y]) => `${x},${y}`).join(" ")} />
                    </svg>
                  )}

                  {/* A trace in progress: the vertices so far, and the line
                      between them. Shown open, because it is open. */}
                  {useHousePin && houseMode === "trace" && trace.length > 0 && (
                    <svg className="xpdb-map-trace" viewBox="0 0 1 1" preserveAspectRatio="none"
                      aria-hidden="true">
                      <polyline points={trace
                        .map(([lon, lat]) => mapFractionOf(mapView, lat, lon))
                        .map(([x, y]) => `${x},${y}`).join(" ")} />
                      {trace.map(([lon, lat], i) => {
                        const [x, y] = mapFractionOf(mapView, lat, lon);
                        return <circle key={i} cx={x} cy={y} r="0.008" />;
                      })}
                    </svg>
                  )}

                  {/* ── the pins ──
                      The planting pin is a point. The house glyph marks the
                      centroid of whatever shape was given, and is hidden when a
                      ring is drawn — the outline already says where the house
                      is, and better than a symbol in the middle of it can. */}
                  {pins.plant && (() => {
                    const [fx, fy] = mapFractionOf(mapView, pins.plant.lat, pins.plant.lon);
                    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return null;
                    return (
                      <span className={`xpdb-pin xpdb-pin-plant${pinMode === "plant" ? " active" : ""}`}
                        style={{ left:`${fx * 100}%`, top:`${fy * 100}%` }}
                        title="Where you are planting">✽</span>
                    );
                  })()}
                  {useHousePin && pins.house && !pins.house.ring && (() => {
                    const a = houseAnchor(pins.house);
                    const [fx, fy] = mapFractionOf(mapView, a.lat, a.lon);
                    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return null;
                    return (
                      <span className={`xpdb-pin xpdb-pin-house${pinMode === "house" ? " active" : ""}`}
                        style={{ left:`${fx * 100}%`, top:`${fy * 100}%` }}
                        title="The house">⌂</span>
                    );
                  })()}
                </div>

                <div className="xpdb-map-controls">
                  <div className="xpdb-map-which">
                    <button type="button" onClick={() => setPinMode("plant")}
                      className={pinMode === "plant" ? "on" : ""}>✽ Planting area</button>
                    {useHousePin && (
                      <button type="button" onClick={() => setPinMode("house")}
                        className={pinMode === "house" ? "on" : ""}>⌂ House</button>
                    )}
                  </div>
                  <label className="xpdb-map-two">
                    <input type="checkbox" checked={useHousePin}
                      onChange={e => {
                        setUseHousePin(e.target.checked);
                        setPinMode(e.target.checked ? "house" : "plant");
                        if (!e.target.checked) clearHouse();
                      }} />
                    <span>Also mark the house</span>
                  </label>
                </div>

                {/* ── how the house gets marked ──
                    Only while the house is the active mark. Three ways, and the
                    order is the order of what they know: a real footprint, a
                    drawn one, a bare point. */}
                {useHousePin && pinMode === "house" && (
                  <div className="xpdb-house-modes">
                    <div className="xpdb-map-which">
                      {[["tap", "Tap the building"], ["trace", "Trace it"], ["point", "Just a pin"]]
                        .map(([k, label]) => (
                          <button key={k} type="button"
                            onClick={() => { setHouseMode(k); setTrace([]); }}
                            className={houseMode === k ? "on" : ""}>{label}</button>
                        ))}
                    </div>

                    {houseMode === "tap" && (
                      <p className="xpdb-map-tip">
                        {footprints.status === "zoom"
                          ? <>Zoom in to load building outlines.</>
                          : footprints.status === "loading" && !footprints.list.length
                          ? <>Loading building outlines…</>
                          : footprints.status === "error"
                          ? <>Building outlines are unavailable right now — trace the
                             house or drop a pin instead.</>
                          : footprints.list.length
                          ? <>Tap your house. The distance is then measured to its
                             nearest wall, not to a point in the middle of it.</>
                          : <>No mapped buildings here. USA Structures covers
                             structures over 450 sq ft and does miss some — trace
                             the house or drop a pin instead.</>}
                      </p>
                    )}

                    {houseMode === "trace" && (
                      <div className="xpdb-trace-controls">
                        <p className="xpdb-map-tip">
                          Tap each corner of the house, then close the shape.
                          {trace.length > 0 && <> {trace.length} corner{trace.length === 1 ? "" : "s"} so far.</>}
                        </p>
                        <button type="button" onClick={closeTrace} disabled={trace.length < 3}>
                          Close the shape
                        </button>
                        <button type="button" onClick={() => setTrace(t => t.slice(0, -1))}
                          disabled={!trace.length}>Undo corner</button>
                      </div>
                    )}

                    {houseMode === "point" && (
                      <p className="xpdb-map-tip">
                        Tap the middle of the house. This measures to that point, so
                        it reads long by roughly half the width of the building —
                        <b> 13 to 72 ft</b> on the houses around the test address.
                        Prefer tapping the outline where there is one.
                      </p>
                    )}

                    {pins.house && (
                      <p className="xpdb-house-said">
                        {pins.house.kind === "footprint"
                          ? <>Measuring to the mapped outline
                              {pins.house.addr ? <> of {pins.house.addr.toLowerCase()}</> : null}
                              {pins.house.sqm ? <> ({Math.round(pins.house.sqm)} m²)</> : null}.
                              That outline is a <b>roofline</b> traced from aerial
                              imagery, so it follows the eaves — a foot or three
                              outside the foundation, which is the safe direction
                              for a defensible-space band.</>
                          : pins.house.kind === "traced"
                          ? <>Measuring to the outline you drew, {pins.house.ring.length} corners.</>
                          : <>Measuring to a single point.</>}
                        {" "}
                        <button type="button" className="xpdb-linkish" onClick={clearHouse}>
                          Clear
                        </button>
                      </p>
                    )}
                  </div>
                )}

                <p className="xpdb-map-tip">
                  Drag to pan. Scroll, pinch or double-tap to zoom — the point
                  under the cursor stays put.{" "}
                  {pinMode === "plant"
                    ? <>Tap to place the <b>planting</b> pin.</>
                    : <>Tap to mark the <b>house</b>.</>}{" "}
                  {MAP_LAYERS[mapLayer].credit}
                  {/* CC BY 4.0 requires the credit, and it only appears while
                      the layer it describes is actually on screen. */}
                  {useHousePin && houseMode === "tap" && footprints.list.length > 0
                    && <>, building outlines FEMA/ORNL USA Structures (CC BY 4.0)</>}
                  {/* Only the aerial has a survey date worth stating. The
                      hillshade is terrain, and terrain does not go out of date
                      the way a roofline does. */}
                  {mapLayer === "aerial" && measured && measured.imageryYear
                    && <>, flown {measured.imageryYear} — anything planted since
                       will not be in it</>}.
                </p>

                {/* The distance is measured once both pins are down, so the
                    band stops being a question. */}
                {useHousePin && pinDistFt != null && (
                  <p className="xpdb-map-dist">
                    <b>{Math.round(pinDistFt)} ft</b>{" "}
                    {pins.house && pins.house.ring
                      ? <>from the nearest wall</>
                      : <>from the house pin</>} — {siteZone.name}
                    {siteZone.minIgn != null && <>, ignitability {siteZone.minIgn}+ only</>}.
                    {/* The band edge is the whole point of measuring to the
                        wall rather than to the middle: HIZ 0 is five feet wide
                        and a centre-of-roof pin cannot resolve it at all. */}
                    {pinDistFt === 0 && <> That is inside the outline — move the
                      planting pin outside the house.</>}
                  </p>
                )}
                {useHousePin && pinDistFt == null && (
                  <p className="xpdb-map-tip">
                    Mark the house too and the distance is measured instead of asked.
                  </p>
                )}

                {/* THE SENSITIVITY, ON SCREEN. Moving the pin 300 m at this
                    address swings effective elevation by 695 ft, so a stale
                    reading must never sit quietly beside a moved pin. */}
                {pinMoved && (
                  <p className="xpdb-map-stale">
                    The pin has moved {Math.round(pinMovedFt)} ft from where these
                    numbers were read. Aspect changes faster than most people expect
                    across a property — measure again to tune to the new spot.
                  </p>
                )}

                <button type="button" className="xpdb-map-measure"
                  onClick={measureAtPin}
                  disabled={lookup.status === "loading" || !pins.plant}>
                  {lookup.status === "loading" ? "Measuring…"
                    : pinMoved ? "Measure at the pin" : "Measure here again"}
                </button>
              </div>
            )}

            {/* ── the manual controls ──
                Kept, and pre-filled. The measurement is a point on a road read
                against a bare-earth model: it does not know the house, the
                aspen grove, or which corner of the lot is being planted, and
                when coherence is low it does not know the aspect either. */}
            {!showManual && (
              <button type="button" className="xpdb-linkish xpdb-site-adjust"
                onClick={() => setManualOpen(true)}>Adjust these by hand →</button>
            )}

            {showManual && (
              <div className="xpdb-site-manual">
                <div className="xpdb-site-lab">
                  Elevation <b>{siteElev.toLocaleString()} ft</b>
                </div>
                <input id="xpdb-elev" type="range" min="5000" max="11000" step="100"
                  aria-label="Site elevation in feet"
                  value={siteElev} onChange={e => setSiteElev(+e.target.value)} />

                <div className="xpdb-site-lab">Which way does the ground fall away?</div>
                <div className="xpdb-site-row">
                  <button type="button" onClick={() => setSiteAspect(null)}
                    className={siteAspect == null ? "on" : ""}>Flat</button>
                  {ASPECT_POINTS.map(a => (
                    <button key={a.key} type="button" onClick={() => setSiteAspect(a.deg)}
                      className={nearest && nearest.key === a.key ? "on" : ""}>{a.key}</button>
                  ))}
                </div>
                {/* A measured bearing is rarely one of the eight. Say the real
                    number, so a highlighted "NW" is not read as exactly 315°. */}
                {siteAspect != null && siteAspect % 45 !== 0 && (
                  <div className="xpdb-site-lab">Currently <b>{Math.round(siteAspect)}°</b>, measured</div>
                )}

                <div className="xpdb-site-lab">How steep? <b>{Math.round(siteSlopePct)}%</b></div>
                <div className="xpdb-site-row">
                  {SLOPE_BANDS.map(b => (
                    <button key={b.key} type="button" title={b.hint}
                      onClick={() => setSiteSlopePct(b.pct)}
                      className={band.key === b.key ? "on" : ""}>{b.label}</button>
                  ))}
                </div>

                <div className="xpdb-site-lab">
                  How far from the house?{" "}
                  {pinDistFt == null
                    ? <span className="xpdb-site-onlyask">the one thing no dataset knows</span>
                    : <span className="xpdb-site-onlyask">measured from your two pins</span>}
                </div>
                {/* Two pins answer this, so the buttons go rather than sitting
                    there implying a choice that no longer has an effect. */}
                {pinDistFt == null ? (
                  <div className="xpdb-site-row">
                    {[3, 15, 60, 150].map(d => {
                      const z = zoneForDistance(d);
                      return (
                        <button key={d} type="button" onClick={() => setSiteDist(d)}
                          className={siteDist === d ? "on" : ""}>
                          {z.fromFt}–{z.toFt} ft
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="xpdb-site-prov">
                    <b>{Math.round(pinDistFt)} ft</b> between the house pin and the
                    planting pin — {siteZone.name}. Clear the house pin above to set
                    this by hand instead.
                  </p>
                )}
              </div>
            )}

            <div className="xpdb-site-out">
              {siteZone.minIgn == null && siteZone.fromFt === 0 ? (
                <p className="xpdb-site-nope">
                  <b>Nothing is planted here.</b> {siteZone.note}
                </p>
              ) : (
                <>
                  {/* Two sentences, because one of them was contradictory. With
                      no aspect the old wording read "a flat or unknown slope at
                      gentle grade", which says the ground is flat and then gives
                      its grade. An unapplied aspect is a different statement from
                      a flat site and has to read like one. */}
                  {siteAspect == null ? (
                    <p>
                      {/* "as measured" is only true once something has been
                          measured. Before a lookup this is the default the
                          slider starts on, and calling that a measurement is
                          the kind of small lie the rest of this page exists to
                          avoid. */}
                      With no aspect applied, the list is tuned to{" "}
                      <b>{effElev.ft.toLocaleString()} ft</b>
                      {measured ? " as measured." : "."}
                    </p>
                  ) : (
                    <p>
                      A {aspectLabel}-facing slope at {band.label.toLowerCase()} grade
                      behaves like <b>{effElev.ft.toLocaleString()} ft</b>
                      {effElev.offset !== 0 && (
                        <> — {effElev.offset > 0 ? "+" : ""}{effElev.offset.toLocaleString()} ft
                        on its measured elevation</>
                      )}.
                    </p>
                  )}
                  <p className="xpdb-site-count">
                    <b>{plants.length}</b> species suit that
                    {siteZone.minIgn != null && <> within {siteZone.toFt} ft of the house</>}.
                  </p>
                  {/* The same guard packs/xeric.assert_usable() applies: a count
                      below MIN_WORKABLE is not a palette, it is what survived the
                      filter, and saying so is more useful than showing eight cards. */}
                  {plants.length < SITE_RULES.minWorkable ? (
                    <p className="xpdb-site-held">
                      That is not enough to plant from. A xeriscape needs enough species
                      to carry structure, season-long bloom and a substitute for whatever
                      the nursery is short of — under {SITE_RULES.minWorkable} there is
                      nothing to compose with. Widen the distance from the house, or
                      clear the other filters.
                    </p>
                  ) : plants.length < SITE_RULES.thinWorkable && (
                    <p className="xpdb-site-held">
                      Thin for a design that needs seasonal succession and a substitute
                      for anything the nursery is short of.
                    </p>
                  )}
                  {heldCount > 0 && (
                    <p className="xpdb-site-held">
                      {heldCount} more would qualify on an estimated fire rating.
                      They are held back: every such estimate checked against a
                      published source so far came back lower.
                    </p>
                  )}
                </>
              )}
              <p className="xpdb-site-caveat">
                {measured
                  ? <>Ground measured, house not. A site analysis adds the skyline and
                    the shade it casts, the soil, the snowpack and the building itself —
                    3DEP is bare earth, so nothing standing on your lot is in any of
                    this.</>
                  : <>A first pass. A real analysis measures the slope, aspect, skyline
                    and soil rather than asking — and finds things this cannot.</>}
                <a href="/contact/">Ask for a site analysis →</a>
              </p>
            </div>
          </div>
        )}
      </div>
    );
  };

  const Sidebar = () => (
    <div className="xpdb-filters">
      <button type="button" className="xpdb-filters-toggle"
        aria-expanded={filtersOpen} aria-controls="xpdb-filter-panel"
        onClick={() => setFiltersOpen(o => !o)}>
        <span>Filters{nActive > 0 ? ` (${nActive})` : ""}</span>
        <span aria-hidden="true">{filtersOpen ? "−" : "+"}</span>
      </button>
      <aside id="xpdb-filter-panel"
        className={`xpdb-sidebar${filtersOpen ? "" : " is-collapsed"}`}
        style={{ width:238, flexShrink:0, background:C.sidebar,
        borderRight:`1px solid ${C.border}`, padding:"18px 15px", boxSizing:"border-box" }}>

      {/* On narrow screens the toggle button above already reads "Filters", so this
          heading is hidden there to avoid saying it twice. When it is the row's only
          content the whole row goes too, rather than leaving an empty gap. */}
      <div className={`xpdb-sidebar-head${nActive > 0 ? "" : " is-title-only"}`}
        style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14}}>
        <span className="xpdb-sidebar-title" style={{fontFamily:"'Fraunces',Georgia,serif", fontSize:13, fontWeight:700, letterSpacing:"0.05em", textTransform:"uppercase"}}>Filters</span>
        {nActive > 0 && <button onClick={clearAll} style={{fontSize:11, color:C.accent, background:"none", border:"none", cursor:"pointer", fontFamily:"inherit", fontWeight:700, padding:0}}>Clear {nActive}</button>}
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, synonym, family…"
        style={{ width:"100%", padding:"7px 10px", border:`1px solid ${C.border}`, borderRadius:4, fontSize:12,
          background:"#fff", color:C.text, fontFamily:"inherit", boxSizing:"border-box", marginBottom:18, outline:"none" }} />

      {/* Defensible space */}
      <div style={{marginBottom:18}}>
        <div style={secLabel}>Defensible Space</div>
        <div style={{fontSize:10, color:C.muted, marginBottom:7, lineHeight:1.45}}>
          CSU FS 6.305 · only plants scoring 8+ belong within 30 ft of a structure
        </div>
        {[
          { k:"z12",     l:"HIZ 1–2 OK  (8–10)" },
          { k:"z3",      l:"HIZ 3 only  (5–7.9)" },
          { k:"avoid",   l:"Avoid near structures (<5)" },
          { k:"unrated", l:"Not established" },
        ].map(o => (
          <label key={o.k} style={cbRow}>
            <input type="checkbox" checked={hizF.includes(o.k)} onChange={() => toggle(hizF, setHizF, o.k)} style={{accentColor:C.primary, width:13, height:13}} />
            <span style={{fontSize:11.5}}>{o.l}</span>
          </label>
        ))}
      </div>

      {/* Elevation */}
      <div style={{marginBottom:18}}>
        <div style={secLabel}>Elevation</div>
        <div style={{fontSize:10, color:C.muted, marginBottom:7, lineHeight:1.45}}>Show species whose range includes this elevation</div>
        <select value={elevF} onChange={e => setElevF(Number(e.target.value))} style={selStyle}>
          <option value={0}>Any elevation</option>
          {[4000,5000,6000,7000,7500,8000,8500,9000,10000,11000].map(v =>
            <option key={v} value={v}>{v.toLocaleString()} ft{v === 8000 ? "  (Vail Valley)" : ""}</option>)}
        </select>
      </div>

      {/* Type */}
      <div style={{marginBottom:18}}>
        <div style={secLabel}>Plant Type</div>
        {Object.keys(TYPE_STYLE).map(t => (
          <label key={t} style={cbRow}>
            <input type="checkbox" checked={typeF.includes(t)} onChange={() => toggle(typeF, setTypeF, t)} style={{accentColor:C.primary, width:13, height:13}} />
            <span style={{fontSize:11.5}}>{t}</span>
            <span style={{width:8, height:8, borderRadius:2, background:TYPE_STYLE[t].bar, marginLeft:"auto", flexShrink:0}} />
          </label>
        ))}
      </div>

      {/* Water */}
      <div style={{marginBottom:18}}>
        <div style={secLabel}>Water Use</div>
        {["Very Low","Low","Low-Moderate"].map(w => (
          <label key={w} style={cbRow}>
            <input type="checkbox" checked={waterF.includes(w)} onChange={() => toggle(waterF, setWaterF, w)} style={{accentColor:C.primary, width:13, height:13}} />
            <span style={{fontSize:11.5}}>{w}</span>
          </label>
        ))}
      </div>

      {/* Zone */}
      <div style={{marginBottom:18}}>
        <div style={secLabel}>Hardy To Zone</div>
        <select value={zoneF} onChange={e => setZoneF(Number(e.target.value))} style={selStyle}>
          <option value={0}>Any zone</option>
          {[2,3,4,5,6,7,8,9].map(z => <option key={z} value={z}>Zone {z} or colder</option>)}
        </select>
      </div>

      {/* Human use */}
      <div style={{marginBottom:18}}>
        <div style={secLabel}>Human Use</div>
        <div style={{fontSize:10, color:C.muted, marginBottom:7, lineHeight:1.45}}>
          Documented food, craft, and material traditions
        </div>
        <div style={{display:"flex", flexWrap:"wrap", gap:4, marginBottom:8}}>
          {ALL_USES.map(u => {
            const on = useF.includes(u), st = USE_STYLE[u];
            return (
              <button key={u} onClick={() => toggle(useF, setUseF, u)} style={{
                padding:"3px 7px", borderRadius:3, fontSize:10.5, fontWeight:600, cursor:"pointer",
                fontFamily:"inherit", background: on ? st.border : st.bg,
                color: on ? "#fff" : st.text, border:`1px solid ${st.border}`,
              }}>{u}</button>
            );
          })}
        </div>
        <label style={cbRow}>
          <input type="checkbox" checked={edibleOnly} onChange={e => setEdible(e.target.checked)} style={{accentColor:C.primary, width:13, height:13}} />
          <span style={{fontSize:11.5, fontWeight:500}}>Has documented food use</span>
        </label>
      </div>

      {/* Wildlife value */}
      <div style={{marginBottom:18}}>
        <div style={secLabel}>Wildlife Value</div>
        <div style={{fontSize:10, color:C.muted, marginBottom:7, lineHeight:1.45}}>
          What the species feeds, shelters or hosts. Any selected tag matches.
        </div>
        {WILDLIFE_TAGS.map(({ tag, count }) => (
          <label key={tag} style={cbRow}>
            <input type="checkbox" checked={wildlifeF.includes(tag)}
              onChange={() => toggle(wildlifeF, setWildlifeF, tag)}
              style={{accentColor:C.primary, width:13, height:13}} />
            <span style={{fontSize:11.5}}>{tag}</span>
            <span style={{fontSize:10, color:C.muted, marginLeft:"auto", fontVariantNumeric:"tabular-nums"}}>{count}</span>
          </label>
        ))}
      </div>

      {/* Toggles */}
      <div style={{marginBottom:18}}>
        <div style={secLabel}>Attributes</div>
        {[
          { c:nativeOnly, s:setNative, l:"Native species only" },
          { c:deerOnly,   s:setDeer,   l:"Deer resistant only" },
          { c:psOnly,     s:setPs,     l:"Plant Select® only" },
        ].map(o => (
          <label key={o.l} style={cbRow}>
            <input type="checkbox" checked={o.c} onChange={e => o.s(e.target.checked)} style={{accentColor:C.primary, width:13, height:13}} />
            <span style={{fontSize:11.5, fontWeight:500}}>{o.l}</span>
          </label>
        ))}
      </div>

      <button onClick={exportCSV} style={{ width:"100%", padding:"8px", background:C.primary, color:"#fff",
        border:"none", borderRadius:4, cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:600 }}>
        ↓ Export {plants.length} to CSV
      </button>

      <div style={{marginTop:20, padding:11, background:"rgba(0,0,0,0.05)", borderRadius:4, fontSize:10, color:C.muted, lineHeight:1.6}}>
        <strong style={{color:C.text}}>Ignitability 0–10.</strong> Higher = less ignitable.
        Idaho Firewise method via CSU Ext. FS 6.305 (rev. 7/2025).
        {HAS_ESTIMATES && (
          <span style={{display:"block", marginTop:5}}><strong style={{color:C.text}}>*</strong> = estimated from FS 6.305 criteria, not a published value.</span>
        )}
        <span style={{display:"block", marginTop:5}}>
          <strong style={{color:C.text}}>Unrated</strong> = no published rating exists for that species.
        </span>
        <span style={{display:"block", marginTop:7}}>
          <strong style={{color:C.text}}>Cultural sources.</strong> <b>T</b> tribe-attributed · <b>G</b> general
          {HAS_UNVERIFIED_CULTURE ? <> · <b>V</b> attribution not yet confirmed</> : null}.
        </span>
      </div>
      </aside>
    </div>
  );

  /* ── Card ── */
  const Card = ({ p }) => {
    const ts = TYPE_STYLE[p.type], isOpen = open === p.id;
    return (
      <div onClick={() => setOpen(isOpen ? null : p.id)}
        style={{ background:C.card, borderRadius:5, border:`1px solid ${C.border}`, cursor:"pointer",
          overflow:"hidden", boxShadow: isOpen ? "0 5px 20px rgba(0,0,0,0.13)" : "0 1px 4px rgba(0,0,0,0.06)",
          transition:"box-shadow .15s" }}>
        <div style={{height:4, background:ts.bar}} />
        <div style={{padding:"12px 14px"}}>
          <div style={{display:"flex", justifyContent:"space-between", gap:6}}>
            <div style={{minWidth:0}}>
              {/* stopPropagation so the name navigates while the rest of the card
                  still toggles the detail panel. Without it a click would do both. */}
              <div style={{fontSize:13.5, fontWeight:700, lineHeight:1.3}}>
                <a className="xpdb-name-link" href={`/plants/${p.slug}`} onClick={e => e.stopPropagation()}>{p.common}</a>
              </div>
              <div style={{fontSize:11, color:C.muted, fontStyle:"italic", fontFamily:"Georgia,serif", marginTop:1}}>{p.sci}</div>
              {p.syn && <div style={{fontSize:9.5, color:C.muted, marginTop:2, opacity:0.8}}>syn. {p.syn}</div>}
            </div>
            <div style={{flexShrink:0, textAlign:"right"}}>
              {p.ps && <div style={{fontSize:9, color:C.primary, fontWeight:700, marginBottom:2}}>PLANT SELECT®</div>}
              {!p.native && <div style={{fontSize:9.5, color:C.muted, background:"#eee", padding:"1px 5px", borderRadius:3, display:"inline-block"}}>non-native</div>}
            </div>
          </div>
          <div style={{fontSize:10, color:C.muted, margin:"6px 0 9px"}}>{p.family}</div>

          <div style={{display:"flex", flexWrap:"wrap", gap:5, alignItems:"center", marginBottom:10}}>
            <Chip label={p.type} s={ts} />
            <Chip label={`${p.water} · pf ${p.pf}`} s={WATER_STYLE[p.water]} title="WUCOLS-style plant factor for water budgeting" />
            <IgnDot ign={p.ign} src={p.ignSrc} />
          </div>

          {p.useTags.length > 0 && (
            <div style={{display:"flex", flexWrap:"wrap", gap:4, marginBottom:10}}>
              {p.useTags.map(u => <Chip key={u} label={u} s={USE_STYLE[u]} />)}
              {p.edible && <span style={{fontSize:10.5, color:C.primary, fontWeight:700, alignSelf:"center"}}>· edible: {p.edible.part}</span>}
            </div>
          )}

          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:"5px 8px", fontSize:11, color:C.muted}}>
            <div><b style={{color:C.text}}>Zone</b> {p.zoneMin}–{p.zoneMax}</div>
            <div><b style={{color:C.text}}>Elev</b> {(p.elevMin/1000).toFixed(1)}–{(p.elevMax/1000).toFixed(1)}k ft</div>
            <div><b style={{color:C.text}}>H×W</b> {ft(p.htMin)}–{ft(p.htMax)} × {ft(p.spMax)}</div>
            <div><b style={{color:C.text}}>Bloom</b> {p.bloom}</div>
          </div>
          <div style={{marginTop:7, fontSize:11, color:C.muted}}>{p.sun} · Deer: {p.deer}</div>

          {isOpen && (
            <div style={{marginTop:11, paddingTop:11, borderTop:`1px solid ${C.border}`, fontSize:12, lineHeight:1.62}}>
              <div style={{marginBottom:7}}><b style={{fontSize:10, color:C.muted, textTransform:"uppercase", letterSpacing:"0.05em"}}>Soil</b><br/>{p.soil}</div>
              <div style={{marginBottom:7}}><b style={{fontSize:10, color:C.muted, textTransform:"uppercase", letterSpacing:"0.05em"}}>Wildlife</b><br/>{p.wildlife.join(" · ")}</div>
              <div style={{marginBottom:9}}>{p.notes}</div>

              {p.edible && (
                <div style={{marginBottom:7, padding:"7px 9px", background:"#eef5e4", borderLeft:`3px solid ${C.primary}`, borderRadius:2}}>
                  <b style={{fontSize:10, color:C.primary, textTransform:"uppercase", letterSpacing:"0.05em"}}>Edible · {p.edible.part}</b>
                  {p.edible.prep && <div style={{marginTop:3}}>{p.edible.prep}</div>}
                </div>
              )}

              {p.caution && (
                <div style={{marginBottom:7, padding:"7px 9px", background:"#fbeade", borderLeft:`3px solid ${C.accent}`, borderRadius:2}}>
                  <b style={{fontSize:10, color:C.accent, textTransform:"uppercase", letterSpacing:"0.05em"}}>⚠ Caution</b>
                  <div style={{marginTop:3}}>{p.caution}</div>
                </div>
              )}

              {p.culture && (
                <div style={{padding:"8px 10px", background:"#f2ece0", borderRadius:3, border:`1px solid ${C.border}`}}>
                  <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4}}>
                    <b style={{fontSize:10, color:C.muted, textTransform:"uppercase", letterSpacing:"0.05em"}}>Cultural &amp; material history</b>
                    <span title={SRC_LABEL[p.cultureSrc]} style={{
                      fontSize:9, fontWeight:700, padding:"1px 5px", borderRadius:2,
                      background: p.cultureSrc === "T" ? "#d7ecc9" : p.cultureSrc === "G" ? "#e6e3d8" : "#fbe0cd",
                      color: p.cultureSrc === "T" ? "#2c5216" : p.cultureSrc === "G" ? "#4d4636" : "#7d3208",
                      border:`1px solid ${p.cultureSrc === "T" ? "#7ba33e" : p.cultureSrc === "G" ? "#a49b83" : "#cc7a3b"}`,
                    }}>{p.cultureSrc}{p.cultureSrc === "V" ? " · verify" : ""}</span>
                  </div>
                  <div style={{fontStyle:"italic"}}>{p.culture}</div>
                </div>
              )}
            </div>
          )}
          <div style={{marginTop:8, fontSize:10, color:C.accent, fontWeight:700}}>{isOpen ? "▲ less" : "▼ notes, soil, wildlife"}</div>
        </div>
      </div>
    );
  };

  /* ── Table row ── */
  const Row = ({ p, i }) => {
    const ts = TYPE_STYLE[p.type], isOpen = open === p.id;
    const bgFor = () => isOpen ? "#f0e7d5" : i % 2 ? "#faf5ea" : C.card;
    return (
      <>
        <tr onClick={() => setOpen(isOpen ? null : p.id)}
          style={{background:bgFor(), cursor:"pointer", borderLeft:`3px solid ${ts.bar}`}}
          onMouseEnter={e => e.currentTarget.style.background = "#ebdfc9"}
          onMouseLeave={e => e.currentTarget.style.background = bgFor()}>
          <td style={{padding:"8px 11px"}}>
            <div style={{fontWeight:600, fontSize:12.5}}>
              <a className="xpdb-name-link" href={`/plants/${p.slug}`} onClick={e => e.stopPropagation()}>{p.common}</a>
              {p.ps && <span style={{color:C.primary, fontSize:9, fontWeight:700, marginLeft:5}}>PS®</span>}
            </div>
            <div style={{fontSize:10.5, color:C.muted, fontStyle:"italic", fontFamily:"Georgia,serif"}}>{p.sci}</div>
          </td>
          <td style={{padding:"8px 6px"}}><Chip label={p.type} s={ts} /></td>
          <td style={{padding:"8px 6px"}}><Chip label={p.water} s={WATER_STYLE[p.water]} /></td>
          <td style={{padding:"8px 6px"}}><IgnDot ign={p.ign} src={p.ignSrc} /></td>
          <td style={{padding:"8px 6px", fontSize:11.5, textAlign:"center", color:C.muted, fontVariantNumeric:"tabular-nums"}}>{p.zoneMin}–{p.zoneMax}</td>
          <td style={{padding:"8px 6px", fontSize:11.5, textAlign:"center", color:C.muted, fontVariantNumeric:"tabular-nums"}}>{(p.elevMin/1000).toFixed(1)}–{(p.elevMax/1000).toFixed(1)}k</td>
          <td style={{padding:"8px 6px", fontSize:11.5, textAlign:"center", color:C.muted}}>{ft(p.htMax)}</td>
          <td style={{padding:"8px 6px", fontSize:11.5, textAlign:"center"}}>{p.native ? <b style={{color:C.primary}}>✓</b> : <span style={{color:"#c0c0c0"}}>—</span>}</td>
        </tr>
        {isOpen && (
          <tr style={{background:"#f7efe1"}}>
            <td colSpan={8} style={{padding:"9px 14px 13px 15px", fontSize:12, lineHeight:1.62, borderLeft:`3px solid ${ts.bar}`}}>
              {p.syn && <div style={{fontSize:11, color:C.muted, marginBottom:5}}><b>Synonyms:</b> {p.syn}</div>}
              <div style={{marginBottom:5}}>{p.notes}</div>
              {p.edible && <div style={{marginBottom:4}}><b style={{color:C.primary}}>Edible ({p.edible.part}):</b> {p.edible.prep}</div>}
              {p.caution && <div style={{marginBottom:4, color:"#7d3208"}}><b>⚠ Caution:</b> {p.caution}</div>}
              {p.culture && <div style={{marginBottom:5, fontStyle:"italic"}}><b style={{fontStyle:"normal", color:C.muted}}>[{p.cultureSrc}]</b> {p.culture}</div>}
              <div style={{fontSize:11, color:C.muted}}>
                <b>Soil:</b> {p.soil} &nbsp;·&nbsp; <b>Sun:</b> {p.sun} &nbsp;·&nbsp; <b>Bloom:</b> {p.bloom} &nbsp;·&nbsp;
                <b>Spread:</b> {ft(p.spMin)}–{ft(p.spMax)} &nbsp;·&nbsp; <b>Deer:</b> {p.deer} &nbsp;·&nbsp; <b>Wildlife:</b> {p.wildlife.join(", ")}
              </div>
            </td>
          </tr>
        )}
      </>
    );
  };

  const th = { padding:"9px 6px", fontSize:10, fontWeight:700, color:C.muted, textAlign:"left",
    letterSpacing:"0.05em", textTransform:"uppercase", borderBottom:`2px solid ${C.border}`,
    cursor:"pointer", userSelect:"none", background:C.sidebar, whiteSpace:"nowrap" };

  return (
    <div style={{fontFamily:"'Jost',system-ui,sans-serif", background:C.bg, color:C.text, display:"flex", flexDirection:"column"}}>
      {/* dangerouslySetInnerHTML, not a text child: as a child, the apostrophes and
          ampersands in the @import get HTML-escaped during server rendering but not
          on the client, so React sees a text mismatch, discards the server HTML and
          re-renders the whole tree on the client. Raw CSS has to bypass escaping. */}
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,700;1,400&family=Jost:wght@300;400;500;600;700&display=swap');
        * { box-sizing:border-box; } body { margin:0; }
        ::-webkit-scrollbar { width:5px; height:5px; }
        ::-webkit-scrollbar-thumb { background:#bfae8c; border-radius:3px; }

        /* ── Layout ──────────────────────────────────────────────────────────
           The component no longer owns a scroll region. It used to be a 100vh
           app shell with the sidebar and results scrolling independently, which
           is right standalone but wrong embedded: a page that also scrolls ends
           up with three competing scroll contexts and the wheel does different
           things depending on where the pointer sits. Now the height follows the
           content and the host page does all the scrolling.

           --xpdb-sticky-top lets the host say how far down the sidebar should
           stick, since only the host knows the height of its own fixed header.
           Standalone it falls back to a small gap. */
        .xpdb-sidebar {
          position: sticky;
          top: var(--xpdb-sticky-top, 1rem);
          align-self: flex-start;
          max-height: calc(100vh - var(--xpdb-sticky-top, 1rem) - 1rem);
          overflow-y: auto;
        }
        /* The toggle only exists on narrow screens; wide screens always show the
           panel and ignore the is-collapsed class entirely, so whatever the toggle
           was last set to on a phone cannot leave a desktop user with no filters.
           (No backticks in this comment — it lives inside a template literal, and a
           stray one would terminate the CSS string.) */
        .xpdb-filters-toggle { display: none; }

        /* ── site tuning ── */
        .xpdb-site {
          border: 1.5px solid ${C.primary};
          background: ${C.card};
          margin-bottom: 1rem;
        }
        .xpdb-site-toggle {
          width: 100%; display: flex; justify-content: space-between; align-items: center;
          gap: .75rem; padding: .7rem .9rem; cursor: pointer;
          background: ${C.primary}; color: #fff; border: 0;
          font: 600 .95rem/1 inherit; text-align: left;
        }
        .xpdb-site-body { padding: .9rem; display: flex; flex-direction: column; gap: .5rem; }
        .xpdb-site-lab { font-size: .8rem; color: ${C.muted}; margin-top: .35rem; }
        .xpdb-site-lab b { color: ${C.text}; font-variant-numeric: tabular-nums; }
        .xpdb-site-row { display: flex; flex-wrap: wrap; gap: .3rem; }
        .xpdb-site-row button {
          padding: .3rem .6rem; cursor: pointer; font: 500 .8rem/1 inherit;
          border: 1px solid ${C.border}; background: ${C.bg}; color: ${C.text};
        }
        .xpdb-site-row button.on {
          background: ${C.primary}; color: #fff; border-color: ${C.primary};
        }
        .xpdb-site input[type=range] { width: 100%; accent-color: ${C.primary}; }

        /* ── the address form ── */
        /* The panel spans the full width above the sidebar, which is right for
           the measurement readout and absurd for a single-line text field —
           an address is about 40 characters and an input eleven hundred pixels
           wide invites nobody to type one. Capped at a readable measure; the
           readout below is free to use the whole width. */
        .xpdb-site-addr { display: flex; flex-direction: column; gap: .35rem; max-width: 34rem; }
        .xpdb-site-addr-row { display: flex; gap: .4rem; }
        .xpdb-site-addr-row input {
          flex: 1 1 auto; min-width: 0; padding: .45rem .55rem;
          border: 1px solid ${C.border}; border-radius: 3px; background: #fff;
          color: ${C.text}; font: 400 .85rem/1.3 inherit;
        }
        .xpdb-site-addr-row input:focus-visible {
          outline: 2px solid ${C.primary}; outline-offset: 1px;
        }
        .xpdb-site-addr-row button {
          flex: 0 0 auto; padding: .45rem .8rem; cursor: pointer;
          background: ${C.primary}; color: #fff; border: 1px solid ${C.primary};
          border-radius: 3px; font: 600 .82rem/1.3 inherit;
        }
        .xpdb-site-addr-row button[disabled] { opacity: .5; cursor: default; }
        .xpdb-site-privacy { margin: 0; color: ${C.muted}; font-size: .72rem; line-height: 1.45; }
        .xpdb-site-err {
          margin: 0; padding: .5rem .6rem; font-size: .8rem; line-height: 1.5;
          color: ${C.accent}; background: #fbeee6; border: 1px solid ${C.accent};
          border-radius: 3px;
        }

        /* ── the measurement ── */
        .xpdb-site-meas {
          display: flex; flex-direction: column; gap: .45rem;
          padding: .6rem; background: ${C.bg}; border: 1px solid ${C.border};
        }
        .xpdb-site-matched { margin: 0; font-size: .82rem; color: ${C.text}; }
        /* auto-fit rather than a fixed two columns: at full width the four facts
           read as one row, and they reflow to two and then one as the panel
           narrows, without a breakpoint for each step. */
        .xpdb-site-facts {
          margin: 0; display: grid; gap: .4rem 1.4rem;
          grid-template-columns: repeat(auto-fit, minmax(9rem, max-content));
        }
        .xpdb-site-facts > div { display: flex; flex-direction: column; }
        .xpdb-site-facts dt {
          font-size: .66rem; letter-spacing: .07em; text-transform: uppercase;
          color: ${C.muted}; font-weight: 700;
        }
        .xpdb-site-facts dd {
          margin: 0; font-size: .92rem; color: ${C.text}; font-weight: 600;
          font-variant-numeric: tabular-nums;
        }
        /* Prose wants a measure. These notes are the most important text in the
           panel and at 1,200px they were single lines running the full width. */
        .xpdb-site-prov { margin: 0; color: ${C.muted}; font-size: .74rem; line-height: 1.5; max-width: 62ch; }
        .xpdb-site-held, .xpdb-site-caveat, .xpdb-site-err { max-width: 62ch; }
        .xpdb-site-onlyask { color: ${C.muted}; font-size: .72rem; font-style: italic; }
        .xpdb-site-manual {
          display: flex; flex-direction: column; gap: .35rem;
          padding-top: .55rem; border-top: 1px dashed ${C.border};
        }
        /* A button that reads as a link: it changes what is on screen rather
           than navigating, so it must not be an anchor. */
        .xpdb-linkish {
          background: none; border: 0; padding: 0; cursor: pointer;
          color: ${C.primary}; font-family: inherit; font-size: .74rem; font-weight: 600;
          text-decoration: underline; text-underline-offset: 2px;
        }
        .xpdb-site-adjust { align-self: flex-start; }

        /* ── the map ── */
        .xpdb-map {
          display: flex; flex-direction: column; gap: .4rem;
          padding: .6rem; border: 1px solid ${C.border}; background: ${C.bg};
          max-width: 34rem;
        }
        .xpdb-map-head { display: flex; justify-content: space-between; align-items: center; gap: .5rem; }
        .xpdb-map-layers, .xpdb-map-zoom, .xpdb-map-which { display: flex; gap: .25rem; align-items: center; }
        .xpdb-map-layers button, .xpdb-map-which button, .xpdb-map-zoom button {
          padding: .2rem .5rem; cursor: pointer; font: 500 .75rem/1.4 inherit;
          border: 1px solid ${C.border}; background: #fff; color: ${C.text}; border-radius: 3px;
        }
        .xpdb-map-layers button.on, .xpdb-map-which button.on {
          background: ${C.primary}; color: #fff; border-color: ${C.primary};
        }
        .xpdb-map-zoom button { width: 1.7rem; text-align: center; font-weight: 700; }
        .xpdb-map-zoom button[disabled] { opacity: .35; cursor: default; }
        .xpdb-map-zoom span {
          font-size: .7rem; color: ${C.muted}; min-width: 3.2rem; text-align: center;
          font-variant-numeric: tabular-nums;
        }

        /* Square, because the bbox is square. Any other aspect ratio would
           stretch the imagery and put the pins in the wrong place. */
        .xpdb-map-stage {
          position: relative; width: 100%; aspect-ratio: 1 / 1;
          overflow: hidden; border: 1px solid ${C.border}; background: #ded7c6;
          touch-action: none;   /* or the browser pans the page instead of the map */
          cursor: crosshair;
          /* The stage, not the image, now receives every pointer event: it is
             the one element that stays put while the tile layer inside it is
             being translated mid-drag. */
        }
        /* ── the tile layer ──
           Tiles are absolutely positioned at fractional offsets and are each
           exactly one stage wide, so the layer can be translated as a unit
           during a pan and the compositor does the work. will-change keeps it
           on its own layer so a drag never repaints the pins or the overlays. */
        .xpdb-map-tiles, .xpdb-map-ghost {
          position: absolute; inset: 0;
          will-change: transform;
        }
        .xpdb-map-ghost { z-index: 0; }
        .xpdb-map-tiles { z-index: 1; }
        .xpdb-tile {
          position: absolute; display: block;
          user-select: none; -webkit-user-drag: none;
          /* A hairline of the stage background shows between tiles at
             fractional device-pixel offsets otherwise, and a grid of seams
             across aerial photography reads as a rendering fault. */
          outline: 0.5px solid transparent;
        }

        /* ── overlays ──
           All three share the stage's fractional coordinate space via a 0..1
           viewBox, so they pan and zoom with the tiles without any per-shape
           arithmetic. non-scaling-stroke keeps the outlines one weight at every
           zoom; without it a stroke in a 0..1 space renders invisibly thin. */
        .xpdb-map-fp, .xpdb-map-house, .xpdb-map-trace {
          position: absolute; inset: 0; z-index: 2;
          pointer-events: none; overflow: visible;
        }
        .xpdb-map-fp polygon {
          fill: ${C.accent}22; stroke: ${C.accent}; stroke-width: 1.5px;
          vector-effect: non-scaling-stroke;
        }
        .xpdb-map-fp polygon.chosen { fill: transparent; stroke: transparent; }
        .xpdb-map-house polygon {
          fill: ${C.accent}44; stroke: ${C.accent}; stroke-width: 2.5px;
          vector-effect: non-scaling-stroke;
          paint-order: stroke;
        }
        .xpdb-map-trace polyline {
          fill: none; stroke: ${C.accent}; stroke-width: 2px;
          stroke-dasharray: 5 4; vector-effect: non-scaling-stroke;
        }
        .xpdb-map-trace circle { fill: ${C.accent}; }

        /* ── marking the house ── */
        .xpdb-house-modes { margin-top: 6px; }
        .xpdb-trace-controls { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
        .xpdb-trace-controls button {
          font: inherit; font-size: 12px; padding: 3px 9px; cursor: pointer;
          border: 1px solid ${C.border}; background: ${C.card}; color: ${C.text};
          border-radius: 3px;
        }
        .xpdb-trace-controls button:disabled { opacity: 0.45; cursor: default; }
        .xpdb-house-said {
          font-size: 12px; line-height: 1.5; margin: 6px 0 0;
          color: ${C.muted}; border-left: 2px solid ${C.accent}; padding-left: 8px;
        }
        .xpdb-pin {
          position: absolute; transform: translate(-50%, -50%); z-index: 3;
          font-size: 1.05rem; line-height: 1; pointer-events: none;
          text-shadow: 0 0 3px #fff, 0 0 6px #fff, 0 0 2px #fff;
        }
        .xpdb-pin-plant { color: ${C.primary}; }
        .xpdb-pin-house { color: ${C.accent}; }
        .xpdb-pin.active { font-size: 1.35rem; font-weight: 700; }

        .xpdb-map-controls {
          display: flex; justify-content: space-between; align-items: center;
          gap: .5rem; flex-wrap: wrap;
        }
        .xpdb-map-two { display: flex; align-items: center; gap: .35rem; font-size: .75rem; color: ${C.text}; cursor: pointer; }
        .xpdb-map-two input { accent-color: ${C.primary}; }
        .xpdb-map-tip { margin: 0; font-size: .72rem; color: ${C.muted}; line-height: 1.45; }
        .xpdb-map-dist { margin: 0; font-size: .8rem; color: ${C.text}; }
        .xpdb-map-dist b { color: ${C.primary}; }
        .xpdb-map-stale {
          margin: 0; padding: .4rem .5rem; font-size: .76rem; line-height: 1.45;
          color: ${C.accent}; background: #fbeee6; border: 1px solid ${C.accent}; border-radius: 3px;
        }
        .xpdb-map-measure {
          padding: .45rem .8rem; cursor: pointer; align-self: flex-start;
          background: ${C.primary}; color: #fff; border: 1px solid ${C.primary};
          border-radius: 3px; font: 600 .82rem/1.3 inherit;
        }
        .xpdb-map-measure[disabled] { opacity: .5; cursor: default; }
        .xpdb-site-out {
          margin-top: .6rem; padding-top: .7rem; border-top: 1px solid ${C.border};
          font-size: .85rem; color: ${C.text}; display: flex; flex-direction: column; gap: .4rem;
        }
        .xpdb-site-count b { font-size: 1.15rem; color: ${C.primary}; }
        .xpdb-site-nope b { color: ${C.accent}; }
        .xpdb-site-held { color: ${C.accent}; font-size: .8rem; }
        .xpdb-site-caveat { color: ${C.muted}; font-size: .78rem; line-height: 1.45; }
        .xpdb-site-caveat a { color: ${C.primary}; font-weight: 600; margin-left: .35rem; }

        @media (max-width: 860px) {
          /* Below this the 238px sidebar left ~135px for results on a phone —
             narrower than a single card. Stack instead. */
          .xpdb-layout { flex-direction: column; }
          .xpdb-filters { width: 100%; }
          .xpdb-sidebar {
            width: 100% !important;
            position: static;
            max-height: none;
            overflow: visible;
            border-right: none !important;
            border-bottom: 1px solid ${C.border};
          }
          .xpdb-sidebar.is-collapsed { display: none; }
          /* The toggle supplies the "Filters" label here, so the panel's own heading
             would be a second one directly beneath it. !important throughout: these
             elements carry inline style objects, which beat a plain class rule. */
          .xpdb-sidebar-title { display: none !important; }
          .xpdb-sidebar-head { justify-content: flex-end !important; }
          .xpdb-sidebar-head.is-title-only { display: none !important; }
          .xpdb-filters-toggle {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            width: 100%;
            padding: 12px 15px;
            cursor: pointer;
            font-family: 'Fraunces', Georgia, serif;
            font-size: 13px;
            font-weight: 700;
            letter-spacing: 0.05em;
            text-transform: uppercase;
            color: ${C.text};
            background: ${C.sidebar};
            border: none;
            border-bottom: 1px solid ${C.border};
          }
          .xpdb-main { padding: 14px 15px !important; }
          /* The sidebar is full-width here, so the fact grid has room to stay
             two-up; below 420px it does not. */
          .xpdb-site-addr-row { flex-wrap: wrap; }
          .xpdb-site-addr-row input { flex-basis: 100%; }
        }

        /* Species names link to their full page. Inherit the surrounding type so the
           cards do not turn into a wall of blue underlines; the affordance shows on
           hover and focus instead. */
        .xpdb-name-link {
          color: inherit;
          text-decoration: none;
        }
        .xpdb-name-link:hover { text-decoration: underline; text-underline-offset: 2px; }
        .xpdb-name-link:focus-visible {
          outline: 2px solid ${C.accent};
          outline-offset: 2px;
          border-radius: 2px;
        }
      ` }} />

      <header style={{ background:C.deep, color:"#f1ebd9", padding:"15px 26px", display:"flex",
        alignItems:"center", justifyContent:"space-between", borderBottom:`3px solid ${C.accent}`, flexShrink:0 }}>
        <div>
          <h1 style={{margin:0, fontFamily:"'Fraunces',Georgia,serif", fontWeight:700, fontSize:21, lineHeight:1.1}}>
            Xeric Plant Database <span style={{fontSize:12, color:C.accent, fontWeight:400}}>v3</span>
          </h1>
          <div style={{fontSize:10.5, color:"#a5c096", marginTop:3, letterSpacing:"0.06em", textTransform:"uppercase"}}>
            Intermountain West · CSU FS 6.305 ignitability · Ute (Nuche) homeland · Plant Select® trials
          </div>
        </div>
        <div style={{display:"flex", alignItems:"center", gap:12}}>
          <span style={{fontSize:12.5, color:"#a5c096"}}>{plants.length} / {PLANTS.length} species</span>
          <div style={{background:"rgba(255,255,255,0.09)", borderRadius:4, display:"flex", overflow:"hidden", border:"1px solid rgba(255,255,255,0.14)"}}>
            {["cards","table"].map(m => (
              <button key={m} onClick={() => setView(m)} style={{ padding:"6px 13px", fontSize:11.5, fontWeight:600,
                fontFamily:"inherit", border:"none", cursor:"pointer",
                background: view === m ? C.accent : "transparent", color: view === m ? "#fff" : "#a5c096" }}>
                {m === "cards" ? "⊞ Cards" : "≡ Table"}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* No `flex:1` / `minHeight:0` here any more: both existed to make the row
          fill a 100vh shell so its children could scroll internally. Height now
          follows content and the host page scrolls. */}
      {/* Sidebar(), NOT <Sidebar />.
          Sidebar, Card and Row are declared inside this component, so each render
          creates a fresh function identity. Rendered as an ELEMENT that reads to
          React as a different component type every time, and it responds by
          unmounting the old subtree and mounting a new one — destroying and
          rebuilding the real DOM nodes.

          For the search box that was fatal: every keystroke re-created the <input>,
          so it lost focus and mobile browsers dismissed the keyboard after a single
          letter. Calling these as plain functions inlines their JSX into this
          component's tree, so the DOM is reconciled in place and the input
          survives. It also stops all 100 cards being torn down per keystroke. */}
      {SitePanel()}

      <div className="xpdb-layout" style={{display:"flex"}}>
        {Sidebar()}
        {/* min-width:0 keeps the results column from being forced wider than its
            share by the table view's content. */}
        <main className="xpdb-main" style={{flex:1, minWidth:0, padding:"18px 22px"}}>
          <div style={{display:"flex", alignItems:"center", gap:14, marginBottom:15, paddingBottom:11, borderBottom:`1px solid ${C.border}`, flexWrap:"wrap"}}>
            <span style={{fontSize:11.5, color:C.muted, fontWeight:500}}>Sort</span>
            {[["common","Name"],["sci","Scientific"],["type","Type"],["ign","Ignitability"],["zone","Zone"],["elev","Max elev"],["height","Height"]].map(([k,l]) => (
              <button key={k} onClick={() => doSort(k)} style={{ fontSize:11.5, fontWeight: sortBy === k ? 700 : 400,
                color: sortBy === k ? C.primary : C.muted, background:"none", border:"none", cursor:"pointer", fontFamily:"inherit", padding:"2px 3px" }}>
                {l}<SortArrow active={sortBy === k} dir={sortDir} />
              </button>
            ))}
          </div>

          {plants.length === 0 ? (
            <div style={{textAlign:"center", padding:70, color:C.muted}}>
              <div style={{fontSize:30, marginBottom:10}}>🌾</div>
              <div style={{fontFamily:"'Fraunces',Georgia,serif", fontSize:17}}>No species match those filters</div>
              <button onClick={clearAll} style={{marginTop:14, padding:"8px 20px", background:C.primary, color:"#fff", border:"none", borderRadius:4, cursor:"pointer", fontFamily:"inherit", fontSize:12.5}}>Clear filters</button>
            </div>
          ) : view === "cards" ? (
            <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(268px, 1fr))", gap:13}}>
              {/* Keyed Fragment so the list still reconciles by id, while Card
                  itself is called rather than mounted — see the note above. */}
              {plants.map(p => <Fragment key={p.id}>{Card({ p })}</Fragment>)}
            </div>
          ) : (
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%", borderCollapse:"collapse"}}>
                <thead><tr>
                  {[["common","Name"],["type","Type"],["water","Water"],["ign","Ignitability"],["zone","Zone"],["elev","Elev (k ft)"],["height","Max H"],["native","Native"]].map(([k,l]) =>
                    <th key={k} style={th} onClick={() => doSort(k)}>{l}<SortArrow active={sortBy === k} dir={sortDir} /></th>)}
                </tr></thead>
                <tbody>{plants.map((p,i) => <Fragment key={p.id}>{Row({ p, i })}</Fragment>)}</tbody>
              </table>
            </div>
          )}

          <div style={{marginTop:28, paddingTop:14, borderTop:`1px solid ${C.border}`, fontSize:10.5, color:C.muted, lineHeight:1.75}}>
            <strong style={{color:C.text}}>Sources.</strong> Ignitability ratings and elevation ranges: Colorado State University Extension &amp; Colorado State Forest Service,
            <em> Ignition-Resistant Landscape Plants</em>, Fact Sheet 6.305 (rev. July 2025), applying the Idaho Firewise 0–10 methodology.
            High-altitude performance: Plant Select® mountain trials, tested to 8,150 ft near Steamboat Springs.
            Nomenclature follows POWO where it diverges from USDA PLANTS; synonyms are listed because nursery availability tracks the older names.
            Cultural and material uses draw on the standard ethnobotanical literature, principally Moerman, D. E., <em>Native American Ethnobotany</em> (Timber Press, 1998)
            and the associated Native American Ethnobotany Database (naeb.brit.org), which supplies group-level attribution and a source citation for each recorded use.
            <span style={{display:"block", marginTop:6}}>
              <strong style={{color:C.text}}>Verify before specifying.</strong>{" "}
              {HAS_ESTIMATES
                ? <>Ratings marked <strong>*</strong> are estimated from the FS 6.305 criteria rather than published for that species, and elevation ceilings are approximate. </>
                : <>Species shown as <strong>unrated</strong> have no published ignitability rating; elevation ceilings are approximate. </>}
              Confirm defensible-space requirements with your local fire authority — jurisdictions vary.
            </span>
            {/* Written for whoever is READING this, not for whoever maintains it.
                The authoring rules that used to live here — name the nation, present
                tense, no medicinal dosage, don't carry forward slurs from older
                references — are recorded in the project's CLAUDE.md, which is where
                guidance for the maintainer belongs. They were never information for a
                visitor, and on a public deployment they read as leaked instructions. */}
            <span style={{display:"block", marginTop:8, padding:"9px 11px", background:"rgba(157,74,26,0.07)", borderLeft:`3px solid ${C.accent}`, borderRadius:2}}>
              <strong style={{color:C.text}}>About the cultural notes.</strong> This database covers the homeland of the Nuche (Ute); Eagle County in particular was
              summered by the Yampa and Parianuche bands. Three federally recognized tribes carry that continuity today — the Southern Ute Indian Tribe, the
              Ute Mountain Ute Tribe, and the Ute Indian Tribe of the Uintah and Ouray Reservation. These are living practices, described in the present tense.
              Medicinal preparation and dosage are deliberately not documented here.
              {HAS_UNVERIFIED_CULTURE
                ? <> Entries flagged <strong>V</strong> are widely repeated but their attribution is not yet confirmed against NAEB.</>
                : null}
              {" "}Edible entries record that a plant <em>has</em> a food history; they are not a recommendation that anyone eat it, and foraging guidance is
              outside the scope of a design reference.
            </span>
          </div>
        </main>
      </div>
    </div>
  );
}
