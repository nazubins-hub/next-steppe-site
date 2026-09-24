/**
 * The studio's engine, exercised for real.
 *
 * WHY THIS FILE EXISTS
 * Most of src/studio/engine is copied verbatim from plant-system/ui/template.jsx,
 * where it runs with every one of its dependencies already in scope — it is one
 * 4,000-line module. Split into files, each copy needs the right imports, and a
 * missing one is invisible: the build succeeds, the page renders, and the failure
 * waits until someone presses the button that reaches that line. That is exactly
 * how `bedRadiusM` shipped referencing a SITE_RULES nothing had imported, and the
 * only symptom was a terrain read that quietly did nothing.
 *
 * So the rule here is: call the functions. A test that imports a module proves the
 * import graph; a test that runs its arithmetic proves the copy.
 *
 * The numbers are checked against plant-system, which is the real authority:
 * geometry.py measures the same outlines when a site analysis is run, and a client
 * must never be shown one area on a drawing and another on a planting plan.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  GEO,
  SITE_RULES,
  aspectOffsetFt,
  effectiveElevation,
  zoneForDistance,
} from '../src/studio/engine/rules.js';
import {
  bedRadiusM,
  dedupeRing,
  measureOutline,
  ringAreaM2,
  ringContains,
  ringGapM,
  ringSelfCrosses,
  ringSig,
} from '../src/studio/engine/geometry.js';
import {
  MAP_LAYERS,
  layerZoom,
  mapFractionOf,
  mapPointAt,
  mapTiles,
  mapTileUrl,
  zoomAbout,
} from '../src/studio/engine/tiles.js';
import { closedRing, localDate, outlineGeoJson, r7, readOutline } from '../src/studio/engine/outline.js';
import { deduplicateNames, deleteVertex, insertVertex, moveVertex, nameClashes, nameError } from '../src/studio/engine/edit.js';

/* A synthetic site on round coordinates in the middle of Colorado. No client's
   ground appears in this repo, and a test fixture is not an exception. */
const AT = { lat: 39.5, lon: -106.0 };
const dLat = (m) => m / 110540;
const dLon = (m) => m / (111320 * Math.cos((AT.lat * Math.PI) / 180));

/* A 10 m square, corners anticlockwise from the south-west. */
const square = (offsetEastM = 0, offsetNorthM = 0, sizeM = 10) => [
  [AT.lon + dLon(offsetEastM), AT.lat + dLat(offsetNorthM)],
  [AT.lon + dLon(offsetEastM + sizeM), AT.lat + dLat(offsetNorthM)],
  [AT.lon + dLon(offsetEastM + sizeM), AT.lat + dLat(offsetNorthM + sizeM)],
  [AT.lon + dLon(offsetEastM), AT.lat + dLat(offsetNorthM + sizeM)],
];

describe('rules', () => {
  it('puts a distance in the band plant-system would put it in', () => {
    assert.equal(zoneForDistance(0).name, 'HIZ 0');
    assert.equal(zoneForDistance(4.9).name, 'HIZ 0');
    assert.equal(zoneForDistance(5).name, 'HIZ 1-2');
    assert.equal(zoneForDistance(29.9).name, 'HIZ 1-2');
    assert.equal(zoneForDistance(30).name, 'HIZ 3');
    assert.equal(zoneForDistance(100).name, 'outer');
    assert.equal(zoneForDistance(5000).name, 'outer', 'past the last band, the last band still answers');
  });

  it('carries the ignitability floor with the band', () => {
    assert.equal(zoneForDistance(10).minIgn, 8);
    assert.equal(zoneForDistance(50).minIgn, 5);
    assert.equal(zoneForDistance(150).minIgn, null);
  });

  it('corrects elevation by aspect, and refuses to on flat ground', () => {
    const north = effectiveElevation(9000, 0, 30);
    assert.equal(north.ft, 9000 + SITE_RULES.aspectOffsetFt.north, 'a north slope reads colder');
    const south = effectiveElevation(9000, 180, 30);
    assert.equal(south.ft, 9000 + SITE_RULES.aspectOffsetFt.south);
    const flat = effectiveElevation(9000, 180, SITE_RULES.minAspectSlopePct - 0.1);
    assert.equal(flat.flat, true);
    assert.equal(flat.ft, 9000, 'too gentle to earn a correction');
    assert.equal(effectiveElevation(9000, null, 30).flat, true);
    assert.equal(effectiveElevation(null, 180, 30), null);
  });

  it('scales the correction with slope rather than switching it on', () => {
    const half = effectiveElevation(9000, 0, SITE_RULES.fullAspectSlopePct / 2);
    const full = effectiveElevation(9000, 0, SITE_RULES.fullAspectSlopePct);
    assert.ok(half.offset > 0 && half.offset < full.offset);
    assert.equal(Math.round(aspectOffsetFt(90)), SITE_RULES.aspectOffsetFt.east);
  });
});

