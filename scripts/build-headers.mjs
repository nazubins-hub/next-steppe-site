#!/usr/bin/env node
//
// Emit dist/_headers for Cloudflare Pages.
//
//   node scripts/build-headers.mjs        (runs automatically as postbuild)
//
// The Content-Security-Policy's script-src carries a hash for every inline script
// in the build. Those hashes change whenever Astro's island bootstrap changes, so
// they are computed here rather than hardcoded — a stale hardcoded hash would break
// hydration silently, which is worse than having no CSP at all.

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITE_ROOT } from './plant-db-common.mjs';

const DIST = join(SITE_ROOT, 'dist');

function htmlFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return htmlFiles(full);
    return full.endsWith('.html') ? [full] : [];
  });
}

// Every inline <script> needs a hash. Scripts with a src= are covered by 'self'.
const hashes = new Set();
let external = 0;
for (const file of htmlFiles(DIST)) {
  const html = readFileSync(file, 'utf8');
  for (const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/\ssrc=/.test(m[1])) {
      external += 1;
      continue;
    }
    if (!m[2].trim()) continue;
    hashes.add(`'sha256-${createHash('sha256').update(m[2]).digest('base64')}'`);
  }
}

// SECURITY.md's analysis of the Astro advisories rests on this build shipping no
// external script, and on script-src therefore covering everything with 'self'
// plus hashes. That was written down and counted, but never enforced — so a
// dependency that started emitting a <script src> would quietly move the site
// outside its own security review. Assert it instead.
if (external > 0) {
  console.error(`  REFUSING to write dist/_headers — ${external} external <script src> in the build.`);
  console.error('  This build is documented as having none, and script-src is written on that');
  console.error('  basis. Add the host to script-src deliberately, or remove the script.');
  process.exit(1);
}

const scriptSrc = ["'self'", ...[...hashes].sort()].join(' ');

// style-src needs 'unsafe-inline' and that is NOT removable: the plant browser is a
// React component built entirely from inline style objects (~2,600 style="…"
// attributes), and Astro emits scoped <style> blocks per component. This is a real
// weakening of the policy. It is acceptable here only because the site renders no
// user input anywhere — every value comes from a build-time data file, and the one
// dangerouslySetInnerHTML is a static literal. It should not be read as a general
// statement that inline styles are safe.
const csp = [
  "default-src 'self'",
  // static.cloudflareinsights.com is Cloudflare Web Analytics. It is injected by
  // Cloudflare at the edge, NOT by anything in this repo — do not go looking for a
  // <script> tag in src/. Disabling Web Analytics in the dashboard makes this
  // allowance unnecessary; see the connect-src note below, which is its other half.
  `script-src ${scriptSrc} https://static.cloudflareinsights.com`,
  "style-src 'self' 'unsafe-inline'",
  // NO IMAGERY HOSTS HERE ANY MORE, and that is a narrowing, not an oversight.
  // The pin map used to load one <img> per view straight from USGS. It now loads
  // tiles from /api/map-tile on this origin — which is 'self' — because a bbox
  // built from wherever a drag stopped could never hit USGS's CDN, and quantised
  // tiles behind our own Worker cache can. See worker/map-tile.js.
  //
  // Esri World Imagery, the map's default layer, comes the same way: the Worker
  // holds the ArcGIS key and fetches each tile itself, so no Esri imagery host
  // belongs in img-src or connect-src — adding one would be the first step
  // toward putting the key in the page.
  //
  // Both USGS hosts remain in connect-src below, for fetch() calls that survive:
  // the terrain read, and the imagery survey year. An <img> and a fetch() are
  // governed by SEPARATE directives, so removing a host from one says nothing
  // about the other — that split is the whole reason this comment exists.
  "img-src 'self' data:",
  "font-src 'self'",
  // Two separate consumers here, each needing a different host:
  //
  //   formspree.io           the fetch() in contact.astro. The form ALSO needs
  //                          form-action below, for the native POST when JavaScript
  //                          is unavailable. Removing either half-breaks the form in
  //                          a way that is easy to miss, because whichever path you
  //                          happen to test still works.
  //
  //   cloudflareinsights.com where the analytics beacon POSTs its payload. Note the
  //                          bare host, not the static. subdomain that serves the
  //                          script — allowing only script-src would load the beacon
  //                          and then silently fail to report anything.
  //
  //   elevation.nationalmap  USGS 3DEP, read directly by the plant browser's address
  //     .gov                 lookup for elevation, slope and aspect. It is the only
  //                          third-party host the browser talks to during a lookup,
  //                          and it is given COORDINATES, never the address: the
  //                          geocode goes through /api/site-lookup on this origin,
  //                          which is 'self' and needs no entry here. That split is
  //                          deliberate and this comment is where it is recorded —
  //                          adding a geocoding host to this line would undo it.
  //
  //   imagery.nationalmap  the imagery survey year, read with fetch() against the
  //     .gov               NAIP ImageServer's identify endpoint. The map PICTURE
  //                        no longer comes from here — it comes from
  //                        /api/map-tile — but this fetch does, and fetch is
  //                        governed by connect-src. It was previously in img-src
  //                        too; that half is gone and this half must not follow.
  //
  //   services2.arcgis.com FEMA/ORNL USA Structures: the building footprints the
  //                        visitor taps to mark their house. It answers in about
  //                        0.2 s with `access-control-allow-origin: *`, so the
  //                        browser reads it directly and no proxy is involved.
  //                        CC BY 4.0 — attribution is rendered under the map, and
  //                        the licence is BY without NC, which is why it may be
  //                        used here at all when ingest.py refuses CC-BY-NC.
  //                        It is given a BBOX, never the address.
  "connect-src 'self' https://formspree.io https://cloudflareinsights.com https://elevation.nationalmap.gov https://imagery.nationalmap.gov https://services2.arcgis.com",
  'form-action https://formspree.io',
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  'upgrade-insecure-requests',
].join('; ');

