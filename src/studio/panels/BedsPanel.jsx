/**
 * The beds — the reason this tool is private.
 *
 * WHAT EACH FIELD IS FOR DOWNSTREAM, because none of it is decoration:
 *
 *   name     geometry.py keys plan.json's features BY NAME, and layout.py joins
 *            back on the same key. Two beds with one name is one ring recorded
 *            twice and a planting measured from the wrong shape, so a clash is
 *            refused at the point of typing rather than at export.
 *   note     the words an image model is given for the bed — `render_beds.py spec
 *            --bed-from "<name>"` reads exactly this. No digits: a street number
 *            is the one thing that must never reach a prompt, and the fence is
 *            enforced again by intake.py.
 *   light    declared, and recorded as such. compose.py measures shade from lidar
 *            and FLAGS a disagreement rather than believing either one — so this
 *            is a note to a person, not an override.
 *   reading  elevation, slope and aspect over THIS bed, at a radius wide enough to
 *            contain it. Kept with the ring it was taken over, so redrawing the
 *            bed retires the reading instead of silently re-describing new ground.
 */

import { SITE_RULES } from '../engine/rules.js';
import { Area, Choice, Notice, Panel, Text } from './Fields.jsx';
import { NAME_MAX } from '../engine/edit.js';

const BED_NOTE_MAX = 160;   // render_beds.BED_MAX_CHARS
const hasDigit = (s) => /\p{Nd}/u.test(s || '');

export const bedNoteError = (note) => {
  if (!note) return null;
  if ([...note].length > BED_NOTE_MAX) return `At most ${BED_NOTE_MAX} characters — it goes into a prompt.`;
  if (hasDigit(note)) return 'No digits: a street number is exactly what must not reach an image model.';
  return null;
};

const SUN_LEVELS = Object.keys(SITE_RULES.sunLevels || {});

export default function BedsPanel({
  open,
  onToggle,
  beds,
  geo,
  zones,
  activeId,
  onSelect,
  onTrace,
  tracing,
  onRename,
  onNote,
  onLight,
  onRedraw,
  onDelete,
  onEdit,
  editing,
  onReadBed,
  nameErrors,
  housed,
}) {
  return (
    <Panel title="Beds" aside={beds.length ? `${beds.length} traced` : 'none yet'} open={open} onToggle={onToggle}>
      <div className="st-actions">
        <button type="button" className="st-btn" onClick={onTrace} disabled={tracing}>
          {tracing ? 'Tracing — tap the first corner to close' : 'Trace a bed'}
        </button>
        {beds.length ? (
          <button type="button" className={`st-btn${editing ? ' st-btn--on' : ''}`} onClick={onEdit} disabled={!activeId}>
            {editing ? 'Done with corners' : 'Move corners'}
          </button>
        ) : null}
      </div>

      {editing ? (
        <Notice kind="info">
          Drag a corner to move it, drag an edge to add one, and press Delete with a corner selected to
          remove it. An edit that would cross the outline is put back with the reason.
        </Notice>
      ) : null}

      {!housed && beds.length ? (
        <Notice kind="warn">
          No house is marked, so these beds have no distance and no zone. compose.py refuses a bed with
          no measured distance to the structure.
        </Notice>
      ) : null}

      {beds.map((b) => {
        const g = geo[b.id] || {};
        const zone = zones[b.id] || null;
        const fresh = b.reading && b.reading.sig === b.sig;
        return (
          <article key={b.id} className={`st-bed-card${b.id === activeId ? ' st-bed-card--on' : ''}`}>
            <header className="st-bed-card__head">
              <button type="button" className="st-bed-card__pick" onClick={() => onSelect(b.id)}>
                {b.id === activeId ? '● ' : '○ '}
              </button>
              <Text label="Name" value={b.name} onChange={(v) => onRename(b.id, v)} maxLength={NAME_MAX} error={nameErrors[b.id]} />
            </header>

            <dl className="st-measures">
              <div>
                <dt>Area</dt>
                <dd>{g.areaFt2 != null ? `${g.areaFt2.toLocaleString()} ft²` : '—'}</dd>
              </div>
              <div>
                <dt>Perimeter</dt>
                <dd>{g.perimeterFt != null ? `${g.perimeterFt} ft` : '—'}</dd>
              </div>
              <div>
                <dt>From the wall</dt>
                <dd>{g.fromStructureFt != null ? `${g.fromStructureFt} ft` : '—'}</dd>
              </div>
              <div>
                <dt>Zone</dt>
                <dd>{zone ? `${zone.name}${zone.minIgn ? ` · ign ≥ ${zone.minIgn}` : ''}` : '—'}</dd>
              </div>
            </dl>

            {g.fromStructureFt === 0 ? (
              <Notice kind="warn">This bed overlaps the house outline, so the gap measures zero.</Notice>
            ) : null}
            {zone && g.farFt != null && zones[`${b.id}:far`] && zones[`${b.id}:far`].name !== zone.name ? (
              <Notice kind="info">
                It spans {zone.name} at its near edge and {zones[`${b.id}:far`].name} at {g.farFt} ft. The
                planting is composed against the nearer band.
              </Notice>
            ) : null}

            <Area
              label="Note — the words a rendering is given"
              value={b.note}
              onChange={(v) => onNote(b.id, v)}
              maxLength={BED_NOTE_MAX + 40}
              placeholder="the island bed between the paver driveway and the road, under the blue spruce"
              hint={`${[...(b.note || '')].length}/${BED_NOTE_MAX} · render_beds.py spec --bed-from "${b.name}"`}
              error={bedNoteError(b.note)}
            />

            <Choice label="Light, as declared" value={b.light || ''} onChange={(v) => onLight(b.id, v)} options={SUN_LEVELS} />

            <div className="st-actions">
              <button type="button" className="st-btn st-btn--quiet" onClick={() => onReadBed(b.id)}>
                {fresh ? 'Re-read the ground' : 'Read the ground here'}
              </button>
              <button type="button" className="st-btn st-btn--quiet" onClick={() => onRedraw(b.id)}>
                Redraw
              </button>
              <button type="button" className="st-btn st-btn--quiet" onClick={() => onDelete(b.id)}>
                Delete
              </button>
            </div>

            {b.reading ? (
              <p className="st-row__hint">
                {fresh ? 'Read' : 'Read before it was redrawn'}: {b.reading.elevFt?.toLocaleString()} ft,{' '}
                {b.reading.slopePct}% slope, over {b.reading.radiusM} m.
              </p>
            ) : null}
          </article>
        );
      })}
    </Panel>
  );
}
