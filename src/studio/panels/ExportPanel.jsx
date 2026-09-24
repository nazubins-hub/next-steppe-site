/**
 * Getting the work out, and the draft that holds it until you do.
 *
 * THE FILE IS THE HANDOFF. Nothing is stored on the server — HANDOFF.md's rule
 * that client geometry stays off every server did not stop applying when the tool
 * moved behind a sign-in. What leaves here is a GeoJSON that `geometry.py read`
 * takes unchanged, or a KML for Google Earth.
 *
 * WHAT IS REFUSED, AND WHY IT IS REFUSED HERE
 * A duplicate name. geometry.py builds `{name: ring}`, so two beds called the same
 * thing become one ring recorded twice, and every area, distance and plant that
 * follows is measured from the wrong shape — with nothing downstream able to
 * notice. The export is the last point at which a person is still looking.
 */

import { useRef } from 'react';

import { Notice, Panel } from './Fields.jsx';

const bytes = (n) => (n > 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);

export default function ExportPanel({
  open,
  onToggle,
  onGeoJson,
  onKml,
  onOpenFile,
  clashes,
  ready,
  draft,
  onDeleteDraft,
  onDeleteAll,
  autosaveStopped,
}) {
  const file = useRef(null);

  return (
    <Panel title="Files" aside={ready ? 'ready' : 'nothing to export yet'} open={open} onToggle={onToggle}>
      {clashes.length ? (
        <Notice kind="error">
          Two shapes share a name: {clashes.map((c) => `"${c.name}"`).join(', ')}. The pipeline keys features
          by name, so one ring would be recorded twice. Rename one before exporting.
        </Notice>
      ) : null}

      <div className="st-actions">
        <button type="button" className="st-btn st-btn--go" onClick={onGeoJson} disabled={!ready || clashes.length > 0}>
          Download GeoJSON
        </button>
        <button type="button" className="st-btn" onClick={onKml} disabled={!ready || clashes.length > 0}>
          KML
        </button>
        <button type="button" className="st-btn st-btn--quiet" onClick={() => file.current?.click()}>
          Open an outline…
        </button>
        <input
          ref={file}
          type="file"
          accept=".geojson,.json,application/geo+json,application/json"
          className="st-file"
          onChange={(e) => {
            const f = e.target.files && e.target.files[0];
            if (f) onOpenFile(f);
            e.target.value = '';
          }}
        />
      </div>

      <p className="st-row__hint">
        Then, in plant-system: <code>geometry.py read sites/&lt;slug&gt;/outline.geojson --slug &lt;slug&gt;</code>
      </p>

      <h3 className="st-sub">Draft</h3>
      <p className="st-row__hint">
        Saved in this browser only — {draft.savedAt ? `last at ${new Date(draft.savedAt).toLocaleTimeString()}` : 'not yet saved'}
        {draft.bytes ? `, ${bytes(draft.bytes)} in all` : ''}. It is what survives a reload or a lapsed
        sign-in; it is not a backup, and it never leaves this machine.
      </p>
      {autosaveStopped ? (
        <Notice kind="error">
          This browser&rsquo;s storage is full, so autosave has stopped. Export what you have, then delete
          old drafts — retrying every half-second against a full store would only make the tool stutter.
        </Notice>
      ) : null}
      <div className="st-actions">
        <button type="button" className="st-btn st-btn--quiet" onClick={onDeleteDraft}>
          Delete this draft
        </button>
        <button type="button" className="st-btn st-btn--quiet" onClick={onDeleteAll}>
          Delete every draft
        </button>
      </div>
    </Panel>
  );
}
