/**
 * The outline, as files — GeoJSON for the pipeline, KML for Google Earth.
 *
 * NOT a mirror. This began as the template's export (plant-system/ui/template.jsx,
 * "THE OUTLINE, AS FILES") and is the studio's own, because the public tool is
 * losing its export and this one has to carry more: keeps with names, the house's
 * provenance, and three fixes worth stating.
 *
 *   1. RINGS ARE CLOSED ONCE. The template closes every ring it is handed, and a
 *      USA Structures ring arrives already closed — so a tapped footprint went out
 *      with its first vertex three times over. geometry.py's read drops the
 *      duplicate, which is why nobody noticed, but the file was wrong and any
 *      other reader would have been entitled to complain. De-duplicate, orient,
 *      then close: in that order.
 *
 *   2. `drawnAt` IS THE LOCAL DATE. `toISOString().slice(0, 10)` is the UTC date,
 *      so everything traced after 6 pm Mountain was filed as tomorrow. The one in
 *      "Import from website GeoJSON" says 2026-09-21 for an evening on the 20th.
 *
 *   3. KEEP NAMES TRAVEL. `{kind: "keep"}` and nothing else was enough for a map,
 *      but render_beds.py reads keep NAMES ("--leave-from-keeps") to tell an image
 *      model what to leave alone. A keep called "the blue spruce" is the whole
 *      value of having marked it.
 *
 * What has not changed: no address in either file, coordinates at seven places
 * (about a centimetre, finer than any hand that drew them), `kind` on every shape
 * so geometry.py never has to guess from a name, and the note saying these
 * measurements are a first pass that a site analysis recomputes.
 */

/* Seven decimal places, the same rounding the trace applies as corners are taken. */
export const r7 = (v) => Math.round(v * 1e7) / 1e7;

/* Today, where the person drawing is standing. */
export function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* Only the fields that say something: an empty note is not a note. */
export const present = (obj) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v != null && v !== ''));

/* RFC 7946 asks for an exterior ring counter-clockwise with the first point
   repeated — ONCE. A ring that arrives closed is unclosed first, so a source that
   closes its own rings and one that does not both come out the same. */
export function closedRing(ring) {
  const pts = ring.map(([lon, lat]) => [r7(lon), r7(lat)]);
  while (
    pts.length > 1 &&
    pts[0][0] === pts[pts.length - 1][0] &&
    pts[0][1] === pts[pts.length - 1][1]
  ) {
    pts.pop();
  }
  let a = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  const ccw = a > 0 ? pts : pts.slice().reverse();
  return [...ccw, ccw[0]];
}

const HOUSE_NAME = 'House';

const houseSource = (h) => (h.kind === 'footprint' ? 'usa-structures' : h.kind);

export function outlineShapes(doc) {
  const out = [];
  const h = doc.house;
  if (h) {
    out.push({
      name: HOUSE_NAME,
      geometry:
        h.kind === 'point'
          ? { type: 'Point', coordinates: [r7(h.lon), r7(h.lat)] }
          : { type: 'Polygon', coordinates: [closedRing(h.ring)] },
      props: present({
        kind: 'building',
        source: houseSource(h),
        imageDate: h.imageDate,
        credit: h.kind === 'footprint' ? 'FEMA/ORNL USA Structures (CC BY 4.0)' : null,
        tracedOn: h.tracedOn,
      }),
    });
  }
  for (const b of doc.beds) {
    const geo = b.geo || {};
    out.push({
      name: b.name,
      geometry: { type: 'Polygon', coordinates: [closedRing(b.ring)] },
      props: present({
        kind: 'bed',
        note: b.note,
        lightDeclared: b.light,
        areaFt2: geo.areaFt2,
        perimeterFt: geo.perimeterFt,
        fromStructureFt: geo.fromStructureFt,
        farFt: geo.farFt,
        zone: b.zone,
        minIgn: b.minIgn,
        terrain: b.terrain,
        tracedOn: b.tracedOn,
      }),
    });
  }
  for (const k of doc.keeps) {
    out.push({
      name: k.name || 'Keep',
      geometry:
        k.kind === 'point'
          ? { type: 'Point', coordinates: [r7(k.lon), r7(k.lat)] }
          : { type: 'Polygon', coordinates: [closedRing(k.ring)] },
      props: present({ kind: 'keep', note: k.note, tracedOn: k.tracedOn }),
    });
  }
  return out;
}

export function outlineGeoJson(doc) {
  const shapes = outlineShapes(doc);
  const seen = new Set();
  const tracedOn = [];
  for (const s of shapes) {
    const t = s.props.tracedOn;
    const sig = t && JSON.stringify(t);
    if (t && !seen.has(sig)) {
      seen.add(sig);
      tracedOn.push(t);
    }
  }
  return {
    type: 'FeatureCollection',
    // A foreign member, which RFC 7946 allows at the top level: what the file is
    // and which pictures the lines were drawn on, for the plan to record.
    nextsteppe: present({
      schema: 'nextsteppe-outline/1',
      drawnAt: doc.drawnAt || localDate(),
      tracedOn: tracedOn.length ? tracedOn : null,
      note:
        "Measurements are the website's first pass. A site analysis recomputes " +
        'them from these outlines.',
    }),
    features: shapes.map((s) => ({
      type: 'Feature',
      properties: { name: s.name, ...s.props },
      geometry: s.geometry,
    })),
  };
}