describe('geometry', () => {
  it('measures a 10 m square the way geometry.py does', () => {
    const geo = measureOutline(null, [{ id: 'b1', ring: square() }]);
    assert.ok(Math.abs(geo.b1.areaM2 - 100) < 0.5, `area ${geo.b1.areaM2} m² should be ~100`);
    assert.ok(Math.abs(geo.b1.areaFt2 - 1076) < 6, `area ${geo.b1.areaFt2} ft² should be ~1076`);
    assert.ok(Math.abs(geo.b1.perimeterFt - 131.2) < 1, `perimeter ${geo.b1.perimeterFt} ft should be ~131`);
  });

  it('measures the gap from a bed to a house edge to edge', () => {
    const house = { kind: 'traced', ring: square(0, 0) };
    const bed = { id: 'b1', ring: square(20, 0) };      // 10 m of clear ground between
    const geo = measureOutline(house, [bed]);
    const gapFt = geo.b1.fromStructureFt;
    assert.ok(Math.abs(gapFt - 32.8) < 1, `gap ${gapFt} ft should be ~32.8 (10 m)`);
    assert.equal(zoneForDistance(gapFt).name, 'HIZ 3');
  });

  it('calls an overlap zero rather than negative', () => {
    const a = square(0, 0);
    const b = square(5, 5);
    assert.equal(ringGapM(
      a.map(([lon, lat]) => [(lon + 106) * 1e5, (lat - 39.5) * 1e5]),
      b.map(([lon, lat]) => [(lon + 106) * 1e5, (lat - 39.5) * 1e5]),
    ), 0);
  });

  it('gives a bed a terrain radius wide enough to contain it', () => {
    /* The regression this file was written for: bedRadiusM reads SITE_RULES, and
       for a while nothing had imported it here. */
    const geo = measureOutline(null, [{ id: 'b1', ring: square(0, 0, 10) }]);
    assert.equal(bedRadiusM(geo.b1), SITE_RULES.analysisRadiusM, 'a small bed takes the standard radius');
    const wide = measureOutline(null, [{ id: 'b1', ring: square(0, 0, 80) }]);
    assert.ok(bedRadiusM(wide.b1) > SITE_RULES.analysisRadiusM, 'a big one widens the read');
    assert.equal(bedRadiusM(wide.b1), Math.ceil(wide.b1.extentM));
    assert.equal(bedRadiusM(undefined), SITE_RULES.analysisRadiusM);
  });

  it('knows what is inside a ring, and what a ring is', () => {
    const ring = square();
    assert.equal(ringContains(ring, AT.lat + dLat(5), AT.lon + dLon(5)), true);
    assert.equal(ringContains(ring, AT.lat + dLat(50), AT.lon + dLon(5)), false);
    assert.equal(ringSelfCrosses([...square()]), false);
    const bowtie = [square()[0], square()[2], square()[1], square()[3]];
    assert.equal(ringSelfCrosses(bowtie), true, 'a bow-tie has no single inside');
    assert.ok(ringAreaM2(square()) > 99);
    assert.equal(dedupeRing([...square(), square()[0]]).length, 4, 'a repeated closing point is not a corner');
    assert.equal(ringSig(square()), ringSig(square()));
  });
});

describe('tiles', () => {
  const view = { lat: AT.lat, lon: AT.lon, z: 16 };

  it('asks Esri for its pyramid two levels down, and USGS for one render', () => {
    assert.equal(layerZoom(view, 'imagery'), 18);
    assert.equal(layerZoom(view, 'naip'), 16);
    assert.equal(layerZoom({ ...view, z: 19 }, 'imagery'), MAP_LAYERS.imagery.maxZ, 'never past real pixels');
  });

  it('covers the stage, and no more than it has to', () => {
    /* The stage is one tile's WORTH of ground, not one tile of the grid: unless the
       view happens to be grid-aligned it straddles up to four, which is why the
       margin ring is counted separately. */
    const bare = mapTiles(view, 'naip', 0).length;
    assert.ok(bare >= 1 && bare <= 4, `a 1024 px render takes 1-4 tiles, got ${bare}`);
    const ringed = mapTiles(view, 'naip', 1).length;
    assert.ok(ringed > bare, 'the margin fetches the ring a pan is about to need');
    assert.ok(mapTiles(view, 'imagery', 1).length >= 25, "Esri's 256 px pyramid needs a grid");
  });

  it('sends imagery to the private route and the rest to the public one', () => {
    const tile = { z: 18, x: 1, y: 2 };
    assert.equal(mapTileUrl(tile, 'imagery'), '/studio/api/map-tile?z=18&x=1&y=2&layer=imagery');
    assert.equal(mapTileUrl(tile, 'naip'), '/api/map-tile?z=18&x=1&y=2&layer=naip');
    assert.equal(mapTileUrl(tile, 'hillshade'), '/api/map-tile?z=18&x=1&y=2&layer=hillshade');
  });

  it('turns a point into a fraction and back', () => {
    const [fx, fy] = mapFractionOf(view, AT.lat, AT.lon);
    assert.ok(Math.abs(fx - 0.5) < 1e-6 && Math.abs(fy - 0.5) < 1e-6, 'the centre is the centre');
    const [lat, lon] = mapPointAt(view, fx, fy);
    assert.ok(Math.abs(lat - AT.lat) < 1e-6 && Math.abs(lon - AT.lon) < 1e-6);
  });

  it('keeps the ground under the cursor under the cursor', () => {
    const before = mapPointAt(view, 0.25, 0.25);
    const zoomed = zoomAbout(view, 1, 0.25, 0.25);
    const after = mapPointAt(zoomed, 0.25, 0.25);
    assert.equal(zoomed.z, 17);
    assert.ok(Math.abs(before[0] - after[0]) < 1e-6 && Math.abs(before[1] - after[1]) < 1e-6);
  });
});

