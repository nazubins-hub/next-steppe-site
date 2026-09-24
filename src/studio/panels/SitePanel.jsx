/**
 * Where the site is, and what the ground there is doing.
 *
 * TWO WAYS IN, because they answer different situations. An address goes through
 * /api/site-lookup (the Census geocoder, proxied so the address never reaches a
 * third party from the browser, and never logged — see SECURITY.md). A pasted
 * `lat, lon` skips the geocode entirely, which is what you want standing in
 * someone's driveway reading a phone's GPS: brief.json's `location` is a DECLARED
 * value that outranks any geocode, and site.py reads it first for exactly this
 * reason.
 *
 * THE READING IS TIED TO WHAT IT DESCRIBES. A terrain read belongs to the bed or
 * pin it was taken over, and 695 ft of effective elevation rides on 300 m of pin
 * movement at the test address. So a reading that no longer describes the shape
 * being planted is shown as stale rather than shown as a fact.
 */

import { SITE_RULES, compassName, effectiveElevation } from '../engine/rules.js';
import { Fact, Notice, Panel, Text } from './Fields.jsx';

const SLUG_RULE = /^[a-z0-9][a-z0-9-]*$/;

export const slugError = (slug) => {
  if (!slug) return null;
  if (!SLUG_RULE.test(slug)) return 'Lowercase letters, digits and hyphens only — it becomes a folder name.';
  if (slug.length > 64) return 'At most 64 characters.';
  return null;
};

export default function SitePanel({
  open,
  onToggle,
  slug,
  onSlug,
  address,
  onAddress,
  onLookup,
  site,
  reading,
  stale,
  busy,
  onRead,
  canRead,
  readLabel,
}) {
  const eff = reading ? effectiveElevation(reading.elevFt, reading.aspectApplied, reading.slopePct) : null;
  const coherent =
    reading && reading.aspectCoherence != null
      ? reading.aspectCoherence >= SITE_RULES.aspectCoherence.incoherent
      : null;

  return (
    <Panel
      title="Site"
      aside={site ? site.matchedAddress || `${site.lat.toFixed(5)}, ${site.lon.toFixed(5)}` : 'not located'}
      open={open}
      onToggle={onToggle}
    >
      <Text
        label="Slug"
        value={slug}
        onChange={onSlug}
        placeholder="example-site"
        hint="The folder this becomes in plant-system: sites/<slug>/"
        error={slugError(slug)}
        mono
      />

      <form
        className="st-find"
        onSubmit={(e) => {
          e.preventDefault();
          onLookup();
        }}
      >
        <Text
          label="Address, or lat, lon"
          value={address}
          onChange={onAddress}
          placeholder="123 Example Rd, Vail CO — or 39.6400, -106.3700"
          hint="Coordinates skip the geocoder: paste them from a phone on site."
        />
        <button type="submit" className="st-btn st-btn--go" disabled={busy === 'lookup'}>
          {busy === 'lookup' ? 'Looking…' : 'Find it'}
        </button>
      </form>

      {site ? (
        <div className="st-facts">
          <Fact label="Matched" value={site.matchedAddress || 'coordinates, as given'} src={site.source} />
          {site.precision === 'approximate' ? (
            <Notice kind="warn">
              The geocoder placed this by street range, not by parcel. Check the pin against the roof
              before measuring anything from it.
            </Notice>
          ) : null}
          {site.ambiguous > 1 ? (
            <Notice kind="warn">{site.ambiguous} addresses matched — this is the first.</Notice>
          ) : null}
          {site.hardiness ? (
            <Fact label="Hardiness" value={site.hardiness.zone} src={`phzmapi.org, ZIP ${site.hardiness.zip}`} />
          ) : null}
        </div>
      ) : null}

      <div className="st-read">
        <button type="button" className="st-btn" onClick={onRead} disabled={!canRead || busy === 'terrain'}>
          {busy === 'terrain' ? 'Reading USGS…' : readLabel}
        </button>
        {busy === 'terrain' ? (
          <span className="st-row__hint">
            3DEP renders on demand and is intermittently slow — up to {Math.round(75)} s.
          </span>
        ) : null}
      </div>

      {stale ? (
        <Notice kind="warn">
          {stale === 'redrawn'
            ? 'That bed was redrawn after this reading. Read the ground again.'
            : stale === 'other'
              ? 'This reading was taken over something else. Read the ground for the selection.'
              : 'The pin has moved more than 30 ft from where this was read.'}
        </Notice>
      ) : null}

      {reading ? (
        <div className="st-facts">
          <Fact label="Elevation" value={reading.elevFt ? `${reading.elevFt.toLocaleString()} ft` : '—'} src="USGS 3DEP" />
          <Fact
            label="Slope"
            value={reading.slopePct != null ? `${reading.slopePct}% · ${reading.slopeDeg}°` : '—'}
            src={`mean over ${reading.radiusM} m`}
          />
          <Fact
            label="Aspect"
            value={
              reading.aspectDeg == null
                ? 'none — too flat to have one'
                : `${reading.aspectDeg}° ${compassName(reading.aspectDeg)}`
            }
            src={
              reading.aspectCoherence == null
                ? undefined
                : `coherence ${reading.aspectCoherence}${coherent ? '' : ' — not applied'}`
            }
          />
          <Fact
            label="Effective elevation"
            value={eff ? `${eff.ft.toLocaleString()} ft${eff.offset ? ` (${eff.offset > 0 ? '+' : ''}${eff.offset})` : ''}` : '—'}
            src={eff && eff.flat ? 'no aspect correction' : 'aspect × slope, per xeric.py'}
          />
          {coherent === false ? (
            <Notice kind="info">
              The bearing read back incoherent ({reading.aspectCoherence} against a{' '}
              {SITE_RULES.aspectCoherence.incoherent} floor), so it is reported and not applied. On this
              ground, standing outside and looking is the better instrument.
            </Notice>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}
