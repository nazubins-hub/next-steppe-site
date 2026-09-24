/**
 * The studio: trace a site properly, then hand the pipeline a file.
 *
 * WHAT THIS IS FOR
 * The public map on /plants/ answers a visitor's question — roughly where, roughly
 * how far from the house, what might grow. This answers the office's: the outlines
 * a planting plan is measured from, the words a rendering is given, and the
 * readings a site analysis starts from. It is behind Cloudflare Access because it
 * spends a licensed imagery key and because a client's garden is not public.
 *
 * STATE, AND WHY IT IS SHAPED THIS WAY
 * One `doc` holds everything that would be a loss to retype: the site, the house,
 * the beds, the keeps, the reading on screen. Undo snapshots only the shapes
 * ({house, beds, keeps}), because that is what a slip actually damages, and the
 * history stays in memory — see persist.js on why fifty frames of rings must never
 * reach localStorage.
 *
 * MEASUREMENTS ARE DERIVED, NEVER STORED
 * Every area, perimeter, gap and zone comes from measureOutline() on each render.
 * Nothing is cached, so a moved corner cannot leave a stale number beside it. The
 * one exception is a terrain reading, which is a network call and is therefore
 * kept — with the ring it was taken over, so a redrawn bed retires it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { GEO, SITE_RULES, zoneForDistance, effectiveElevation } from './engine/rules.js';
import { MAP_LAYERS, MAP_Z_DEFAULT, MAP_Z_MAX, MAP_Z_MIN, feetBetween, mapBbox, mapFractionOf, mapPointAt, from3857, zoomAbout } from './engine/tiles.js';
import { bedRadiusM, dedupeRing, measureOutline, ringAreaM2, ringContains, ringSelfCrosses, ringSig } from './engine/geometry.js';
import { measureTerrain, outsideCoverage } from './engine/terrain.js';
import { FOOTPRINT_MIN_Z, fetchFootprints } from './engine/footprints.js';
import { localDate, outlineGeoJson, outlineKml, r7, readOutline } from './engine/outline.js';
import { HIT_PX, TOUCH_HIT_PX, deduplicateNames, deleteVertex, insertVertex, moveVertex, nameClashes, nameError, nearestEdge, nearestVertex } from './engine/edit.js';
import { makeAutosave, deleteDraft, deleteEverything, draftBytes, listDrafts, loadDraft } from './persist.js';
import { probeSession, sessionMessage } from './session.js';
import { useMapGestures } from './useMapGestures.js';
import MapStage from './MapStage.jsx';
import SitePanel, { slugError } from './panels/SitePanel.jsx';
import HousePanel from './panels/HousePanel.jsx';
import BedsPanel, { bedNoteError } from './panels/BedsPanel.jsx';
import KeepsPanel, { keepNameError } from './panels/KeepsPanel.jsx';
import ExportPanel from './panels/ExportPanel.jsx';
import { Notice } from './panels/Fields.jsx';

const emptyDoc = () => ({
  slug: '',
  address: '',
  site: null,       // the geocode: matchedAddress, lat, lon, hardiness…
  pin: null,        // a planting point, until beds exist
  house: null,
  beds: [],
  keeps: [],
  reading: null,    // the terrain reading on screen, and what it describes
  render: null,
  planting: null,
  scope: null,
  client: null,
});

/* A pasted "39.6400, -106.3700" is a site visit's GPS, which outranks any
   geocoder — site.py reads brief.json's location first for the same reason. */
const COORDS = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

const CLOSE_PX = 14;   // tapping the first corner again closes a trace

