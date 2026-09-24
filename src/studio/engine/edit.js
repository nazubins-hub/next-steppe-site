/**
 * Editing an outline after it is drawn: move a corner, add one, take one away.
 *
 * NOT a mirror — the public tool has no editing and is not getting any. Traced a
 * bed, then saw the wall was two feet further out? On the website the answer is
 * "draw it again". That is a fair answer for a visitor sizing up an idea and a
 * poor one for the drawing a planting plan is measured from, which is the whole
 * reason the studio exists.
 *
 * WHAT MAKES AN EDIT LEGAL
 * The same three rules closeTrace applies to a new bed, applied again after every
 * change, because an edit can break a shape that was fine: at least three
 * corners, no self-crossing, and an area over GEO.minAreaM2. A move that breaks
 * one of them is refused with the reason rather than quietly written — a bow-tie
 * polygon measures a nonsense area, and geometry.py would measure the same
 * nonsense from the export.
 *
 * WHY HIT-TESTING IS ARITHMETIC AND NOT DOM EVENTS
 * The same reason the map's taps are: the stage is a grid of <img> tiles with SVG
 * over it, and a corner handle is a few pixels wide. Distance in stage fractions,
 * compared against a radius in pixels, is exact and works identically for a mouse
 * and a fingertip — which needs a bigger radius, not different code.
 */

import { GEO, round1 } from './rules.js';
import { mapFractionOf, mapPointAt } from './tiles.js';
import { dedupeRing, ringAreaM2, ringSelfCrosses } from './geometry.js';
import { r7 } from './outline.js';

/* A mouse is precise and a fingertip is not. 12 px is about a corner handle; 22
   is roughly the pad of a finger at this scale, measured on an iPhone. */
export const HIT_PX = 12;
export const TOUCH_HIT_PX = 22;

/* ── finding what is under the pointer ─────────────────────────────────────── */

/* The corner nearest (fx, fy), or null if none is within `hitPx`. `size` is the
   stage's pixel size, which is what turns a fraction back into pixels. */
export function nearestVertex(view, ring, fx, fy, size, hitPx = HIT_PX) {
  let best = null;
  ring.forEach(([lon, lat], i) => {
    const [vx, vy] = mapFractionOf(view, lat, lon);
    const d = Math.hypot((vx - fx) * size, (vy - fy) * size);
    if (d <= hitPx && (!best || d < best.d)) best = { i, d };
  });
  return best;
}

/* The edge nearest (fx, fy) — returned as the index to insert BEFORE, so a new
   corner lands between the two it was dragged from. Ignores a point that is
   nearer a corner than an edge, so grabbing a corner never inserts one. */
export function nearestEdge(view, ring, fx, fy, size, hitPx = HIT_PX) {
  if (ring.length < 2) return null;
  let best = null;
  for (let i = 0; i < ring.length; i += 1) {
    const [alon, alat] = ring[i];
    const [blon, blat] = ring[(i + 1) % ring.length];
    const [ax, ay] = mapFractionOf(view, alat, alon);
    const [bx, by] = mapFractionOf(view, blat, blon);
    const vx = (bx - ax) * size;
    const vy = (by - ay) * size;
    const wx = (fx - ax) * size;
    const wy = (fy - ay) * size;
    const len2 = vx * vx + vy * vy;
    if (!len2) continue;
    const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2));
    const d = Math.hypot(wx - t * vx, wy - t * vy);
    /* Not at the very ends: that is a corner's business. */
    if (t <= 0.02 || t >= 0.98) continue;
    if (d <= hitPx && (!best || d < best.d)) best = { at: i + 1, d, t };
  }
  return best;
}

/* ── changing a ring ───────────────────────────────────────────────────────── */

/* Every edit goes through here, so nothing can write a shape that would measure
   as nonsense. Returns {ring} or {error}. */