// HSTS: one year, reached by ramp.
//
// max-age is a promise cached by the browser: for that long it will refuse to reach
// this domain over HTTP and refuse to let a visitor click through a certificate
// error — and you cannot shorten it from the server for anyone who already has it.
// So it started at 86400, one day, on 2026-08-13, deliberately small so a mistake
// would expire overnight. It ran clean, and on 2026-08-23 it was raised to the full
// year, which is the value that actually protects a first visit on a hostile network.
//
// No `preload`. That submits the domain to a list compiled into browser binaries;
// removal takes months and is not worth it for a site this size.
const HSTS = 'max-age=31536000';

const body = `# GENERATED by scripts/build-headers.mjs — do not edit by hand.
# Regenerated on every build; the script-src hashes track the current output.

/*
  Content-Security-Policy: ${csp}
  Strict-Transport-Security: ${HSTS}
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Cross-Origin-Opener-Policy: same-origin

# Fingerprinted assets are immutable; everything else revalidates.
/_astro/*
  Cache-Control: public, max-age=31536000, immutable

/fonts/*
  Cache-Control: public, max-age=31536000, immutable

# The private tool. Cloudflare Access is what keeps strangers out of these paths;
# these headers are about what happens after a page is legitimately served.
#
#   noindex, nofollow  belt and braces. A crawler cannot reach a page behind
#                      Access — it gets the login redirect — but the site has no
#                      robots.txt of its own (Cloudflare serves a managed one),
#                      so the page says it for itself rather than relying on that.
#
#   no-store           a studio page holds a client's address and outlines. It
#                      should not sit in a browser cache, or on a disk, after the
#                      tab closes.
#
#   no-transform       ALSO load-bearing, and not obvious: it is what stops
#                      Cloudflare's Web Analytics beacon being injected into these
#                      pages. The beacon is third-party script running on the same
#                      origin as the studio's saved drafts, and there is nothing
#                      to learn from measuring one person's visits to their own
#                      tool.
#
# Two rules because a wildcard does not cover its own parent: /studio is the page
# itself (Cloudflare redirects it to /studio/), /studio/* is everything under it.
/studio
  X-Robots-Tag: noindex, nofollow
  Cache-Control: no-store, no-transform

/studio/*
  X-Robots-Tag: noindex, nofollow
  Cache-Control: no-store, no-transform
`;

writeFileSync(join(DIST, '_headers'), body);

console.log(
  `  wrote dist/_headers — ${hashes.size} inline script hash(es), ${external} external script(s)`,
);