export default function StudioApp() {
  const [doc, setDoc] = useState(emptyDoc);
  const [view, setView] = useState(null);
  const [layer, setLayer] = useState('imagery');
  const [mark, setMark] = useState('house');            // house | bed | keep | pin
  const [houseMode, setHouseMode] = useState('tap');    // tap | trace | point
  const [trace, setTrace] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [selectedVertex, setSelectedVertex] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [footprints, setFootprints] = useState([]);
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(null);
  const [session, setSession] = useState({ state: 'ok', exp: 0 });
  const [hist, setHist] = useState({ past: [], future: [] });
  const [draft, setDraft] = useState({ savedAt: null, bytes: 0 });
  const [open, setOpen] = useState({ site: true, house: true, beds: true, keeps: false, files: true });

  const stageRef = useRef(null);
  const layerRef = useRef(null);
  const viewRef = useRef(null);
  const docRef = useRef(doc);
  const seq = useRef({ bed: 0, keep: 0 });

  useEffect(() => {
    docRef.current = doc;
  }, [doc]);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  /* ── the document, and undo ───────────────────────────────────────────────── */

  const shapesOf = (d) => ({ house: d.house, beds: d.beds, keeps: d.keeps });

  /* Every change to a shape goes through here, so undo needs no discipline
     elsewhere. Fifty deep: enough to get out of a bad trace, bounded because it
     is all live objects. */
  const edit = useCallback((patch) => {
    const before = shapesOf(docRef.current);
    setHist((h) => ({ past: [...h.past, before].slice(-50), future: [] }));
    setDoc((d) => ({ ...d, ...(typeof patch === 'function' ? patch(d) : patch) }));
  }, []);

  /* Anything that is not a shape: the slug, an address, a reading. Not undoable,
     because undo is for the drawing. */
  const set = useCallback((patch) => setDoc((d) => ({ ...d, ...(typeof patch === 'function' ? patch(d) : patch) })), []);

  const undo = useCallback(() => {
    setHist((h) => {
      if (!h.past.length) return h;
      const prev = h.past[h.past.length - 1];
      const now = shapesOf(docRef.current);
      setDoc((d) => ({ ...d, ...prev }));
      setTrace(null);
      return { past: h.past.slice(0, -1), future: [now, ...h.future].slice(0, 50) };
    });
  }, []);

  const redo = useCallback(() => {
    setHist((h) => {
      if (!h.future.length) return h;
      const next = h.future[0];
      const now = shapesOf(docRef.current);
      setDoc((d) => ({ ...d, ...next }));
      return { past: [...h.past, now].slice(-50), future: h.future.slice(1) };
    });
  }, []);

  /* ── drafts ───────────────────────────────────────────────────────────────── */

  const autosave = useRef(null);
  if (!autosave.current) {
    autosave.current = makeAutosave({
      onSaved: (res) => setDraft({ savedAt: res.savedAt, bytes: draftBytes() }),
      onTrouble: (reason) =>
        setNotice({
          kind: 'error',
          text:
            reason === 'full'
              ? "This browser's storage is full — autosave has stopped. Export, then delete old drafts."
              : 'This browser will not keep a draft (private window, or site data blocked). Export before you close the tab.',
        }),
    });
  }

  /* One draft is restored on load: the most recent, whichever slug it was under.
     Anything more would be a file browser, and the files are the real record.

     It has to come off the index rather than a fixed key, because the key IS the
     slug: work that starts before the slug is typed is saved under `_unsaved` and
     everything after it under the slug, so looking only at `_unsaved` restores the
     first thirty seconds of an afternoon and silently drops the rest. */
  useEffect(() => {
    const newest = listDrafts()[0];
    const held = newest ? loadDraft(newest.slug === '_unsaved' ? '' : newest.slug) : null;
    if (held) {
      const beds = held.beds || [];
      const keeps = held.keeps || [];
      seq.current = { bed: beds.length, keep: keeps.length };
      setDoc((d) => ({ ...d, ...held, v: undefined, savedAt: undefined }));
      if (held.view) setView(held.view);
      if (held.layer) setLayer(held.layer);
      setActiveId(beds[0] ? beds[0].id : null);
      setDraft({ savedAt: held.savedAt || null, bytes: draftBytes() });
      setNotice({
        kind: 'info',
        text: `Picked up ${held.slug ? `"${held.slug}"` : 'the unsaved draft'}, saved ${new Date(held.savedAt).toLocaleString()}.`,
      });
    }
  }, []);

  useEffect(() => {
    autosave.current.queue({ ...doc, view, layer });
  }, [doc, view, layer]);

  useEffect(() => {
    const flush = () => autosave.current.now({ ...docRef.current, view: viewRef.current, layer });
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [layer]);

  /* ── the session ──────────────────────────────────────────────────────────── */

  const checkSession = useCallback(async () => {
    const res = await probeSession();
    setSession(res);
    return res;
  }, []);

  useEffect(() => {
    checkSession();
    const onVisible = () => {
      if (document.visibilityState === 'visible') checkSession();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [checkSession]);

  /* Esri tiles failing is ambiguous: a lapsed sign-in and an Esri outage look the
     same from an <img>. Ask, and only fall back to the keyless layer if the
     session is fine — dropping someone onto coarser imagery mid-trace without
     saying why is how a wrong line gets drawn. */
  const onImageryTrouble = useCallback(
    async (which) => {
      if (which !== 'imagery') return;
      const res = await checkSession();
      if (res.state !== 'ok') return;
      setLayer('naip');
      setNotice({
        kind: 'warn',
        text: 'Esri imagery is not answering, so the map fell back to the USGS aerial. What you trace now is traced on that.',
      });
    },
    [checkSession],
  );

  /* ── measurements ─────────────────────────────────────────────────────────── */

  const geo = useMemo(
    () =>
      measureOutline(
        doc.house,
        doc.beds.length ? doc.beds : doc.pin ? [{ id: 'pin', ring: [[doc.pin.lon, doc.pin.lat]] }] : [],
      ),
    [doc.house, doc.beds, doc.pin],
  );

  const zones = useMemo(() => {
    const out = {};
    for (const b of doc.beds) {
      const g = geo[b.id];
      if (!g || g.fromStructureFt == null) continue;
      out[b.id] = zoneForDistance(g.fromStructureFt);
      if (g.farFt != null) out[`${b.id}:far`] = zoneForDistance(g.farFt);
    }
    return out;
  }, [doc.beds, geo]);

  /* With beds on screen there is always a selected one, so the panels and the
     terrain read always have a subject — the template does the same. `house` is
     the exception: it means the house outline is what is being edited. */
  const activeBed =
    activeId === 'house' ? null : doc.beds.find((b) => b.id === activeId) || doc.beds[0] || null;
  const bedGeo = activeBed ? geo[activeBed.id] : null;
  const selectedId = activeBed ? activeBed.id : activeId;

  /* What a reading would describe: the selected bed, or the pin until there is
     one. Everything that reads the ground asks this. */
  const target = activeBed && bedGeo
    ? { kind: 'bed', id: activeBed.id, name: activeBed.name, sig: ringSig(activeBed.ring), lat: bedGeo.lat, lon: bedGeo.lon }
    : doc.pin
      ? { kind: 'pin', lat: doc.pin.lat, lon: doc.pin.lon }
      : null;

  const stale = useMemo(() => {
    const r = doc.reading;
    if (!r || !target) return null;
    const f = r.for;
    if (target.kind === 'bed') {
      if (!f || f.kind !== 'bed' || f.id !== target.id) return 'other';
      return f.sig !== target.sig ? 'redrawn' : null;
    }
    if (f && f.kind === 'bed') return 'other';
    return f && feetBetween(f, target) > 30 ? 'moved' : null;
  }, [doc.reading, target]);

  const clashes = useMemo(() => nameClashes(doc), [doc]);
  const bedNameErrors = useMemo(() => {
    const out = {};
    for (const b of doc.beds) {
      const taken = doc.beds.filter((o) => o.id !== b.id).map((o) => o.name);
      out[b.id] = nameError(b.name, { taken }) || bedNoteError(b.note) ? nameError(b.name, { taken }) : null;
    }
    return out;
  }, [doc.beds]);
  const keepNameErrors = useMemo(() => {
    const out = {};
    for (const k of doc.keeps) out[k.id] = keepNameError(k.name);
    return out;
  }, [doc.keeps]);

  /* ── finding the site ─────────────────────────────────────────────────────── */

  const openAt = (lat, lon, z = MAP_Z_DEFAULT) => {
    const next = { lat, lon, z };
    viewRef.current = next;
    setView(next);
  };

  const lookup = async () => {
    const typed = (doc.address || '').trim();
    if (!typed) return;
    setNotice(null);

    const coords = typed.match(COORDS);
    if (coords) {
      const lat = Number(coords[1]);
      const lon = Number(coords[2]);
      if (outsideCoverage(lat, lon)) {
        setNotice({ kind: 'error', text: 'That is outside Colorado, which is the range this database answers for.' });
        return;
      }
      set({ site: { lat, lon, matchedAddress: null, source: 'coordinates, as given' } });
      openAt(lat, lon);
      return;
    }

    setBusy('lookup');
    try {
      const res = await fetch(`/api/site-lookup?address=${encodeURIComponent(typed)}`);
      const body = await res.json();
      if (!res.ok) {
        setNotice({ kind: 'error', text: body.message || 'That address could not be found.' });
        return;
      }
      if (outsideCoverage(body.lat, body.lon)) {
        setNotice({ kind: 'error', text: `${body.matchedAddress || 'That address'} is outside Colorado.` });
        return;
      }
      set({ site: body });
      openAt(body.lat, body.lon);
    } catch {
      setNotice({ kind: 'error', text: 'The lookup did not answer. Try again, or paste coordinates instead.' });
    } finally {
      setBusy(null);
    }
  };

  const readGround = async () => {
    if (!target) return;
    const what = target.kind === 'bed' ? target.name : 'that pin';
    if (outsideCoverage(target.lat, target.lon)) {
      setNotice({ kind: 'error', text: `${what} is outside Colorado.` });
      return;
    }
    const radiusM = target.kind === 'bed' ? bedRadiusM(bedGeo) : SITE_RULES.analysisRadiusM;
    setBusy('terrain');
    setNotice(null);
    try {
      const terrain = await measureTerrain(target.lat, target.lon, radiusM);
      if (terrain.elevFt == null) {
        setNotice({ kind: 'error', text: `USGS has no elevation at ${what}.` });
        return;
      }
      /* An incoherent bearing is reported and NOT applied — the same gate
         elevation.py applies, for the same reason. */
      const trusted =
        terrain.aspectDeg != null &&
        terrain.aspectCoherence != null &&
        terrain.aspectCoherence >= SITE_RULES.aspectCoherence.incoherent;
      const reading = {
        ...terrain,
        aspectApplied: trusted ? terrain.aspectDeg : null,
        readAt: new Date().toISOString(),
        for: { kind: target.kind, id: target.id, name: target.name, sig: target.sig, lat: target.lat, lon: target.lon },
      };
      set({ reading });
      if (target.kind === 'bed') {
        set((d) => ({
          beds: d.beds.map((b) => (b.id === target.id ? { ...b, reading: { ...terrain, sig: target.sig, readAt: reading.readAt } } : b)),
        }));
      }
    } catch (err) {
      setNotice({ kind: 'error', text: `${err && err.message ? err.message : 'USGS 3DEP did not answer.'}` });
    } finally {
      setBusy(null);
    }
  };

  const readBed = (id) => {
    setActiveId(id);
    setTimeout(readGround, 0);   // after the selection lands, so `target` is the bed
  };

  /* ── footprints ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!view || mark !== 'house' || houseMode !== 'tap' || view.z < FOOTPRINT_MIN_Z) {
      setFootprints([]);
      return undefined;
    }
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        setFootprints(await fetchFootprints(view, ctl.signal));
      } catch (err) {
        if (err.name !== 'AbortError') setFootprints([]);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [view, mark, houseMode]);

  /* ── tracing ──────────────────────────────────────────────────────────────── */

  const tracedOn = useCallback(() => {
    if (layer === 'imagery') return { layer: 'imagery', source: 'Esri World Imagery' };
    if (layer === 'naip') {
      return { layer: 'naip', source: 'USGS NAIP Plus', captured: (doc.reading && doc.reading.imageryYear) || null };
    }
    return { layer, source: 'USGS 3DEP hillshade' };
  }, [layer, doc.reading]);

  const startTrace = (what, redrawId) => {
    setTrace({ what, ring: [], redrawId });
    setEditing(false);
    setNotice(null);
  };

  const closeTrace = useCallback(() => {
    const t = trace;
    if (!t) return;
    const ring = dedupeRing(t.ring);
    if (ring.length < 3) {
      setNotice({ kind: 'error', text: 'An outline needs at least three corners.' });
      return;
    }
    if (ringSelfCrosses(ring)) {
      setNotice({ kind: 'error', text: 'The outline crosses itself. Undo back past the crossing and go round the other way.' });
      return;
    }
    if (ringAreaM2(ring) < GEO.minAreaM2) {
      setNotice({ kind: 'error', text: `That encloses less than ${GEO.minAreaM2} m² — a slip rather than a shape.` });
      return;
    }
    const on = tracedOn();
    if (t.what === 'house') {
      edit({ house: { kind: 'traced', ring, tracedOn: on } });
    } else if (t.what === 'bed') {
      if (t.redrawId) {
        edit((d) => ({ beds: d.beds.map((b) => (b.id === t.redrawId ? { ...b, ring, tracedOn: on, reading: null } : b)) }));
      } else {
        seq.current.bed += 1;
        const id = `b${seq.current.bed}`;
        edit((d) => ({ beds: [...d.beds, { id, name: `Bed ${seq.current.bed}`, ring, note: '', light: '', tracedOn: on }] }));
        setActiveId(id);
      }
    } else {
      seq.current.keep += 1;
      edit((d) => ({ keeps: [...d.keeps, { id: `k${seq.current.keep}`, kind: 'traced', name: '', ring }] }));
    }
    setTrace(null);
  }, [trace, tracedOn, edit]);

  /* ── what a tap means ─────────────────────────────────────────────────────── */

  const onTap = useCallback(
    (fx, fy) => {
      const v = viewRef.current;
      if (!v) return null;
      const [lat, lon] = mapPointAt(v, fx, fy);
      setNotice(null);

      /* A trace in progress takes every tap, whatever else is selected. */
      if (trace) {
        const r = trace.ring;
        const box = stageRef.current?.getBoundingClientRect();
        if (r.length >= 3 && box) {
          const [f0x, f0y] = mapFractionOf(v, r[0][1], r[0][0]);
          if (Math.hypot((fx - f0x) * box.width, (fy - f0y) * box.height) < CLOSE_PX) {
            closeTrace();
            return 'closed';
          }
        }
        setTrace((t) => ({ ...t, ring: [...t.ring, [r7(lon), r7(lat)]] }));
        return 'corner';
      }

      if (mark === 'house') {
        if (houseMode === 'tap') {
          /* The smallest footprint containing the tap: a house, a garage and a
             shed are often all tagged with the same street address. */
          const hit = footprints
            .filter((f) => ringContains(f.ring, lat, lon))
            .sort((a, b) => (a.sqm || Infinity) - (b.sqm || Infinity))[0];
          if (hit) {
            edit({
              house: {
                kind: 'footprint',
                ring: dedupeRing(hit.ring),
                addr: hit.addr,
                sqm: hit.sqm,
                imageDate: hit.imageDate,
                tracedOn: null,
              },
            });
          }
          return null;
        }
        if (houseMode === 'point') {
          edit({ house: { kind: 'point', lat: r7(lat), lon: r7(lon) } });
          return null;
        }
        return null;
      }

      if (mark === 'keep') {
        seq.current.keep += 1;
        edit((d) => ({ keeps: [...d.keeps, { id: `k${seq.current.keep}`, kind: 'point', name: '', lat: r7(lat), lon: r7(lon) }] }));
        return null;
      }

      if (mark === 'bed' && doc.beds.length) {
        const hit = doc.beds
          .filter((b) => ringContains(b.ring, lat, lon))
          .sort((a, b) => (geo[a.id]?.areaM2 || Infinity) - (geo[b.id]?.areaM2 || Infinity))[0];
        if (hit) {
          setActiveId(hit.id);
          return null;
        }
      }

      if (mark === 'pin') {
        set({ pin: { lat: r7(lat), lon: r7(lon) } });
      }
      return null;
    },
    [trace, mark, houseMode, footprints, doc.beds, geo, closeTrace, edit, set],
  );

  /* ── panning, zooming ─────────────────────────────────────────────────────── */

  const onZoom = useCallback((dz, fx, fy, opts = {}) => {
    if (opts.undoCorner) setTrace((t) => (t && t.ring.length ? { ...t, ring: t.ring.slice(0, -1) } : t));
    const v = viewRef.current;
    if (!v) return;
    const next = zoomAbout(v, dz, fx, fy);
    viewRef.current = next;
    setView(next);
  }, []);

  const onPan = useCallback((dxPx, dyPx, box) => {
    const v = viewRef.current;
    if (!v) return;
    const b = mapBbox(v);
    const [lat, lon] = from3857(
      (b.xmin + b.xmax) / 2 - (dxPx / box.width) * b.s,
      (b.ymin + b.ymax) / 2 + (dyPx / box.height) * b.s,
    );
    const next = { ...v, lat, lon };
    viewRef.current = next;
    setView(next);
  }, []);

  /* ── corners ──────────────────────────────────────────────────────────────── */

  const editable = useMemo(() => {
    if (!editing) return null;
    if (activeId === 'house' && doc.house && doc.house.kind !== 'point') {
      return { kind: 'house', id: 'house', ring: doc.house.ring, what: 'The house outline' };
    }
    const bed = doc.beds.find((b) => b.id === selectedId);
    return bed ? { kind: 'bed', id: bed.id, ring: bed.ring, what: bed.name } : null;
  }, [editing, activeId, selectedId, doc.house, doc.beds]);

  const hitTest = useCallback(
    (fx, fy, pointerType) => {
      const v = viewRef.current;
      const box = stageRef.current?.getBoundingClientRect();
      if (!editable || !v || !box || trace) return null;
      const radius = pointerType === 'touch' ? TOUCH_HIT_PX : HIT_PX;
      const vert = nearestVertex(v, editable.ring, fx, fy, box.width, radius);
      if (vert) return { ...editable, i: vert.i, insert: false };
      const edge = nearestEdge(v, editable.ring, fx, fy, box.width, radius);
      if (edge) return { ...editable, i: edge.at, insert: true };
      return null;
    },
    [editable, trace],
  );

  const onVertexMove = useCallback((hit, fx, fy, moved) => {
    setDragging({ kind: hit.kind, id: hit.id, i: hit.i, at: moved ? [fx, fy] : null, insert: hit.insert });
    if (!moved && !hit.insert) setSelectedVertex({ kind: hit.kind, id: hit.id, i: hit.i });
  }, []);

  const onVertexDrop = useCallback(
    (hit, at, moved) => {
      setDragging(null);
      const v = viewRef.current;
      if (!v || !at || !moved) return;
      const [fx, fy] = at;
      const res = hit.insert
        ? insertVertex(v, hit.ring, hit.i, fx, fy, hit.what)
        : moveVertex(v, hit.ring, hit.i, fx, fy, hit.what);
      if (res.error) {
        setNotice({ kind: 'error', text: `${res.error} Put back.` });
        return;
      }
      commitRing(hit, res.ring);
      if (hit.insert) setSelectedVertex({ kind: hit.kind, id: hit.id, i: hit.i });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function commitRing(hit, ring) {
    if (hit.kind === 'house') {
      edit((d) => ({ house: { ...d.house, ring, tracedOn: d.house.tracedOn || tracedOn() } }));
    } else {
      edit((d) => ({ beds: d.beds.map((b) => (b.id === hit.id ? { ...b, ring, reading: b.reading } : b)) }));
    }
  }

  const dropSelectedVertex = useCallback(() => {
    if (!editable || !selectedVertex || selectedVertex.id !== editable.id) return;
    const res = deleteVertex(editable.ring, selectedVertex.i, editable.what);
    if (res.error) {
      setNotice({ kind: 'error', text: res.error });
      return;
    }
    commitRing(editable, res.ring);
    setSelectedVertex(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable, selectedVertex]);

  /* ── keyboard ─────────────────────────────────────────────────────────────── */

  useEffect(() => {
    const onKey = (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if (e.key === 'Escape' && trace) {
        setTrace(null);
        return;
      }
      if (typing) return;
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.key === 'Backspace' || e.key === 'Delete') && selectedVertex) {
        e.preventDefault();
        dropSelectedVertex();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [trace, undo, redo, selectedVertex, dropSelectedVertex]);

  /* ── files ────────────────────────────────────────────────────────────────── */

  const download = (name, text, type) => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fileDoc = () => ({ ...doc, drawnAt: localDate() });
  const stem = () => `nextsteppe-outline-${doc.slug ? `${doc.slug}-` : ''}${localDate()}`;

  const saveGeoJson = () => {
    autosave.current.now({ ...doc, view, layer });
    download(`${stem()}.geojson`, `${JSON.stringify(outlineGeoJson(fileDoc()), null, 2)}\n`, 'application/geo+json');
  };
  const saveKml = () => download(`${stem()}.kml`, outlineKml(fileDoc()), 'application/vnd.google-earth.kml+xml');

  const openFile = async (file) => {
    try {
      const { doc: read, clashes: dupes } = readOutline(await file.text());
      const fixed = deduplicateNames(read.beds);
      seq.current = { bed: fixed.items.length, keep: read.keeps.length };
      edit({ house: read.house, beds: fixed.items, keeps: read.keeps });
      setActiveId(fixed.items[0] ? fixed.items[0].id : null);
      if (read.house) {
        const ring = read.house.ring || [[read.house.lon, read.house.lat]];
        const lat = ring.reduce((t, p) => t + p[1], 0) / ring.length;
        const lon = ring.reduce((t, p) => t + p[0], 0) / ring.length;
        openAt(lat, lon, MAP_Z_MAX - 2);
      }
      setNotice(
        fixed.renamed.length || dupes.length
          ? {
              kind: 'warn',
              text: `Opened. ${fixed.renamed.length} name${fixed.renamed.length === 1 ? '' : 's'} clashed and ${
                fixed.renamed.length === 1 ? 'was' : 'were'
              } suffixed (${fixed.renamed.map((r) => `${r.from} → ${r.to}`).join(', ')}) — the pipeline keys features by name.`,
            }
          : { kind: 'info', text: `Opened ${file.name}.` },
      );
    } catch (err) {
      setNotice({ kind: 'error', text: err.message || 'That file could not be read.' });
    }
  };

  /* ── render ───────────────────────────────────────────────────────────────── */

  const gestures = useMapGestures({
    view,
    stageRef,
    layerRef,
    onTap,
    onZoom,
    onPan,
    hitTest,
    onVertexMove,
    onVertexDrop,
    tracing: !!trace,
  });

  const sessionNote = sessionMessage(session.state, { exp: session.exp });
  const housed = !!doc.house;
  const ready = !!(doc.house || doc.beds.length || doc.keeps.length);

  return (
    <div className="st-app">
      <Notice kind={session.state === 'ok' ? 'info' : 'error'}>{sessionNote}</Notice>
      <Notice kind={notice ? notice.kind : 'info'} onDismiss={() => setNotice(null)}>
        {notice ? notice.text : null}
      </Notice>

      <div className="st-split">
        <div className="st-map">
          {view ? (
            <>
              <div className="st-map__bar">
                <div className="st-choice">
                  {Object.entries(MAP_LAYERS).map(([key, l]) => (
                    <button
                      type="button"
                      key={key}
                      className={`st-btn${layer === key ? ' st-btn--on' : ''}`}
                      title={l.hint}
                      onClick={() => setLayer(key)}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
                <div className="st-choice">
                  {[
                    { key: 'house', label: 'House' },
                    { key: 'bed', label: 'Beds' },
                    { key: 'keep', label: 'Keep' },
                    { key: 'pin', label: 'Pin' },
                  ].map((m) => (
                    <button
                      type="button"
                      key={m.key}
                      className={`st-btn${mark === m.key ? ' st-btn--on' : ''}`}
                      onClick={() => {
                        setMark(m.key);
                        setTrace(null);
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <div className="st-choice">
                  <button type="button" className="st-btn" onClick={() => onZoom(-1, 0.5, 0.5)} disabled={view.z <= MAP_Z_MIN}>
                    −
                  </button>
                  <span className="st-zoom">z{view.z}</span>
                  <button type="button" className="st-btn" onClick={() => onZoom(1, 0.5, 0.5)} disabled={view.z >= MAP_Z_MAX}>
                    +
                  </button>
                  <button type="button" className="st-btn st-btn--quiet" onClick={undo} disabled={!hist.past.length}>
                    Undo
                  </button>
                  <button type="button" className="st-btn st-btn--quiet" onClick={redo} disabled={!hist.future.length}>
                    Redo
                  </button>
                </div>
              </div>

              <MapStage
                view={view}
                layer={layer}
                doc={doc}
                trace={trace}
                activeBedId={selectedId}
                footprints={footprints}
                showFootprints={mark === 'house' && houseMode === 'tap'}
                editing={editing}
                dragging={dragging}
                pin={doc.pin}
                gestures={gestures}
                stageRef={stageRef}
                layerRef={layerRef}
                onImageryTrouble={onImageryTrouble}
              />

              {trace ? (
                <div className="st-trace-bar">
                  <span>
                    Tracing {trace.what === 'house' ? 'the house' : trace.what}: {trace.ring.length} corner
                    {trace.ring.length === 1 ? '' : 's'}. Tap the first again to close.
                  </span>
                  <button type="button" className="st-btn" onClick={closeTrace} disabled={trace.ring.length < 3}>
                    Close
                  </button>
                  <button
                    type="button"
                    className="st-btn st-btn--quiet"
                    onClick={() => setTrace((t) => ({ ...t, ring: t.ring.slice(0, -1) }))}
                    disabled={!trace.ring.length}
                  >
                    Undo corner
                  </button>
                  <button type="button" className="st-btn st-btn--quiet" onClick={() => setTrace(null)}>
                    Cancel
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <p className="st-empty">Find a site to open the map.</p>
          )}
        </div>

        <div className="st-panels">
          <SitePanel
            open={open.site}
            onToggle={() => setOpen((o) => ({ ...o, site: !o.site }))}
            slug={doc.slug}
            onSlug={(v) => set({ slug: v.trim() })}
            address={doc.address}
            onAddress={(v) => set({ address: v })}
            onLookup={lookup}
            site={doc.site}
            reading={doc.reading}
            stale={stale}
            busy={busy}
            onRead={readGround}
            canRead={!!target}
            readLabel={
              target ? `Read the ground at ${target.kind === 'bed' ? target.name : 'the pin'}` : 'Drop a pin or trace a bed first'
            }
          />

          <HousePanel
            open={open.house}
            onToggle={() => setOpen((o) => ({ ...o, house: !o.house }))}
            mode={houseMode}
            onMode={(m) => {
              setHouseMode(m);
              setMark('house');
              setTrace(null);
            }}
            house={doc.house}
            zoom={view ? view.z : MAP_Z_DEFAULT}
            onClear={() => edit({ house: null })}
            onTrace={() => {
              setMark('house');
              startTrace('house');
            }}
            tracing={!!trace && trace.what === 'house'}
            editing={editing && activeId === 'house'}
            onEdit={() => {
              setActiveId(editing && activeId === 'house' ? null : 'house');
              setEditing(!(editing && activeId === 'house'));
            }}
          />

          <BedsPanel
            open={open.beds}
            onToggle={() => setOpen((o) => ({ ...o, beds: !o.beds }))}
            beds={doc.beds.map((b) => ({ ...b, sig: ringSig(b.ring) }))}
            geo={geo}
            zones={zones}
            activeId={selectedId}
            onSelect={setActiveId}
            onTrace={() => {
              setMark('bed');
              startTrace('bed');
            }}
            tracing={!!trace && trace.what === 'bed'}
            onRename={(id, name) => edit((d) => ({ beds: d.beds.map((b) => (b.id === id ? { ...b, name } : b)) }))}
            onNote={(id, note) => edit((d) => ({ beds: d.beds.map((b) => (b.id === id ? { ...b, note } : b)) }))}
            onLight={(id, light) => edit((d) => ({ beds: d.beds.map((b) => (b.id === id ? { ...b, light } : b)) }))}
            onRedraw={(id) => {
              setMark('bed');
              startTrace('bed', id);
            }}
            onDelete={(id) => {
              edit((d) => ({ beds: d.beds.filter((b) => b.id !== id) }));
              if (activeId === id) setActiveId(null);
            }}
            onEdit={() => setEditing((v) => !v)}
            editing={editing && !!activeBed}
            onReadBed={readBed}
            nameErrors={bedNameErrors}
            housed={housed}
          />

          <KeepsPanel
            open={open.keeps}
            onToggle={() => setOpen((o) => ({ ...o, keeps: !o.keeps }))}
            keeps={doc.keeps}
            onPoint={() => {
              setMark('keep');
              setTrace(null);
            }}
            marking={mark === 'keep' && !trace}
            onTrace={() => {
              setMark('keep');
              startTrace('keep');
            }}
            tracing={!!trace && trace.what === 'keep'}
            onRename={(id, name) => edit((d) => ({ keeps: d.keeps.map((k) => (k.id === id ? { ...k, name } : k)) }))}
            onDelete={(id) => edit((d) => ({ keeps: d.keeps.filter((k) => k.id !== id) }))}
            errors={keepNameErrors}
          />

          <ExportPanel
            open={open.files}
            onToggle={() => setOpen((o) => ({ ...o, files: !o.files }))}
            onGeoJson={saveGeoJson}
            onKml={saveKml}
            onOpenFile={openFile}
            clashes={clashes}
            ready={ready && !slugError(doc.slug)}
            draft={draft}
            onDeleteDraft={() => {
              deleteDraft(doc.slug);
              deleteDraft('');
              autosave.current.resume();
              setDraft({ savedAt: null, bytes: draftBytes() });
            }}
            onDeleteAll={() => {
              deleteEverything();
              autosave.current.resume();
              setDraft({ savedAt: null, bytes: 0 });
            }}
            autosaveStopped={autosave.current.stopped}
          />
        </div>
      </div>
    </div>
  );
}
