# Next Steppe — site

Xeriscape plant reference and practice site for the Vail Valley, built with
[Astro](https://astro.build), static output, deployed as a **Cloudflare Worker
with static assets** — not a Pages project. See *Deploying* for why that
distinction matters.

## Local dev

Two servers, and they are not interchangeable.

```bash
npm install
npm run dev          # http://localhost:4321 — fast, HMR
```

That is Astro's dev server and it does **not** run `worker/`, so
`/api/site-lookup` 404s: the plant browser's Measure button fails and the pin map
never appears. Fine for styling, copy and everything that is not the site lookup.

```bash
npm run dev:worker   # http://localhost:8788 — the real runtime
```

That builds `dist/` and serves it through `wrangler dev`, the same workerd
runtime production uses — so the address lookup, the pin map and the `_headers`
CSP all behave as they will live. It rebuilds on every start, so it is slower;
reach for it when you touch the lookup, the map, the Worker or the CSP.

The map's Esri layer needs the ArcGIS key locally too: put it in `.dev.vars`,
beside `wrangler.jsonc`, as `ARCGIS_API_KEY=…`. That file is git-ignored.
Without it the Worker answers the Esri layer with 503 and the map opens on the
2019 aerial — which is also how to check that fallback.

### Running the studio locally

`/studio/` is the private in-house tool (see **The studio** below). Cloudflare
Access protects it in production, and `wrangler dev` cannot put Access in front of
anything — so locally it is opened by a bypass that cannot fire anywhere else. Add
to `.dev.vars`:

```
STUDIO_DEV_BYPASS=1
```

and use `npm run dev:worker`. On :4321 the page loads but every `/studio/api/*`
call 404s, and the studio says so rather than looking broken.

**Never run `wrangler secret bulk .dev.vars`.** It would upload that flag as a
Worker secret. It would still not open the studio — `worker/access.js` also
requires the request to have arrived on localhost — but a bypass flag in production
config is not a thing to keep.

Tests cover the parts a page cannot exercise: the Access token check, and the
engine the studio measures with.

```bash
npm test             # node --test; also runs as part of `npm run build`
```

## The plant database

The 100-species database is **not authored here**. It lives in its own repo
(`xeric-plant-system`), wherever you keep it locally. Point `PLANT_DB_PATH` at that
checkout before syncing:

```bash
export PLANT_DB_PATH=/path/to/xeric-plant-system
```

That repo's governing rule is that every fact has exactly one home — `plants.json`.
Cloudflare builds this repo from GitHub and cannot reach that checkout, so this repo has to carry
what the site needs. What it carries is **not a copy of the database**: it is
`data/plants.public.json`, the *gated projection* of it.

The raw export is never written to disk here. `sync:plants` reads the database's
`plants.json`, passes it through `src/lib/publish-gate.js` in memory, and writes only
the result. **This repo is public**, and a verbatim copy would put all 41 estimated
fire ratings on GitHub as structured data — where `ign: 8` survives scraping and
reshaping considerably better than the `ignSrc: "est"` qualifier in the field beside
it. `data/plants.json` is gitignored so it cannot reappear by accident.

Withheld records keep `ignWithheld: true` / `cultureWithheld: true`. The public data
still says *something was deliberately withheld here* — it just never says what the
value was.

```bash
npm run sync:plants     # re-derive data/plants.public.json + the UI template
npm run check:plants    # fail if the data no longer matches source × gate
npm run audit:plants    # review what the database's rules flag before publishing
```

`check:plants` runs before every build and catches three kinds of drift:

| drift | detected | works on CI |
|---|---|---|
| the gated data was hand-edited here | `outputSha` mismatch | yes |
| the gate rule changed without a re-sync | `gateSha` mismatch | yes |
| the database moved on | re-derives and compares byte-for-byte | no — needs the source |

When the database repo is absent the third check is skipped and the build proceeds;
the first two still run. Point `PLANT_DB_PATH` at another checkout to sync elsewhere.

**Never edit `data/plants.public.json` or `src/components/XericPlantDB.template.jsx`
directly** — both are derived. Change the database, or the gate, then re-sync.

`audit:plants` reads the **database**, not the site data, and refuses to run without
it. It reports on exactly the fields the gate removes, so auditing the shipped file
would always return zero findings — a clean bill of health that means nothing.

## What is published, and what is withheld

`src/lib/publish-gate.js` is the single place that decides. Two rules, both keyed
on provenance fields rather than species names, so corrections in the database
publish automatically on the next sync:

- **Ignitability** renders only where `ignSrc` is `CSU` or `IDFW` — a published
  source. Estimated ratings (`ignSrc: "est"`) show *not established*. Of the twelve
  estimates since checked against a published source, all twelve were revised
  downward and all twelve lost their clearance to sit within 30 ft of a structure;
  the remaining estimates are not stated as safety facts.
- **Cultural notes** flagged `cultureSrc: "V"` are withheld pending a check against
  the Native American Ethnobotany Database (naeb.brit.org), per the database's own
  rule. The species still publishes; only the unverified note is held back.

Both the species pages and the interactive browser honor both rules.

The browser is built by `scripts/build-island.mjs`, which injects gated data into
the `/* __PLANTS__ */` placeholder in the synced UI template. That is why the
template is synced rather than the database's generated `out/xeric-plant-db.jsx` —
the generated file has the full dataset baked in, with no way to feed it gated
data. `build-island.mjs` refuses to emit if a withheld rating still carries a
value.

## Tuning the browser to a visitor's site

The browser's site panel takes a street address and measures the ground: elevation,
slope and aspect from USGS 3DEP over the same 120 m radius the plant system's own
site pipeline uses, folded into the same effective elevation and the same home
ignition zone bands. Checked against three built site profiles it returns the same
numbers `sitecore` does, which is the requirement — a visitor who runs this and then
commissions an analysis must not be shown two accounts of their own hillside.

It is a first pass and stays one. There is no soil, no snowpack, no skyline and
therefore no sun hours; 3DEP is bare earth, so the house and the trees are in none
of it. The panel says all of that on screen rather than in this file.

**The measurement does not always win.** Aspect is reported with a coherence number,
and below the threshold the plant system uses, the bearing is shown and deliberately
*not* applied — on dissected mountain ground a single mean bearing frequently
describes no part of the property, and a confident wrong aspect moves effective
elevation by up to 3,000 ft. Every value stays editable underneath for the same
reason: a geocode is a point on a road, not the house.

**The pin is what makes the geocode usable.** A Census match is interpolated
along a street centreline, so it lands on the road; measured there, the Vail test
address reads aspect coherence 0.38 and the correction is refused outright.
Dragging the pin onto real ground reached 0.51, and the correction applied. The
panel reports how far the pin has moved from the last reading, because 300 m of
pin movement swings effective elevation by ~695 ft at that address — this is a
high-leverage control and it says so rather than hiding it.

The house is optional: mark it — tap its USA Structures outline, trace it, or
drop a pin — and the defensible-space distance is measured instead of asked,
and the distance buttons stand down. Beds can be traced too, as many as the
property has. The selected bed tunes the list from its nearest edge to the
house, its terrain is read over the bed itself, and each carries a note and the
light as the visitor sees it. The outlines export as GeoJSON (what the plant
system's `geometry.py read` takes) or KML (for Google Earth), built in the
browser and sent nowhere. One pin is still the common case and works alone.

Imagery is **Esri World Imagery** by default — Vantor, 31–34 cm over the valley,
captured 2023–2025 — with USGS **NAIP Plus** as the "2019 aerial" and the 3DEP
hillshade beside it (see which way the ground falls). Every tile comes through
`/api/map-tile` on this origin as an integer z/x/y, so there is no mapping
library and `img-src` names no imagery host. The USGS layers are cached at our
edge for a week; the Esri layer is fetched with the Worker's ArcGIS key and
cached only in the visitor's browser — `worker/map-tile.js` says why. Without
the key the map opens on the 2019 aerial instead.

NAIP replaced `basemap.nationalmap.gov`, which accepted any request size while
serving a coarser cache level behind it — its 512 px output was a 256 px image
upscaled, and asking for 2048 changed nothing. NAIP is 60 cm native and carries
roughly twice the real detail. Requests are 1024 px JPEG: JPEG because the
content is photographic and it is 4.7× smaller than PNG for a difference nobody
can see, 1024 because the stage is ~1046 device pixels on a 2× display. The
caption names the survey year, read per-location from the raster catalogue —
NAIP is a multi-year cycle, not a live feed, and anything planted since will not
appear. Note that **shrinking the analysis radius is not
a substitute**: at the road point that made coherence worse, not better. Moving
the centre is the lever, which is why there is a pin and not a radius slider.

**Hardiness zone is shown, not filtered on.** It comes from the USDA 2023 map by ZIP,
and in Eagle County one ZIP spans thousands of feet. It also would not do anything:
`zoneMin` is 4 or lower for 97 of the 104 species, so at any zone this valley reaches
the filter removes nothing. Elevation is what actually selects.

**This adds `worker/`, the first server-side code here — and it changes how you
preview.** There are now two local servers and they are not interchangeable:

| | serves | address lookup | speed |
|---|---|---|---|
| `npm run dev` → :4321 | Astro dev, HMR | **no** — `/api/site-lookup` 404s | instant reload |
| `npm run dev:worker` → :8788 | built `dist/` + the Worker | **yes** | full rebuild each time |

`astro dev` knows nothing about `worker/`, so on :4321 the Measure button fails
and the pin map never appears — the panel falls back to its manual controls,
which is the fallback it needs anyway. Use it for styling and copy. Use
`dev:worker` for anything touching the lookup, the map or the CSP.

See SECURITY.md § *The plant browser's address lookup* for where the address goes and
why the geocode is proxied rather than called from the browser.

## Content

- Blog posts: `src/content/blog/*.md`
- Portfolio: **no routes, by design.** `src/pages/portfolio/` was removed because an
  empty "Built Work" page that told visitors to add files to `src/content/portfolio/`
  was publishing publicly. The collection schema is still defined in
  `src/content/config.ts`; to bring the section back, add entries under
  `src/content/portfolio/`, restore an index and `[...slug]` route, and re-add the
  nav link in `src/layouts/BaseLayout.astro`. Old note, kept for context: the three
  entries that shipped with the template were fabricated case studies and were
  removed. The collection and routes are intact so real projects can drop in.

Set `draft: true` on any entry not ready to publish.

## Contact form

`src/pages/contact.astro` posts to Formspree (form `mlgqrnzy`) via a hand-written
`fetch` — no SDK, no third-party script. It shows an inline thank-you without leaving
the page, and falls back to a native form POST if JavaScript is unavailable.

Both `connect-src` and `form-action` in the CSP must keep allowing `formspree.io` —
one covers each path. See SECURITY.md.

Formspree's free tier caps monthly submissions and **rejects** rather than queues over
the cap, so keep an eye on volume.

## robots.txt — deliberately not in this repo

Cloudflare serves an auto-generated `robots.txt` carrying AI-crawler content-signal
declarations. Adding `public/robots.txt` would **silently replace that policy**, so
we don't. The sitemap is discoverable anyway: `<link rel="sitemap">` in the page head,
plus `/sitemap-index.xml` by convention. Submit it in Google Search Console rather
than reaching for a robots.txt.

## Version pinning

`@astrojs/react` is pinned to **v3** with **React 18**, because this site is on
Astro 4. `astro add react` installs v6 + React 19, which builds but breaks
`astro dev`: the integration shadows the `/plants` route and serves its own config
module instead of the page. Do not upgrade the integration without upgrading Astro.

## Known gaps

- No plant images. The database's `manifest.json` is empty (0 of 100 species). Its
  rule against AI-generated plant imagery is absolute.
- 12 records mention a numeric rating in their `notes` prose, but all 12 are
  retraction notes on species *corrected* to a published value ("was ign 8
  (estimated)", now 6). None sit on a species whose rating is currently withheld, so
  they disclose a correction rather than an estimate. Left in deliberately.
- `astro.config.mjs` still has `site: 'https://example.com'` — set it to the real
  domain when DNS is wired up.

## The studio

`/studio/` is an in-house tool, not part of the public site: trace a client's beds
on Esri aerial imagery, measure them against the house, read the ground from USGS
3DEP, and export a GeoJSON that plant-system's `geometry.py read` takes unchanged.

- **Signed in with Cloudflare Access.** The page is a static asset, so Access — not
  this repo's code — is what keeps it private; `worker/access.js` verifies the same
  token again on `/studio/api/*`, which is what protects the Esri key on hosts
  Access does not cover. SECURITY.md has the full account, and
  [docs/cloudflare-access.md](docs/cloudflare-access.md) is the click-by-click
  dashboard setup.
- **Nothing is stored on the server.** Work in progress is a draft in your own
  browser; the artefact is the file you download. The rule that client geometry
  stays off every server did not change when the tool moved behind a sign-in.
- **Esri is the studio's.** The public map keeps the keyless USGS layers; only
  `/studio/api/map-tile` may serve `imagery`.
- **The engine is a copy, on purpose.** `src/studio/engine/` mirrors blocks of
  `plant-system/ui/template.jsx` — the same measurement code the public browser and
  `geometry.py` use, so one site cannot be measured two ways. The mirrored blocks
  are fenced with `@mirror` markers; `npm test` exercises them.

## Deploying (GitHub → Cloudflare Workers)

The service is **`dry-gulch-site`**, already connected to this repo. Pushing to
`main` builds and deploys it; pushing any other branch builds without touching
production. Build command is `npm run build`; everything else is `wrangler.jsonc`.

The synced database files are committed, so the Cloudflare build needs nothing from
the local machine.

Setting one up from scratch is **Workers & Pages → Create → Workers**, not Pages —
the two are different products and a Pages project will not read `wrangler.jsonc`
or `worker/`.

**This is a Worker with static assets, not a Pages project.** The distinction is
invisible until one route has to run code, and then it is total. `wrangler.jsonc`
is the whole deploy configuration:

- `name: "dry-gulch-site"` is the identity of the existing service. Changing it
  does not rename anything — it creates a second Worker and leaves the live one
  serving the old build.
- `main: "worker/index.js"` runs only for requests matching no static asset.
  Every page, font and photograph is served by the asset server without invoking
  it; `/api/site-lookup` and `/api/map-tile` are the two paths that reach code.
- **One secret, `ARCGIS_API_KEY`** — the map's Esri imagery key, set in the
  dashboard (Workers & Pages → dry-gulch-site → Settings → Variables and
  Secrets, type Secret) and never in `wrangler.jsonc`. Secrets survive deploys.
  Set it before merging anything that needs it: without it production shows the
  2019 aerial instead of Esri.
- `assets.directory: "./dist"` — including `_headers`, so the CSP and HSTS
  survive. Verified, because it is the kind of thing that fails silently.

Astro is still `output: 'static'`; nothing here needs an adapter.

**A `functions/` directory would break the build.** That is the Pages Functions
convention, and on a Worker it is not merely ignored — it pushed the build off its
Astro static preset and `wrangler deploy` failed with *"Missing entry-point to
Worker script or to assets directory."* Server code goes in `worker/`.

Until this file existed the build was configured entirely in the dashboard, where
it could not be reviewed, diffed, or reproduced from a clean clone. It is in the
repo now; change deployment here, not there.
