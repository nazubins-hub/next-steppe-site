#!/usr/bin/env node
//
// Two facts about the built output that the studio's privacy rests on.
//
//   node scripts/check-studio-build.mjs        (runs automatically as postbuild)
//
// Both are the kind of thing that is true when written and quietly stops being
// true later — a new page under the wrong folder, an import that drags a module
// into the wrong bundle. Neither shows up as a broken page, which is why they are
// asserted rather than remembered.
//
// 1. NOTHING MAY BE BUILT UNDER /studio/api/
//    Static assets are served BEFORE the Worker runs. `/studio/api/*` is a Worker
//    route — the session probe and the Esri tiles — so a file at that path would
//    shadow it, and the studio would quietly lose its imagery while the page
//    itself still loaded. wrangler 3.114 has no per-path `run_worker_first` to
//    force the other precedence, so the guarantee we can actually keep is that
//    the build emits nothing there.
//
// 2. THE PUBLIC ISLAND MAY NOT CARRY STUDIO CODE
//    The studio and the plant browser share an origin and a stylesheet, and the
//    studio's engine modules began as copies of the browser's. It would be easy
//    for an import to pull studio code into the island every visitor downloads —
//    which is slower for them and is the opposite of the point of the split.
//    Checked by sentinel: the studio's localStorage prefix appears in its own
//    bundle and must appear nowhere reachable from /plants/.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import { SITE_ROOT } from './plant-db-common.mjs';

const DIST = join(SITE_ROOT, 'dist');

/* The studio's draft key prefix, from src/studio/persist.js. Any bundle holding
   studio code holds this string. */
const SENTINEL = 'nextsteppe-studio/v1';

const fail = (lines) => {
  console.error('  REFUSING the build:');
  for (const line of lines) console.error(`  ${line}`);
  process.exit(1);
};

if (!existsSync(DIST)) fail(['dist/ does not exist — run `npm run build` first.']);

// ── 1. no assets under the Worker's private route ────────────────────────────
const apiDir = join(DIST, 'studio', 'api');
if (existsSync(apiDir)) {
  const found = [];
  const walk = (dir, rel) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, posix.join(rel, entry));
      else found.push(posix.join(rel, entry));
    }
  };
  walk(apiDir, 'studio/api');
  fail([
    `${found.length} file(s) built under dist/studio/api — this path belongs to the Worker.`,
    ...found.slice(0, 5).map((f) => `  ${f}`),
    'Static assets are served before the Worker, so these would shadow',
    '/studio/api/session and /studio/api/map-tile. Move the page elsewhere.',
  ]);
}

// ── 2. the public island carries no studio code ──────────────────────────────
//
// FOLLOWED TRANSITIVELY, which is the only way this means anything. Astro's
// `client:only` hydration script does not reference its component chunk with a
// <script src>: it dynamic-imports it, and that chunk imports others. A check that
// looked only at the page's own tags would have reported a clean bill for a page
// whose second-level chunk was the entire studio — and it did, once, before this
// walk replaced it.
const assetRefs = (text) => [
  ...[...text.matchAll(/<(?:script[^>]*\ssrc|link[^>]*\shref)=["']([^"']+)["']/g)].map((m) => m[1]),
  ...[...text.matchAll(/["'`](\/_astro\/[A-Za-z0-9._-]+\.(?:js|mjs|css))["'`]/g)].map((m) => m[1]),
];

const readAsset = (url) => {
  const path = join(DIST, url.replace(/^\//, '').split('?')[0]);
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
};

/* Everything a page can pull in, at any depth. Bounded by `seen`, so a cycle in
   the chunk graph cannot spin here. */
function reachableFrom(html) {
  const seen = new Set();
  const queue = assetRefs(html).filter((u) => u.startsWith('/'));
  const out = [];
  while (queue.length) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    const body = readAsset(url);
    if (!body) continue;
    out.push({ url, body });
    for (const next of assetRefs(body)) if (next.startsWith('/') && !seen.has(next)) queue.push(next);
  }
  return out;
}

const publicPage = join(DIST, 'plants', 'index.html');
if (!existsSync(publicPage)) fail(['dist/plants/index.html is missing — the plant browser page did not build.']);

const publicHtml = readFileSync(publicPage, 'utf8');
const leaked = [];
if (publicHtml.includes(SENTINEL)) leaked.push('plants/index.html');
for (const asset of reachableFrom(publicHtml)) {
  if (asset.body.includes(SENTINEL)) leaked.push(asset.url);
}
if (leaked.length) {
  fail([
    'studio code is reachable from the public /plants/ page:',
    ...leaked.map((f) => `  ${f}`),
    `It carries the sentinel "${SENTINEL}", which only src/studio/ defines.`,
    'The public island must not import from src/studio — that bundle is',
    'downloaded by every visitor, and the studio is for one signed-in person.',
  ]);
}

/* The studio's own page must still carry it, or the sentinel has moved and this
   check has quietly stopped checking anything. */
const studioPage = join(DIST, 'studio', 'index.html');
if (existsSync(studioPage)) {
  const html = readFileSync(studioPage, 'utf8');
  const carries = html.includes(SENTINEL) || reachableFrom(html).some((a) => a.body.includes(SENTINEL));
  if (!carries) {
    fail([
      `the studio page does not contain "${SENTINEL}" anywhere.`,
      'Either the draft-key prefix in src/studio/persist.js changed, in which case',
      'update SENTINEL here, or the studio did not bundle — the leak check above',
      'would then be passing by accident.',
    ]);
  }
  if (!/<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(html)) {
    fail(['the studio page has no `noindex` robots meta tag — see src/layouts/StudioLayout.astro.']);
  }
}

console.log('  studio build checks passed — nothing under /studio/api, no studio code in the public island');
