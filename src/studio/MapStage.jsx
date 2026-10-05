/**
 * The stage: a grid of tiles with the drawing on top.
 *
 * PORTED from the template's map, with its two structural ideas kept.
 *
 *   THE GHOST. When the layer or the level changes, the tiles already on screen
 *   are still perfectly good imagery of the same ground at the wrong scale. They
 *   are re-projected into the new geometry and left underneath until the
 *   replacements arrive, so the stage never goes beige mid-gesture.
 *
 *   ONE VIEWBOX, 0..1. Every overlay is drawn in stage fractions rather than
 *   pixels, so the same SVG is correct at any size and a coordinate only has to
 *   be converted once (mapFractionOf). Strokes use non-scaling-stroke, or a
 *   hairline would become a ribbon.
 *
 * WHAT IS NEW: corner handles on whichever shape is selected, which is the
 * visible half of being able to edit an outline after it is drawn. They are
 * drawn, but they are not what receives the drag — hit-testing is arithmetic in
 * useMapGestures, for the same reason taps are.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { MAP_LAYERS, mapFractionOf, mapTiles, mapTileUrl } from './engine/tiles.js';

const pointsOf = (view, ring) =>
  ring.map(([lon, lat]) => mapFractionOf(view, lat, lon).join(',')).join(' ');

const Marker = ({ at, kind, label }) => {
  if (!at) return null;
  const [x, y] = at;
  if (x < -0.2 || x > 1.2 || y < -0.2 || y > 1.2) return null;
  return (
    <g className={`st-marker st-marker--${kind}`} transform={`translate(${x} ${y})`}>
      <circle r="0.012" />
      {label ? <text y="-0.022">{label}</text> : null}
    </g>
  );
};

export default function MapStage({
  view,
  layer,
  doc,
  trace,
  activeBedId,
  footprints = [],
  showFootprints = false,
  editing = false,
  dragging = null,
  pin = null,
  gestures = {},
  stageRef,
  layerRef,
  onImageryTrouble,
}) {
  const [loaded, setLoaded] = useState(() => new Set());
  const [ghost, setGhost] = useState(null);
  const errors = useRef({ layer: null, n: 0, ok: 0 });

  const tiles = useMemo(() => (view ? mapTiles(view, layer, 1) : []), [view, layer]);
  const ghostTiles = useMemo(
    () => (view && ghost && (ghost.layer !== layer || ghost.z !== view.z) ? mapTiles(view, ghost.layer, 1) : []),
    [view, layer, ghost],
  );

  /* A tile is remembered by its own key, so panning back over ground already
     fetched does not re-blank it. */
  const note = (key) =>
    setLoaded((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });

  const ready = tiles.length > 0 && tiles.every((t) => loaded.has(`${layer}:${t.key}`));
  useEffect(() => {
    if (ready && view) setGhost({ layer, z: view.z });
  }, [ready, layer, view]);

  /* Esri failing is not the same as Esri being slow. Two failures with nothing
     loaded is the template's threshold, and it is the signal the app turns into
     either a fallback or "your sign-in lapsed" — it cannot tell which from here,
     so it reports and lets the app ask. */
  useEffect(() => {
    errors.current = { layer, n: 0, ok: 0 };
  }, [layer]);

  const failed = () => {
    const e = errors.current;
    e.n += 1;
    if (e.n >= 2 && e.ok === 0) onImageryTrouble?.(layer);
  };

  if (!view) return null;

  const beds = doc.beds || [];
  const keeps = doc.keeps || [];
  const house = doc.house || null;

  /* The shape a drag is moving, with the dragged corner at the pointer. Held
     here rather than in the document so an illegal shape is never committed —
     see edit.js. */
  const live = (kind, id, ring) => {
    if (!dragging || dragging.kind !== kind || dragging.id !== id || !dragging.at) return ring;
    const [fx, fy] = dragging.at;
    const b = stageRef.current?.getBoundingClientRect();
    if (!b) return ring;
    return ring.map((pt, i) => (i === dragging.i ? [null, null, fx, fy] : pt));
  };

  /* A ring for drawing: coordinates, except any corner being dragged, which is
     already a stage fraction. */
  const ringPoints = (kind, id, ring) =>
    live(kind, id, ring)
      .map((pt) => (pt[0] === null ? [pt[2], pt[3]] : mapFractionOf(view, pt[1], pt[0])))
      .map((p) => p.join(','))
      .join(' ');

  const handlesFor = (kind, id, ring) =>
    live(kind, id, ring).map((pt, i) => {
      const [x, y] = pt[0] === null ? [pt[2], pt[3]] : mapFractionOf(view, pt[1], pt[0]);
      return <circle key={i} className="st-handle" cx={x} cy={y} r="0.009" />;
    });

  const houseFraction = house && house.kind === 'point' ? mapFractionOf(view, house.lat, house.lon) : null;

  return (
    <div className="st-stage" ref={stageRef} {...gestures}>
      <div className="st-layer" ref={layerRef}>
        {ghostTiles.map((t) => (
          <img
            key={`ghost:${ghost.layer}:${t.key}`}
            className="st-tile st-tile--ghost"
            src={mapTileUrl(t, ghost.layer)}
            alt=""
            draggable="false"
            style={{ left: `${t.left * 100}%`, top: `${t.top * 100}%`, width: `${t.size * 100}%` }}
          />
        ))}
        {tiles.map((t) => (
          <img
            key={`${layer}:${t.key}`}
            className="st-tile"
            src={mapTileUrl(t, layer)}
            alt=""
            draggable="false"
            onLoad={() => {
              errors.current.ok += 1;
              note(`${layer}:${t.key}`);
            }}
            onError={failed}
            style={{ left: `${t.left * 100}%`, top: `${t.top * 100}%`, width: `${t.size * 100}%` }}
          />
        ))}
      </div>

      <svg className="st-draw" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
        {showFootprints
          ? footprints.map((f) => (
              <polygon key={f.id} className="st-footprint" points={pointsOf(view, f.ring)} />
            ))
          : null}

        {house && house.kind !== 'point' ? (
          <polygon className="st-house" points={ringPoints('house', 'house', house.ring)} />
        ) : null}

        {beds.map((b) => (
          <polygon
            key={b.id}
            className={`st-bed${b.id === activeBedId ? ' st-bed--active' : ''}`}
            points={ringPoints('bed', b.id, b.ring)}
          />
        ))}

        {keeps
          .filter((k) => k.kind !== 'point')
          .map((k) => (
            <polygon key={k.id} className="st-keep" points={ringPoints('keep', k.id, k.ring)} />
          ))}

        {trace && trace.ring.length ? (
          <>
            <polyline className="st-trace" points={pointsOf(view, trace.ring)} />
            {trace.ring.map(([lon, lat], i) => {
              const [x, y] = mapFractionOf(view, lat, lon);
              return <circle key={i} className={`st-corner${i === 0 ? ' st-corner--first' : ''}`} cx={x} cy={y} r="0.008" />;
            })}
          </>
        ) : null}

        {editing && house && house.kind !== 'point' && activeBedId === 'house'
          ? handlesFor('house', 'house', house.ring)
          : null}
        {editing
          ? beds
              .filter((b) => b.id === activeBedId)
              .flatMap((b) => handlesFor('bed', b.id, b.ring))
          : null}

        {keeps
          .filter((k) => k.kind === 'point')
          .map((k) => (
            <Marker key={k.id} at={mapFractionOf(view, k.lat, k.lon)} kind="keep" label={k.name || 'keep'} />
          ))}
        <Marker at={houseFraction} kind="house" label="house" />
        <Marker at={pin ? mapFractionOf(view, pin.lat, pin.lon) : null} kind="pin" />
      </svg>

      <p className="st-credit">
        {MAP_LAYERS[layer].credit}
        {showFootprints ? ' · Building outlines: FEMA/ORNL USA Structures (CC BY 4.0)' : ''}
      </p>
    </div>
  );
}
