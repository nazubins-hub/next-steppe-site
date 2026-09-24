/**
 * Areas, perimeters, centroids, and the gap from a bed's edge to a wall.
 *
 * MIRROR of plant-system/ui/template.jsx between the markers (see rules.js),
 * which is itself scripts/geometry.py line for line. THREE implementations of
 * the same measurement now exist — the pipeline's, the public browser's and this
 * one — and the whole point of them agreeing is that a client is never shown one
 * area on a website, a second in the studio and a third on a planting plan.
 * Change it in geometry.py first.
 */

import { GEO, M2_PER_FT2, M_PER_FT, SITE_RULES, round1 } from './rules.js';

/* @mirror geometry */

/* Ray casting on a lon/lat ring, for taps: which footprint, which bed. The
   distance arithmetic below uses pointInRing on projected metres, where a
   planting area inside the outline measures zero — a courtyard, a light well,
   or much more likely a mis-tap, and either way not "so far from the wall". */
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

/* ═══════════════ THE BED IS A SHAPE TOO ═══════════════

   One ✽ pin answered "how far from the house?" from wherever someone tapped,
   and a bed is not a point. Its nearest edge is what the fire bands are about,
   its area is what the planting is sized from, and the ground under it is what
   the terrain read should describe. So beds are traced like the house, and
   measured the way the paid analysis measures them.

   THESE ARE PORTS, NOT LOOK-ALIKES. scripts/geometry.py measures the same
   outlines when the office feeds them to a site analysis, and a visitor must
   not be shown one area or one distance to the wall here and another there.
   So what follows is geometry.py line for line: the same equirectangular
   projection about the mean of every vertex drawn, the same shoelace, the same
   area centroid, the same edge-to-edge gap with overlap counted as zero — and
   the constants arrive through SITE_RULES.geometry rather than being typed.

   The house is measured the same way whatever it is. A traced ring and a
   tapped footprint are rings; a lone pin is a ring of one vertex, which the
   gap arithmetic handles as the point it is. */

/* geometry._project: lon/lat to metres east/north about (lat0, lon0). */
function projectAbout(ring, lat0, lon0) {
  const kx = GEO.mPerDegLonEq * Math.cos((lat0 * Math.PI) / 180);
  return ring.map(([lon, lat]) => [(lon - lon0) * kx, (lat - lat0) * GEO.mPerDegLat]);
}

/* geometry._shoelace: signed area of a projected ring, square metres. */
function shoelace(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/* geometry._centroid: the AREA centroid. The vertex mean drifts toward
   whichever edge was clicked most, and on a traced curve that is the curve. */
function centroidXY(pts) {
  const a = shoelace(pts);
  if (Math.abs(a) < 1e-9) {
    return [pts.reduce((t, p) => t + p[0], 0) / pts.length,
            pts.reduce((t, p) => t + p[1], 0) / pts.length];
  }
  let cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    const cross = x1 * y2 - x2 * y1;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  return [cx / (6 * a), cy / (6 * a)];
}

/* geometry._perimeter */
function perimeterM(pts) {
  let p = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    p += Math.hypot(x2 - x1, y2 - y1);
  }
  return p;
}

