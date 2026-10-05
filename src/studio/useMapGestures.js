/**
 * The map's gestures: pan, pinch, wheel, tap, double-tap — and dragging a corner.
 *
 * PORTED from the template's MAP INTERACTION block, with its rules kept because
 * they were each paid for: one state update per gesture and never per frame (the
 * tile layer moves under a CSS transform the compositor handles, and only the
 * commit re-renders); two fingers are a pinch and not two pans; a pinch commits
 * at whole levels because the grid has no fractional ones; one wheel gesture is
 * one level; and a double-tap takes back the corner its first tap dropped.
 *
 * WHAT IS NEW HERE: DRAGGING A CORNER
 * Hit-testing runs BEFORE panning, so a finger that lands on a corner handle
 * moves the corner and a finger that lands anywhere else moves the map. That
 * order is the whole trick, and it is why `hitTest` is passed in rather than
 * inferred: only the app knows which shape is selected and therefore editable.
 *
 * The live drag reports positions as they happen (`onVertexMove`) and the edit is
 * vetted once, on release (`onVertexDrop`). A corner that would cross the outline
 * is refused there, with the shape snapping back — so an illegal shape is never
 * held in state, not even for a frame.
 */

import { useCallback, useEffect, useRef } from 'react';

const DRAG_SLOP_PX = 4;      // below this a pointer was a tap, not a pan
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_PX = 24;
const PINCH_IN = 1.5;        // past this a pinch is a level in
const PINCH_OUT = 0.67;      // below this, a level out