/* The description holds a bed's note and nothing else, because geometry.py reads
   a KML description as the note when there is no ExtendedData one. The facts go
   in ExtendedData, where Google Earth shows them as a table. */
export function outlineKml(doc) {
  const esc = (v) =>
    String(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  const coords = (ring) => ring.map(([x, y]) => `${x},${y},0`).join(' ');
  const placemark = (s) => {
    const p = s.props;
    const data = present({
      kind: p.kind,
      note: p.note,
      lightDeclared: p.lightDeclared,
      areaFt2: p.areaFt2,
      fromStructureFt: p.fromStructureFt,
      zone: p.zone,
      source: p.source,
      imageDate: p.imageDate,
      credit: p.credit,
    });
    const geom =
      s.geometry.type === 'Point'
        ? `<Point><coordinates>${s.geometry.coordinates.join(',')},0</coordinates></Point>`
        : '<Polygon><outerBoundaryIs><LinearRing><coordinates>' +
          coords(s.geometry.coordinates[0]) +
          '</coordinates></LinearRing></outerBoundaryIs></Polygon>';
    return (
      `<Placemark><name>${esc(s.name)}</name>` +
      (p.note ? `<description>${esc(p.note)}</description>` : '') +
      '<ExtendedData>' +
      Object.entries(data)
        .map(([k, v]) => `<Data name="${k}"><value>${esc(v)}</value></Data>`)
        .join('') +
      `</ExtendedData>${geom}</Placemark>`
    );
  };
  const drawnAt = doc.drawnAt || localDate();
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>' +
    `<name>NextSteppe outline ${esc(drawnAt)}</name>` +
    '<description>Traced in the NextSteppe studio. Measurements are a first pass; ' +
    'a site analysis recomputes them from these outlines.</description>' +
    outlineShapes(doc).map(placemark).join('') +
    '</Document></kml>\n'
  );
}

/* ── Reading one back in ─────────────────────────────────────────────────────
   So an outline traced weeks ago can be revised rather than redrawn. Strict
   about what it must understand and quiet about the rest: unknown properties are
   ignored, because a file written by a later version of this tool should still
   open, but a file whose geometry cannot be read is refused with a reason.

   Duplicate names are NOT repaired here. They are reported, and the caller
   decides — geometry.py keys features by name, so two beds called the same thing
   become one ring recorded twice, and silently renaming someone's bed is its own
   kind of wrong. */
export function readOutline(text) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new Error('That file is not JSON.');
  }
  if (!doc || doc.type !== 'FeatureCollection' || !Array.isArray(doc.features)) {
    throw new Error('That is not a GeoJSON FeatureCollection.');
  }

  const out = { house: null, beds: [], keeps: [], drawnAt: (doc.nextsteppe || {}).drawnAt || null };
  const clashes = [];
  const seen = new Set();
  let n = 0;

  for (const f of doc.features) {
    const g = f && f.geometry;
    const p = (f && f.properties) || {};
    if (!g) continue;
    const kind = p.kind || '';
    const name = String(p.name || '').trim();

    const ringOf = () => {
      const ring = (g.coordinates || [[]])[0] || [];
      const clean = ring
        .filter((c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]))
        .map(([lon, lat]) => [r7(lon), r7(lat)]);
      while (
        clean.length > 1 &&
        clean[0][0] === clean[clean.length - 1][0] &&
        clean[0][1] === clean[clean.length - 1][1]
      ) {
        clean.pop();
      }
      return clean;
    };

    if (kind === 'building' && g.type === 'Polygon') {
      const ring = ringOf();
      if (ring.length >= 3) {
        out.house = {
          kind: p.source === 'usa-structures' ? 'footprint' : 'traced',
          ring,
          imageDate: p.imageDate || null,
          tracedOn: p.tracedOn || null,
        };
      }
      continue;
    }
    if (kind === 'building' && g.type === 'Point') {
      out.house = { kind: 'point', lat: g.coordinates[1], lon: g.coordinates[0] };
      continue;
    }
    if (kind === 'bed' && g.type === 'Polygon') {
      const ring = ringOf();
      if (ring.length < 3) continue;
      n += 1;
      const key = (name || `Bed ${n}`).toLowerCase();
      if (seen.has(key)) clashes.push(name || `Bed ${n}`);
      seen.add(key);
      out.beds.push({
        id: `b${n}`,
        name: name || `Bed ${n}`,
        ring,
        note: typeof p.note === 'string' ? p.note : '',
        light: typeof p.lightDeclared === 'string' ? p.lightDeclared : '',
        tracedOn: p.tracedOn || null,
        terrain: p.terrain || null,
      });
      continue;
    }
    if (kind === 'keep') {
      if (g.type === 'Point') {
        out.keeps.push({ id: `k${out.keeps.length + 1}`, kind: 'point', name, lat: g.coordinates[1], lon: g.coordinates[0] });
      } else if (g.type === 'Polygon') {
        const ring = ringOf();
        if (ring.length >= 3) out.keeps.push({ id: `k${out.keeps.length + 1}`, kind: 'traced', name, ring });
      }
    }
  }

  if (!out.house && !out.beds.length && !out.keeps.length) {
    throw new Error('Nothing in that file has a kind of building, bed or keep.');
  }
  return { doc: out, clashes };
}