/* geometry._seg_distance */
function segDistM(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L2 = dx * dx + dy * dy;
  if (L2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/* geometry._in_ring: planar ray casting, in whatever x/y it is given. */
function pointInRing(pts, x, y) {
  let inside = false;
  for (let i = 0, n = pts.length; i < n; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % n];
    if ((y1 > y) !== (y2 > y) && x1 + ((y - y1) * (x2 - x1)) / (y2 - y1) > x) inside = !inside;
  }
  return inside;
}

/* geometry._orient, _on_segment, _segments_cross */
const orient = (a, b, c) => {
  const v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  return (v > 1e-12) - (v < -1e-12);
};
const onSegment = (a, b, p) =>
  Math.min(a[0], b[0]) - 1e-12 <= p[0] && p[0] <= Math.max(a[0], b[0]) + 1e-12 &&
  Math.min(a[1], b[1]) - 1e-12 <= p[1] && p[1] <= Math.max(a[1], b[1]) + 1e-12;
function segmentsCross(a1, a2, b1, b2) {
  const o1 = orient(a1, a2, b1), o2 = orient(a1, a2, b2);
  const o3 = orient(b1, b2, a1), o4 = orient(b1, b2, a2);
  if (o1 !== o2 && o3 !== o4) return true;
  return (o1 === 0 && onSegment(a1, a2, b1)) || (o2 === 0 && onSegment(a1, a2, b2)) ||
         (o3 === 0 && onSegment(b1, b2, a1)) || (o4 === 0 && onSegment(b1, b2, a2));
}

/* geometry._rings_overlap. Containment catches a bed drawn inside the house;
   crossing edges catch two outlines laid across each other; each misses what
   the other finds. */
function ringsOverlap(a, b) {
  for (const [ring, other] of [[a, b], [b, a]]) {
    if (other.length >= 3 && ring.some(([x, y]) => pointInRing(other, x, y))) return true;
  }
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      if (segmentsCross(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return true;
    }
  }
  return false;
}

/* geometry.ring_gap_m: edge to edge, never centre to centre, and overlap is
   zero — a bed drawn over the house is HIZ 0, not "3 m from its own wall". */
function ringGapM(a, b) {
  if (ringsOverlap(a, b)) return 0;
  let best = Infinity;
  for (const [ring, other] of [[a, b], [b, a]]) {
    for (const p of ring) {
      for (let i = 0; i < other.length; i++) {
        const d = segDistM(p, other[i], other[(i + 1) % other.length]);
        if (d < best) best = d;
      }
    }
  }
  return best;
}

/* The ring a house is measured as. */
const houseRing = house =>
  !house ? null : house.kind === "point" ? [[house.lon, house.lat]] : house.ring;

/* Every traced shape measured at once, the way geometry.measure() does it: one
   projection about the mean of all their vertices, so each bed's area and its
   gap to the house come out of the same flat frame the pipeline builds.
   `shapes` are {id, ring}. With no beds the planting pin rides along as a ring
   of one vertex, which gives it a distance and no area. */
function measureOutline(house, shapes) {
  const hr = houseRing(house);
  const all = [...shapes.flatMap(s => s.ring), ...(hr || [])];
  if (!all.length) return {};
  const lat0 = all.reduce((t, p) => t + p[1], 0) / all.length;
  const lon0 = all.reduce((t, p) => t + p[0], 0) / all.length;
  const kx = GEO.mPerDegLonEq * Math.cos((lat0 * Math.PI) / 180);
  const hp = hr ? projectAbout(hr, lat0, lon0) : null;
  const out = {};
  for (const s of shapes) {
    const pts = projectAbout(s.ring, lat0, lon0);
    const area = Math.abs(shoelace(pts));
    const [cx, cy] = centroidXY(pts);
    const rec = {
      areaM2: round1(area),
      areaFt2: round1(area / M2_PER_FT2),
      perimeterFt: round1(perimeterM(pts) / M_PER_FT),
      lat: lat0 + cy / GEO.mPerDegLat,
      lon: lon0 + cx / kx,
      // How far the shape reaches from its own centre: what a terrain read
      // over it has to cover.
      extentM: Math.max(0, ...pts.map(([x, y]) => Math.hypot(x - cx, y - cy))),
    };
    if (hp) {
      rec.fromStructureFt = round1(ringGapM(pts, hp) / M_PER_FT);
      // The far end, only to say when one bed spans two bands.
      rec.farFt = round1(Math.max(...pts.map(p =>
        hp.length >= 3 && pointInRing(hp, p[0], p[1]) ? 0
          : Math.min(...hp.map((q, i) => segDistM(p, q, hp[(i + 1) % hp.length]))))) / M_PER_FT);
    }
    out[s.id] = rec;
  }
  return out;
}

/* How wide a terrain read over a bed must be: the analysis radius, or enough
   to contain the bed if it reaches further. Whole metres, as the pipeline
   recommends its own. */
const bedRadiusM = geo =>
  Math.max(SITE_RULES.analysisRadiusM, Math.ceil(geo ? geo.extentM : 0));

/* An identity for a ring, so a stored reading knows whether the bed it
   describes has since been redrawn. */
const ringSig = ring => ring.map(([lon, lat]) => `${lon.toFixed(7)},${lat.toFixed(7)}`).join(";");

/* geometry._dedupe: a tap that lands twice on one spot is one corner, and a
   ring that ends where it began has not gained a corner by it. */
function dedupeRing(ring) {
  const out = [];
  for (const p of ring) {
    const q = out[out.length - 1];
    if (!q || Math.abs(p[0] - q[0]) > 1e-12 || Math.abs(p[1] - q[1]) > 1e-12) out.push(p);
  }
  if (out.length > 1 && Math.abs(out[0][0] - out[out.length - 1][0]) < 1e-12 &&
      Math.abs(out[0][1] - out[out.length - 1][1]) < 1e-12) out.pop();
  return out;
}

/* Area of one ring about its own centre: the live readout while tracing, and
   the sliver check on closing. */
function ringAreaM2(ring) {
  const lat0 = ring.reduce((t, p) => t + p[1], 0) / ring.length;
  const lon0 = ring.reduce((t, p) => t + p[0], 0) / ring.length;
  return Math.abs(shoelace(projectAbout(ring, lat0, lon0)));
}

/* An outline that crosses itself has no single inside, and its shoelace area
   is the difference of its lobes — a figure-eight bed can measure near zero.
   Edges that share a corner are neighbours, not a crossing. */
function ringSelfCrosses(ring) {
  const lat0 = ring.reduce((t, p) => t + p[1], 0) / ring.length;
  const lon0 = ring.reduce((t, p) => t + p[0], 0) / ring.length;
  const pts = projectAbout(ring, lat0, lon0);
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segmentsCross(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true;
    }
  }
  return false;
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
/* @end-mirror geometry */

export {
  ringContains,
  projectAbout,
  shoelace,
  centroidXY,
  perimeterM,
  segDistM,
  pointInRing,
  orient,
  onSegment,
  segmentsCross,
  ringsOverlap,
  ringGapM,
  houseRing,
  measureOutline,
  bedRadiusM,
  ringSig,
  dedupeRing,
  ringAreaM2,
  ringSelfCrosses,
  houseAnchor,
};
