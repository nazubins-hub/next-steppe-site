/**
 * The small shared parts of every panel.
 *
 * Deliberately plain: a label, an input, a hint, an error. The studio is one
 * person's instrument, so it wants density and honesty about units rather than
 * the reassurance a visitor's page is designed to give.
 *
 * Every <form> here calls preventDefault. The site's CSP allows form-action to
 * Formspree and nothing else, so a native submit to this origin is refused by the
 * browser — which looks like a dead button. SECURITY.md says so; this is where it
 * bites.
 */

export const Row = ({ label, hint, children, error }) => (
  <label className="st-row">
    <span className="st-row__label">{label}</span>
    {children}
    {hint ? <span className="st-row__hint">{hint}</span> : null}
    {error ? <span className="st-row__error">{error}</span> : null}
  </label>
);

export const Text = ({ label, value, onChange, hint, error, placeholder, maxLength, mono = false }) => (
  <Row label={label} hint={hint} error={error}>
    <input
      className={`st-input${mono ? ' st-input--mono' : ''}`}
      type="text"
      value={value ?? ''}
      placeholder={placeholder}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
    />
  </Row>
);

export const Area = ({ label, value, onChange, hint, error, placeholder, maxLength, rows = 2 }) => (
  <Row label={label} hint={hint} error={error}>
    <textarea
      className="st-input st-input--area"
      rows={rows}
      value={value ?? ''}
      placeholder={placeholder}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
    />
  </Row>
);

export const Choice = ({ label, options, value, onChange, hint }) => (
  <div className="st-row">
    {label ? <span className="st-row__label">{label}</span> : null}
    <div className="st-choice">
      {options.map((o) => {
        const key = typeof o === 'string' ? o : o.key;
        const text = typeof o === 'string' ? o : o.label;
        return (
          <button
            type="button"
            key={key}
            className={`st-btn${value === key ? ' st-btn--on' : ''}`}
            title={typeof o === 'string' ? undefined : o.hint}
            onClick={() => onChange(key)}
          >
            {text}
          </button>
        );
      })}
    </div>
    {hint ? <span className="st-row__hint">{hint}</span> : null}
  </div>
);

/* A measured value. `src` says where it came from, because a number with no
   provenance is the thing this whole system is built to avoid. */
export const Fact = ({ label, value, src }) => (
  <div className="st-fact">
    <span className="st-fact__label">{label}</span>
    <span className="st-fact__value">{value ?? '—'}</span>
    {src ? <span className="st-fact__src">{src}</span> : null}
  </div>
);

export const Notice = ({ kind = 'info', children, onDismiss }) =>
  children ? (
    <p className={`st-notice st-notice--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
      {onDismiss ? (
        <button type="button" className="st-notice__x" onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      ) : null}
    </p>
  ) : null;

export const Panel = ({ title, aside, children, open = true, onToggle }) => (
  <section className={`st-panel${open ? '' : ' st-panel--shut'}`}>
    <h2 className="st-panel__head">
      <button type="button" className="st-panel__title" onClick={onToggle} aria-expanded={open}>
        {title}
      </button>
      {aside ? <span className="st-panel__aside">{aside}</span> : null}
    </h2>
    {open ? <div className="st-panel__body">{children}</div> : null}
  </section>
);