describe('the outline file', () => {
  const doc = () => ({
    house: { kind: 'footprint', ring: [...square(0, 0), square(0, 0)[0]], imageDate: '2012-08-08', sqm: 166 },
    beds: [{ id: 'b1', name: 'Bed 1', ring: square(20, 0), note: 'the bed by the drive', light: 'Sun', geo: {} }],
    keeps: [{ id: 'k1', kind: 'point', name: 'the blue spruce', lat: AT.lat, lon: AT.lon }],
  });

  it('closes a ring exactly once, however it arrived', () => {
    const open = closedRing(square());
    const already = closedRing([...square(), square()[0]]);
    assert.equal(open.length, 5);
    assert.deepEqual(open, already, 'a ring that arrives closed must not be closed twice');
    assert.deepEqual(open[0], open[open.length - 1]);
    assert.equal(open.filter((p) => p[0] === open[0][0] && p[1] === open[0][1]).length, 2);
  });

  it('dates the file locally, not in UTC', () => {
    /* An evening in Mountain time is already tomorrow in UTC, and an outline
       traced at 6 pm was being filed as the next day. */
    const evening = new Date(2026, 8, 20, 22, 30);
    assert.equal(localDate(evening), '2026-09-20');
  });

  it('writes what geometry.py reads', () => {
    const gj = outlineGeoJson({ ...doc(), drawnAt: '2026-09-20' });
    assert.equal(gj.type, 'FeatureCollection');
    assert.equal(gj.nextsteppe.schema, 'nextsteppe-outline/1');
    const kinds = gj.features.map((f) => f.properties.kind);
    assert.deepEqual(kinds, ['building', 'bed', 'keep']);
    const house = gj.features[0].properties;
    assert.equal(house.source, 'usa-structures');
    assert.equal(house.imageDate, '2012-08-08', 'a 2012 roofline says so downstream');
    assert.equal(house.credit, 'FEMA/ORNL USA Structures (CC BY 4.0)');
    const bed = gj.features[1].properties;
    assert.equal(bed.note, 'the bed by the drive', 'the words a rendering is given');
    assert.equal(bed.lightDeclared, 'Sun');
    assert.equal(gj.features[2].properties.name, 'the blue spruce', 'keep names reach --leave-from-keeps');
  });

  it('carries no address anywhere', () => {
    const gj = JSON.stringify(outlineGeoJson({ ...doc(), address: '123 Example Rd', site: { matchedAddress: '123 Example Rd' } }));
    assert.ok(!gj.includes('Example Rd'));
  });

  it('reads its own file back, and reports duplicate names rather than hiding them', () => {
    const gj = outlineGeoJson(doc());
    const { doc: back } = readOutline(JSON.stringify(gj));
    assert.equal(back.beds.length, 1);
    assert.equal(back.beds[0].name, 'Bed 1');
    assert.equal(back.beds[0].note, 'the bed by the drive');
    assert.equal(back.house.kind, 'footprint');
    assert.equal(back.keeps[0].name, 'the blue spruce');

    const twice = outlineGeoJson({
      ...doc(),
      beds: [
        { id: 'b1', name: 'Front Bed', ring: square(20, 0), geo: {} },
        { id: 'b2', name: 'Front Bed', ring: square(40, 0), geo: {} },
      ],
    });
    const { clashes } = readOutline(JSON.stringify(twice));
    assert.deepEqual(clashes, ['Front Bed']);
  });

  it('refuses what it cannot read', () => {
    assert.throws(() => readOutline('not json'), /not JSON/);
    assert.throws(() => readOutline('{"type":"Thing"}'), /FeatureCollection/);
    assert.throws(() => readOutline('{"type":"FeatureCollection","features":[]}'), /building, bed or keep/);
  });
});

