/**
 * The map is a tile grid: which tiles a view needs, and where each one sits.
 *
 * MIRROR of plant-system/ui/template.jsx between the markers (see rules.js).
 *
 * WHAT IS *NOT* MIRRORED, AND WHY
 * The layer table and the tile URL, which are the whole difference between the
 * two tools. Esri World Imagery is reached through `/studio/api/map-tile`, behind
 * Cloudflare Access, because it is a metered licence and tracing beds on it is
 * work only the office does. The USGS layers keep using the public
 * `/api/map-tile`: they are keyless and public domain, and that route holds them
 * in the shared edge cache for a week, which is what makes a 15-second render
 * bearable. Routing them privately would mean a second, colder cache for one
 * person.
 */

import { M_PER_FT } from './rules.js';
import { to3857 } from './terrain.js';

/* `zOffset` and `maxZ` say how a layer fills the stage — see the template's own
   note on why Esri comes from two levels down. `route` is which Worker route may
   serve it; `credit` is what the layer owes on screen whenever it is visible. */
export const MAP_LAYERS = {
  imagery: {
    label: 'Aerial',
    hint: 'Esri World Imagery — the sharpest base for tracing',
    credit: 'Powered by Esri · Source: Esri, Vantor, Earthstar Geographics, ' +
            'and the GIS User Community',
    route: '/studio/api/map-tile',
    licensed: true,
    zOffset: 2, maxZ: 19,
  },
  naip: {
    label: 'USGS aerial',
    hint: 'older, flatter light — try it where shadow hides the ground',
    credit: 'USGS NAIP orthoimagery',
    route: '/api/map-tile',
    licensed: false,
    zOffset: 0, maxZ: 20,
  },
  hillshade: {
    label: 'Landform',
    hint: 'see which way the ground falls',
    credit: 'USGS 3DEP hillshade',
    route: '/api/map-tile',
    licensed: false,
    zOffset: 0, maxZ: 20,
  },
};

export const mapTileUrl = (tile, layerKey) =>
  `${MAP_LAYERS[layerKey].route}?z=${tile.z}&x=${tile.x}&y=${tile.y}&layer=${layerKey}`;

/* @mirror tiles */
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

   Returned with fractional offsets and a size rather than pixels, so the stage
   can be any size CSS gives it. For a 1024 px layer a tile is exactly one stage
   wide and the margin is a stage. For Esri's 256 px pyramid a tile is a
   quarter of the stage and the margin is one of those — about 49 tiles for a
   settled view, which is also what Esri bills — because its tiles come out of
   a cache in a fraction of a second, and a deeper ring would only buy tiles
   nobody looks at. */
function mapTiles(view, layerKey, margin = 0) {
  const b = mapBbox(view);
  const z = layerZoom(view, layerKey);
  const s = mercTile(z);
  const tx0 = Math.floor((b.xmin + MERC) / s) - margin;
  const tx1 = Math.floor((b.xmax + MERC) / s) + margin;
  const ty0 = Math.floor((MERC - b.ymax) / s) - margin;
  const ty1 = Math.floor((MERC - b.ymin) / s) + margin;
  const n = 2 ** z;
  const out = [];
  for (let y = ty0; y <= ty1; y++) {
    for (let x = tx0; x <= tx1; x++) {
      if (x < 0 || y < 0 || x >= n || y >= n) continue;
      out.push({ z, x, y, key: `${z}/${x}/${y}`, ...tilePlacement(view, { z, x, y }) });
    }
  }
  return out;
}

/* The level a layer draws a view from: its own offset below the view, and
   never past the deepest level with real pixels behind it. Above that the
   last real level is stretched, which is blurrier than a real tile and far
   better than Esri's grey "not available" square. */
function layerZoom(view, layerKey) {
  const l = MAP_LAYERS[layerKey];
  return Math.min(view.z + l.zOffset, l.maxZ);
}

/* Where any tile sits in the current view, as fractions of the stage. The
   ghost uses it too, and that is what keeps the previous level on screen while
   a new one loads: on a zoom the old tiles are still perfectly good imagery of
   the same ground, just at the wrong scale, so they are re-projected into the
   new geometry and left underneath until the replacements arrive. The stage
   never goes beige. */
function tilePlacement(view, tile) {
  const b = mapBbox(view);
  const s = mercTile(tile.z);
  return {
    left: (-MERC + tile.x * s - b.xmin) / b.s,
    top:  (b.ymax - (MERC - tile.y * s)) / b.s,
    size: s / b.s,
  };
}

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
/* @end-mirror tiles */

export {
  MAP_PX,
  MAP_Z_MIN,
  MAP_Z_MAX,
  MAP_Z_DEFAULT,
  MERC,
  mercTile,
  groundSpanM,
  from3857,
  mapBbox,
  mapTiles,
  layerZoom,
  tilePlacement,
  mapPointAt,
  mapFractionOf,
  zoomAbout,
  feetBetween,
};
