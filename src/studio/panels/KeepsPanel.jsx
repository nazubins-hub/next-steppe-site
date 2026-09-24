/**
 * Things to leave alone.
 *
 * A keep is not decoration on the map. Its NAME is what reaches an image model:
 * `render_beds.py spec --leave-from-keeps` turns these into the phrases that tell
 * the model what must survive the rendering, and the drift report then measures
 * whether it did. "the blue spruce" is the whole value of having marked it; an
 * unnamed keep is a shape nobody downstream can use.
 *
 * Same fence as a bed note, at 90 characters: no digits, because a street number
 * is exactly what must not reach a prompt.
 */

import { Notice, Panel, Text } from './Fields.jsx';

const LEAVE_MAX = 90;   // render_beds.LEAVE_MAX_CHARS
const hasDigit = (s) => /\p{Nd}/u.test(s || '');

export const keepNameError = (name) => {
  if (!name) return 'Unnamed keeps cannot be used as "leave alone" wording.';
  if ([...name].length > LEAVE_MAX) return `At most ${LEAVE_MAX} characters.`;
  if (hasDigit(name)) return 'No digits — this becomes prompt wording.';
  return null;
};

export default function KeepsPanel({ open, onToggle, keeps, onPoint, onTrace, marking, tracing, onRename, onDelete, errors }) {
  return (
    <Panel title="Keep" aside={keeps.length ? `${keeps.length} marked` : 'none'} open={open} onToggle={onToggle}>
      <div className="st-actions">
        <button type="button" className={`st-btn${marking ? ' st-btn--on' : ''}`} onClick={onPoint}>
          {marking ? 'Tap what to keep' : 'Mark a point'}
        </button>
        <button type="button" className="st-btn" onClick={onTrace} disabled={tracing}>
          {tracing ? 'Tracing — tap the first corner to close' : 'Trace an area'}
        </button>
      </div>

      {keeps.length ? (
        <Notice kind="info">Names become the phrases a rendering is told to preserve.</Notice>
      ) : null}

      {keeps.map((k) => (
        <div key={k.id} className="st-keep-row">
          <Text
            label={k.kind === 'point' ? 'Point' : 'Area'}
            value={k.name}
            onChange={(v) => onRename(k.id, v)}
            maxLength={LEAVE_MAX + 20}
            placeholder="the blue spruce"
            error={errors[k.id]}
          />
          <button type="button" className="st-btn st-btn--quiet" onClick={() => onDelete(k.id)}>
            Delete
          </button>
        </div>
      ))}
    </Panel>
  );
}
