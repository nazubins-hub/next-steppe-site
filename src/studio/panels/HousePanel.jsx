/**
 * The house: the outline every fire band is measured from.
 *
 * THREE WAYS TO SAY WHERE IT IS, in order of how much they are worth.
 *
 *   Tap a building   FEMA/ORNL USA Structures. One tap, and the outline is a real
 *                    roofline — but extracted from imagery dated 2012 across Vail
 *                    Village, so a house built or remodelled since is missing or
 *                    the wrong shape. The date travels with it into the export and
 *                    is shown here, because it is the reason to check by eye.
 *   Trace it         when the footprint is wrong, or absent.
 *   Just a pin       a point, not a shape. The gap arithmetic handles it as the
 *                    point it is, which measures to the CENTRE of a house rather
 *                    than its wall — a documented 13-72 ft of error on the test
 *                    addresses. It stays for a quick look, and the bundle export
 *                    refuses it: geometry.py drops a point building, and then
 *                    every bed loses its zone.
 */

import { Choice, Fact, Notice, Panel } from './Fields.jsx';
import { FOOTPRINT_MIN_Z } from '../engine/footprints.js';

export default function HousePanel({ open, onToggle, mode, onMode, house, zoom, onClear, onTrace, tracing, onEdit, editing }) {
  const kind = house ? house.kind : null;
  return (
    <Panel
      title="House"
      aside={kind === 'footprint' ? 'tapped outline' : kind === 'traced' ? 'traced' : kind === 'point' ? 'a pin only' : 'not marked'}
      open={open}
      onToggle={onToggle}
    >
      <Choice
        label="How to mark it"
        value={mode}
        onChange={onMode}
        options={[
          { key: 'tap', label: 'Tap a building', hint: 'USA Structures outlines, at z16 and closer' },
          { key: 'trace', label: 'Trace it', hint: 'draw the footprint yourself' },
          { key: 'point', label: 'Just a pin', hint: 'a point — measures to the centre, not the wall' },
        ]}
      />

      {mode === 'tap' && zoom < FOOTPRINT_MIN_Z ? (
        <Notice kind="info">Zoom to z{FOOTPRINT_MIN_Z} or closer and the building outlines appear.</Notice>
      ) : null}

      {mode === 'trace' ? (
        <div className="st-actions">
          <button type="button" className="st-btn" onClick={onTrace} disabled={tracing}>
            {tracing ? 'Tracing — tap the first corner to close' : 'Trace the house'}
          </button>
        </div>
      ) : null}

      {house ? (
        <div className="st-facts">
          {house.addr ? <Fact label="Tagged" value={house.addr} src="USA Structures PROP_ADDR" /> : null}
          {house.sqm ? <Fact label="Footprint" value={`${Math.round(house.sqm)} m²`} src="as published" /> : null}
          {house.imageDate ? (
            <Fact label="Imagery date" value={house.imageDate} src="when the outline was extracted" />
          ) : null}
          {kind === 'point' ? (
            <Notice kind="warn">
              A pin is not an outline. Distances run from the centre of the house, and the bundle export
              will refuse it — trace the footprint before exporting.
            </Notice>
          ) : null}
          <div className="st-actions">
            {kind !== 'point' ? (
              <button type="button" className={`st-btn${editing ? ' st-btn--on' : ''}`} onClick={onEdit}>
                {editing ? 'Done with corners' : 'Move its corners'}
              </button>
            ) : null}
            <button type="button" className="st-btn st-btn--quiet" onClick={onClear}>
              Clear the house
            </button>
          </div>
        </div>
      ) : (
        <p className="st-row__hint">
          Nothing is measured from a bed until the house is marked: the fire bands are distances from a
          wall, and compose.py refuses a bed with no zone.
        </p>
      )}
    </Panel>
  );
}