export function useMapGestures({
  view,
  stageRef,
  layerRef,
  onTap,
  onZoom,
  onPan,
  hitTest,
  onVertexMove,
  onVertexDrop,
  tracing = false,
}) {
  const drag = useRef(null);
  const pinch = useRef(null);
  const vertex = useRef(null);
  const tap = useRef(null);
  const wheel = useRef({ at: 0 });

  const box = useCallback(() => stageRef.current?.getBoundingClientRect(), [stageRef]);

  const setTransform = useCallback(
    (t) => {
      const el = layerRef.current;
      if (el) el.style.transform = t;
    },
    [layerRef],
  );

  const fractionOf = useCallback(
    (e, b) => [(e.clientX - b.left) / b.width, (e.clientY - b.top) / b.height],
    [],
  );

  const onPointerDown = useCallback(
    (e) => {
      if (!view) return;
      const el = stageRef.current;
      const b = box();
      if (!el || !b) return;

      /* A second finger turns a pan into a pinch rather than starting a rival pan. */
      if (pinch.current) return;
      if (drag.current && drag.current.id !== e.pointerId) {
        const d = drag.current;
        drag.current = null;
        setTransform('');
        const dx = e.clientX - d.lastX;
        const dy = e.clientY - d.lastY;
        pinch.current = {
          a: { id: d.id, x: d.lastX, y: d.lastY },
          b: { id: e.pointerId, x: e.clientX, y: e.clientY },
          d0: Math.hypot(dx, dy) || 1,
          scale: 1,
        };
        return;
      }
      if (vertex.current) return;

      /* Pointer capture keeps a drag tracking after the finger leaves the stage.
         It THROWS when the id is not an active pointer, which `?.` does not
         protect against — the method exists and the call fails. Capture is an
         enhancement, so a failure must never reach the console. */
      try {
        el.setPointerCapture?.(e.pointerId);
      } catch {
        /* not capturable */
      }

      /* A corner first, the map second. */
      const [fx, fy] = fractionOf(e, b);
      const hit = hitTest ? hitTest(fx, fy, e.pointerType) : null;
      if (hit) {
        vertex.current = { id: e.pointerId, hit, moved: false };
        onVertexMove?.(hit, fx, fy, false);
        return;
      }

      drag.current = {
        id: e.pointerId,
        x0: e.clientX,
        y0: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        dx: 0,
        dy: 0,
        moved: false,
      };
    },
    [box, fractionOf, hitTest, onVertexMove, setTransform, stageRef, view],
  );

  const onPointerMove = useCallback(
    (e) => {
      const b = box();

      const v = vertex.current;
      if (v && v.id === e.pointerId) {
        if (!b) return;
        const [fx, fy] = fractionOf(e, b);
        v.moved = true;
        v.at = [fx, fy];
        onVertexMove?.(v.hit, fx, fy, true);
        return;
      }

      const pz = pinch.current;
      if (pz) {
        if (e.pointerId === pz.a.id) {
          pz.a.x = e.clientX;
          pz.a.y = e.clientY;
        } else if (e.pointerId === pz.b.id) {
          pz.b.x = e.clientX;
          pz.b.y = e.clientY;
        } else return;
        const dist = Math.hypot(pz.a.x - pz.b.x, pz.a.y - pz.b.y) || 1;
        pz.scale = dist / pz.d0;
        if (b) {
          const mx = (pz.a.x + pz.b.x) / 2 - b.left;
          const my = (pz.a.y + pz.b.y) / 2 - b.top;
          setTransform(
            `translate(${mx}px, ${my}px) scale(${pz.scale}) translate(${-mx}px, ${-my}px)`,
          );
        }
        return;
      }

      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      d.lastX = e.clientX;
      d.lastY = e.clientY;
      d.dx = e.clientX - d.x0;
      d.dy = e.clientY - d.y0;
      if (Math.abs(d.dx) > DRAG_SLOP_PX || Math.abs(d.dy) > DRAG_SLOP_PX) d.moved = true;
      setTransform(`translate(${d.dx}px, ${d.dy}px)`);
    },
    [box, fractionOf, onVertexMove, setTransform],
  );

  const onPointerUp = useCallback(
    (e) => {
      const b = box();

      const v = vertex.current;
      if (v && v.id === e.pointerId) {
        vertex.current = null;
        const at = v.at || null;
        onVertexDrop?.(v.hit, at, v.moved);
        return;
      }

      const pz = pinch.current;
      if (pz && (e.pointerId === pz.a.id || e.pointerId === pz.b.id)) {
        pinch.current = null;
        setTransform('');
        if (b && pz.scale) {
          const dz = pz.scale >= PINCH_IN ? 1 : pz.scale <= PINCH_OUT ? -1 : 0;
          if (dz) {
            const mx = ((pz.a.x + pz.b.x) / 2 - b.left) / b.width;
            const my = ((pz.a.y + pz.b.y) / 2 - b.top) / b.height;
            onZoom?.(dz, mx, my);
          }
        }
        return;
      }

      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      drag.current = null;
      setTransform('');
      if (!b || !view) return;

      if (d.moved) {
        onPan?.(d.dx, d.dy, b);
        return;
      }

      const [fx, fy] = fractionOf(e, b);
      if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return;

      /* DOUBLE-TAP TO ZOOM, EXCEPT WHILE TRACING.
         Two taps close together in time and space are a zoom — unless an outline
         is being drawn, where they are two corners of a tight one. The template
         allows both and takes the corner back when a zoom wins; that is the right
         call for a visitor placing one pin, and the wrong one here, where corners
         20 px apart are ordinary and losing one silently is how a bed ends up the
         wrong shape. While a trace is open, every tap is a corner. */
      const now = e.timeStamp;
      const prev = tap.current;
      tap.current = { t: now, x: e.clientX, y: e.clientY };
      if (
        !tracing &&
        prev &&
        now - prev.t < DOUBLE_TAP_MS &&
        Math.abs(e.clientX - prev.x) < DOUBLE_TAP_PX &&
        Math.abs(e.clientY - prev.y) < DOUBLE_TAP_PX
      ) {
        tap.current = null;
        onZoom?.(1, fx, fy, { undoCorner: prev.corner });
        return;
      }

      tap.current.corner = onTap?.(fx, fy) === 'corner';
    },
    [box, fractionOf, onPan, onTap, onVertexDrop, onZoom, setTransform, tracing, view],
  );

  const onPointerCancel = useCallback(
    (e) => {
      if (vertex.current && vertex.current.id === e.pointerId) {
        const v = vertex.current;
        vertex.current = null;
        onVertexDrop?.(v.hit, null, false);   // put it back
        return;
      }
      if (drag.current && drag.current.id === e.pointerId) drag.current = null;
      if (pinch.current) pinch.current = null;
      setTransform('');
    },
    [onVertexDrop, setTransform],
  );

  /* ONE WHEEL GESTURE IS ONE LEVEL.
     A trackpad sends a stream of small deltas for what the hand did once; taking
     each one as a level walks from z16 to z20 in a flick. So a gesture is
     recognised by the gap between events, not by their number. */
  useEffect(() => {
    const el = stageRef.current;
    if (!el || !view) return undefined;
    const handler = (e) => {
      e.preventDefault();
      const b = el.getBoundingClientRect();
      const now = e.timeStamp || Date.now();
      if (now - wheel.current.at < 220) return;
      wheel.current.at = now;
      const dz = e.deltaY < 0 ? 1 : -1;
      onZoom?.(dz, (e.clientX - b.left) / b.width, (e.clientY - b.top) / b.height);
    };
    /* Not passive: the page must not scroll while the map zooms. */
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [onZoom, stageRef, view]);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