function vet(ring, what) {
  /* De-duplicated first, and deliberately: a corner dragged onto its neighbour is
     one corner, not two, and geometry.py's read drops it either way. Refusing here
     would leave the studio showing a four-corner bed the pipeline measures as a
     triangle, which is the disagreement this whole engine exists to avoid. */
  const clean = dedupeRing(ring);
  if (clean.length < 3) {
    return { error: `${what} needs at least three corners.` };
  }
  if (ringSelfCrosses(clean)) {
    return { error: `${what} would cross itself there. Undo, or move it further.` };
  }
  const area = ringAreaM2(clean);
  if (area < GEO.minAreaM2) {
    return { error: `${what} would be ${round1(area)} m² — too small to measure.` };
  }
  return { ring: clean };
}

export function moveVertex(view, ring, i, fx, fy, what = 'That shape') {
  const [lat, lon] = mapPointAt(view, fx, fy);
  const next = ring.map((pt, j) => (j === i ? [r7(lon), r7(lat)] : pt));
  return vet(next, what);
}

export function insertVertex(view, ring, at, fx, fy, what = 'That shape') {
  const [lat, lon] = mapPointAt(view, fx, fy);
  const next = [...ring.slice(0, at), [r7(lon), r7(lat)], ...ring.slice(at)];
  const res = vet(next, what);
  return res.error ? res : { ...res, index: at };
}

export function deleteVertex(ring, i, what = 'That shape') {
  if (ring.length <= 3) {
    return { error: `${what} is already down to three corners.` };
  }
  return vet(ring.filter((_, j) => j !== i), what);
}

/* ── names ─────────────────────────────────────────────────────────────────────
   geometry.py builds `{name: ring}` when it writes plan.json, so two beds with
   one name are not two beds: the second silently takes the first's ring, and
   every area, distance and planting that follows is measured from the wrong
   shape. Nothing downstream can detect it, which makes it exactly the kind of
   thing to refuse at the point of typing.

   Compared case-insensitively and with the edges trimmed, because "front bed"
   and "Front Bed " are the same name to a person and would be two keys to a
   dict. "House" is reserved: that is what the building feature is called. */
export const NAME_MAX = 60;

const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ');
const key = (s) => norm(s).toLowerCase();

export function nameError(name, { taken = [], reserved = ['house'] } = {}) {
  const n = norm(name);
  if (!n) return 'A name is needed — the pipeline joins beds by name.';
  if ([...n].length > NAME_MAX) return `Names are at most ${NAME_MAX} characters.`;
  if (reserved.includes(key(n))) return `"${n}" is reserved for the building outline.`;
  if (taken.map(key).includes(key(n))) return `There is already something called "${n}".`;
  return null;
}

/* Names for a set of shapes, made unique by suffix. Used when a FILE is opened —
   a hand-edited outline, or one from an older tool — where refusing outright
   would mean refusing to open the file at all. Never used on typed input. */
export function deduplicateNames(items, { reserved = ['house'] } = {}) {
  const used = new Set(reserved.map(key));
  const renamed = [];
  const out = items.map((item) => {
    let name = norm(item.name) || 'Bed';
    if (!used.has(key(name))) {
      used.add(key(name));
      return item;
    }
    for (let n = 2; ; n += 1) {
      const candidate = `${name} ${n}`;
      if (!used.has(key(candidate))) {
        used.add(key(candidate));
        renamed.push({ from: name, to: candidate });
        return { ...item, name: candidate };
      }
    }
  });
  return { items: out, renamed };
}

/* What the export gates on. A clash here means a file that would quietly
   mis-measure, so both the bundle and the GeoJSON refuse while one exists. */
export function nameClashes(doc) {
  const clashes = [];
  const seen = new Map();
  const note = (label, name) => {
    const k = key(name);
    if (!k) return;
    if (seen.has(k)) clashes.push({ name: norm(name), first: seen.get(k), second: label });
    else seen.set(k, label);
  };
  if (doc.house) seen.set('house', 'the building');
  for (const b of doc.beds) note(`bed "${norm(b.name)}"`, b.name);
  const keepSeen = new Map();
  for (const k of doc.keeps) {
    const kk = key(k.name);
    if (!kk) continue;
    if (keepSeen.has(kk)) clashes.push({ name: norm(k.name), first: keepSeen.get(kk), second: 'another keep' });
    else keepSeen.set(kk, 'a keep');
  }
  return clashes;
}
