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
  // The site panel's pin map. Both are keyless federal imagery services that
  // take a bbox and return a PNG — a static-map API, so this is one <img> per
  // view rather than a grid of tiles from a CDN, and no mapping library.
  //
  //   imagery.nationalmap.gov    USGS NAIP Plus orthoimagery: how a visitor finds
  //                              their own roof. Replaced basemap.nationalmap.gov,
  //                              which served a coarser cache level than it
  //                              accepted requests for — see MAP_LAYERS.
  //   elevation.nationalmap.gov  3DEP hillshade: how they see which way the
  //                              ground falls. Already in connect-src for the
  //                              terrain read — img-src is a SEPARATE directive
  //                              and does not inherit it.
  //
  // These see coordinates, never the address: the geocode goes through
  // /api/site-lookup on this origin. Same boundary the terrain read crosses.
  "img-src 'self' data: https://imagery.nationalmap.gov https://elevation.nationalmap.gov",
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
  //   imagery.nationalmap  in connect-src as well as img-src, and for a different
  //     .gov               reason: the map IMAGE is an <img> (img-src), but the
  //                        imagery survey year is read with fetch() against the
  //                        same ImageServer's identify endpoint, and fetch is
  //                        governed by connect-src. Dropping either one breaks a
  //                        different half of the same feature.
  "connect-src 'self' https://formspree.io https://cloudflareinsights.com https://elevation.nationalmap.gov https://imagery.nationalmap.gov",
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
`;

writeFileSync(join(DIST, '_headers'), body);

console.log(
  `  wrote dist/_headers — ${hashes.size} inline script hash(es), ${external} external script(s)`,
);
