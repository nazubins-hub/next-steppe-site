/**
 * FEMA/ORNL USA Structures — the building outlines you tap to mark a house.
 *
 * MIRROR of plant-system/ui/template.jsx between the markers (see rules.js).
 * Read straight from the browser: the service answers in about 0.2 s with
 * `access-control-allow-origin: *`, so no Worker route is involved, and it is
 * given a bounding box and never an address. CC BY 4.0 — the credit is rendered
 * under the map whenever the overlay is on, and IMAGE_DATE travels with the
 * outline into the export, because an outline traced from 2012 imagery is not a
 * statement about a house remodelled since.
 */

import { mapBbox } from './tiles.js';

/* @mirror footprints */
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
    outFields: "PROP_ADDR,OCC_CLS,SQMETERS,IMAGE_DATE",
    returnGeometry: "true",
    outSR: "4326",
    f: "json",
  });
  const r = await fetch(`${FOOTPRINTS}?${q}`, { signal });
  if (!r.ok) throw new Error(`footprints ${r.status}`);
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || "footprint query failed");
  /* IMAGE_DATE is when the picture the outline was extracted from was taken —
     2012-08-08 across Vail Village, measured. A house built or remodelled since
     is missing or the wrong shape, so the date is shown beside the outline and
     travels with it into the export. */
  return (d.features || []).map((f, i) => ({
    id: `${f.attributes.PROP_ADDR || "?"}-${i}-${Math.round(f.attributes.SQMETERS || 0)}`,
    ring: (f.geometry.rings || [[]])[0],
    addr: f.attributes.PROP_ADDR || null,
    occ: f.attributes.OCC_CLS || null,
    sqm: f.attributes.SQMETERS || null,
    imageDate: f.attributes.IMAGE_DATE
      ? new Date(f.attributes.IMAGE_DATE).toISOString().slice(0, 10) : null,
  })).filter(f => f.ring.length >= 3);
}
/* @end-mirror footprints */

export { FOOTPRINTS, FOOTPRINT_MIN_Z, fetchFootprints };
