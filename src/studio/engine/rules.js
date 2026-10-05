/**
 * The rules, and the arithmetic that is only rules.
 *
 * MIRROR of plant-system/ui/template.jsx — the code between the @mirror markers
 * is copied from it, not written here. The template is the source of truth: it
 * is generated from scripts/packs/xeric.py and it is what the public plant
 * browser runs, so a number that disagrees between the two tools is a number one
 * of them is wrong about. `npm run build` compares them (scripts/check-engine-twins.mjs).
 *
 * The one thing that differs is where SITE_RULES comes from. The template has it
 * injected at build time by scripts/build-island.mjs; here it is imported from
 * the same synced file that injection reads, so there is no second copy of it.
 */

/* The import attribute is not decoration: it is what lets this same file load in
   plain Node, so test/engine.test.mjs can exercise the engine directly rather than
   through a bundler. Vite and Node both understand it. */
import SITE_RULES from '../../../data/site-rules.json' with { type: 'json' };

export { SITE_RULES };

/* @mirror rules */
/* `key` labels the button; `name` is for prose. "A N slope at gentle grade" is
   what happens when a button label is dropped into a sentence. */
const ASPECT_POINTS = [
  { key:"N",  deg:0,   name:"north"      }, { key:"NE", deg:45,  name:"north-east" },
  { key:"E",  deg:90,  name:"east"       }, { key:"SE", deg:135, name:"south-east" },
  { key:"S",  deg:180, name:"south"      }, { key:"SW", deg:225, name:"south-west" },
  { key:"W",  deg:270, name:"west"       }, { key:"NW", deg:315, name:"north-west" },
];


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

const M_PER_FT = 0.3048;

const GEO = SITE_RULES.geometry;
const M2_PER_FT2 = M_PER_FT * M_PER_FT;
const round1 = v => Math.round(v * 10) / 10;
/* @end-mirror rules */

export {
  ASPECT_POINTS,
  nearestAspectPoint,
  compassKey,
  compassName,
  aspectOffsetFt,
  effectiveElevation,
  zoneForDistance,
  M_PER_FT,
  GEO,
  M2_PER_FT2,
  round1,
};