describe('editing', () => {
  /* A view whose stage is one tile of ground at z16, so a fraction of the stage is
     a position a drag could actually put a corner in. */
  const view = { lat: AT.lat, lon: AT.lon, z: 16 };
  /* Rounded to seven places as the app rounds every corner when it is placed —
     without that, two corners in the same place differ in the eighth decimal and
     nothing de-duplicates them. */
  const ringAt = (f) => f.map(([fx, fy]) => mapPointAt(view, fx, fy)).map(([lat, lon]) => [r7(lon), r7(lat)]);

  it('refuses a corner dragged through the outline, and says why', () => {
    /* A square in stage fractions, then corner 0 dragged across to the far side of
       its neighbours: the ring folds over itself and has no single inside. */
    const ring = ringAt([[0.4, 0.4], [0.6, 0.4], [0.6, 0.6], [0.4, 0.6]]);
    const ok = moveVertex(view, ring, 0, 0.38, 0.38, 'Bed 1');
    assert.equal(ok.error, undefined, 'an ordinary nudge is allowed');
    assert.equal(ok.ring.length, 4);

    const crossed = moveVertex(view, ring, 0, 0.7, 0.5, 'Bed 1');
    assert.match(crossed.error, /cross itself/);
    assert.equal(crossed.ring, undefined, 'a refused edit returns no ring to write');
  });

  it('drops a corner dragged onto its neighbour, the way geometry.py would', () => {
    /* Not a refusal: two corners within a centimetre are one corner, and
       geometry.py's own read de-duplicates them. Keeping it would mean the studio
       showing a four-corner bed that the pipeline measures as a triangle. */
    const ring = ringAt([[0.4, 0.4], [0.6, 0.4], [0.6, 0.6], [0.4, 0.6]]);
    const collapsed = moveVertex(view, ring, 0, 0.6, 0.4, 'Bed 1');
    assert.equal(collapsed.error, undefined);
    assert.equal(collapsed.ring.length, 3);
  });

  it('adds a corner on an edge and keeps the shape legal', () => {
    const ring = ringAt([[0.4, 0.4], [0.6, 0.4], [0.6, 0.6], [0.4, 0.6]]);
    const added = insertVertex(view, ring, 1, 0.5, 0.38, 'Bed 1');
    assert.equal(added.error, undefined);
    assert.equal(added.ring.length, 5);
    assert.equal(added.index, 1);
    assert.ok(ringAreaM2(added.ring) > ringAreaM2(ring), 'pulled outward, so it grew');
  });

  it('refuses to leave a shape with fewer corners than a shape needs', () => {
    const three = square().slice(0, 3);
    assert.match(deleteVertex(three, 0, 'Bed 1').error, /three corners/);
    const four = square();
    assert.equal(deleteVertex(four, 0, 'Bed 1').ring.length, 3);
  });

  it('refuses a deletion that would leave a sliver', () => {
    const tiny = square(0, 0, 1.2);   // 1.44 m², above the floor; a triangle of it is not
    const res = deleteVertex(tiny, 0, 'Bed 1');
    assert.ok(res.error ? /too small/.test(res.error) : res.ring.length === 3);
    assert.ok(GEO.minAreaM2 > 0);
  });

  it('will not let two shapes share a name', () => {
    assert.equal(nameError('Front Bed', { taken: ['Back Bed'] }), null);
    assert.match(nameError('Front Bed', { taken: ['front bed'] }), /already something called/);
    assert.match(nameError('House', { taken: [] }), /reserved/);
    assert.match(nameError('', { taken: [] }), /name is needed/);
    assert.match(nameError('x'.repeat(61), { taken: [] }), /at most 60/i);
  });

  it('suffixes clashing names when a FILE brings them, rather than refusing the file', () => {
    const { items, renamed } = deduplicateNames([{ name: 'Bed' }, { name: 'Bed' }, { name: 'Bed' }]);
    assert.deepEqual(items.map((i) => i.name), ['Bed', 'Bed 2', 'Bed 3']);
    assert.equal(renamed.length, 2);
  });

  it('reports a clash for the export to refuse', () => {
    const clash = nameClashes({
      house: { kind: 'traced', ring: square() },
      beds: [{ name: 'Front' }, { name: 'front' }],
      keeps: [],
    });
    assert.equal(clash.length, 1);
    assert.equal(nameClashes({ house: null, beds: [{ name: 'A' }, { name: 'B' }], keeps: [] }).length, 0);
  });
});
