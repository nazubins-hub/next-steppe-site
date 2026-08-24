# Security notes

Reviewed 2026-08-13, before first publication. **Re-checked 2026-08-23**, when
photographs went live and three claims in here stopped being true. A security note
whose own verification recipe no longer passes trains you to ignore the recipe, so
each correction below says what changed and what it does not change.

This file exists mainly so the next `npm audit` doesn't cause a fire drill. The
audit is loud and mostly inapplicable, and the reasons are worth writing down once.

## Why `npm audit` reports high-severity findings that don't apply

`npm audit` reports 6 vulnerable packages (4 high) via 21 underlying advisories. The
large majority require **server-side rendering**, and this site has none.

What the site actually is:

- `output` is static (Astro's default) — **no adapter**
- **no middleware** (`src/middleware.*` does not exist)
- **no server islands** (`server:defer`), **no `define:vars`**, **no
  `transition:name/animate/persist`**, **no dynamic slot names**, **no spread props**
- **reads no request input** — zero uses of `Astro.request`, `Astro.params`,
  `Astro.cookies`, or `searchParams`

  One qualification, added when canonical/`og:url` tags went in: `BaseLayout.astro`
  uses `Astro.url.pathname`. In a **static** build that is not request input — it is
  the path of the page being generated, resolved at build time and frozen into the
  output. No request reaches the server, so there is nothing to reflect. It would
  become request input the moment an adapter or SSR is introduced, which is one more
  reason the re-review trigger below matters.

Cloudflare Pages serves pre-rendered files. No request reaches Astro at runtime, so
advisories about reflected XSS, header manipulation, middleware auth bypass, and
Host-header SSRF have nothing to act on.

Verify the claims above still hold:

```bash
# Request-handling APIs. Astro.url is excluded deliberately — see the qualification
# above; it is a build-time page path in a static build, and BaseLayout uses it for
# the canonical URL. Everything here genuinely implies reading a live request.
grep -rnE 'Astro\.(request|params|cookies|redirect)|searchParams' src/       # expect none
grep -rn 'Astro\.url' src/     # expect hits ONLY in BaseLayout.astro: one line of code
                               # (the canonical URL) plus its explanatory comment
grep -rnE 'server:defer|define:vars|transition:(name|animate|persist)' src/  # expect none
ls src/middleware.* 2>/dev/null                                              # expect none
grep -n 'adapter' astro.config.mjs                                           # expect none
```

### Per package

| Package | Why it doesn't reach visitors |
|---|---|
| `astro` | Advisories cover server islands, middleware, adapters, `/_image`, `define:vars`, spread props, view transitions, slot names — none used. The dev-server local-file-read is real but local. |
| `vite`, `esbuild` | **Dev-server only.** See hygiene note below. The `server.fs.deny` bypass is Windows-only. |
| `sharp` | libvips image decoding, reached only through `astro:assets` — the `<Image>` component and the `/_image` endpoint — and this site uses **neither**. The 101 photographs are plain files under `public/plants/`, emitted as `<img src>` and copied to `dist/` untouched, so nothing hands libvips a byte. *(This row read "0 images and 0 `<img>` tags" until 2026-08-23. That was true when written and is not now — 98 `<img>` tags ship today. The conclusion holds; the reason had to be replaced.)* Verify: `grep -rn 'astro:assets\|<Image' src/` and `ls dist/_image` — expect none. |
| `js-yaml` | Quadratic CPU on `!!omap` while parsing **our own** markdown frontmatter at build time. Not attacker-controlled. |
| `@astrojs/react` | Pinned deliberately — see below. |

**Do not run `npm audit fix --force`.** It installs `astro@7`, a major upgrade from
4.16, and would undo the version pinning below. If Astro is upgraded, do it
deliberately and **re-do this review** — an adapter or middleware would change the
analysis completely.

## Version pinning

The Astro integrations are pinned to **exact versions, no caret**, because this site
is on Astro 4 and newer releases target Astro 5 — including releases within the *same
major version*, which a caret range would happily install.

| package | pinned | why |
|---|---|---|
| `@astrojs/react` | `3.6.3` | `astro add react` installs v6 + React 19. It builds, but **breaks `astro dev`**: the integration shadows the `/plants` route and serves its own config module instead of the page. |
| `@astrojs/sitemap` | `3.2.1` | `3.7.3` (latest) crashes the build — `Cannot read properties of undefined (reading 'reduce')`. It reads a `routes` payload from the `astro:build:done` hook that Astro 5 provides and Astro 4 does not. **3.2.1 (Oct 2024) is the last release before Astro 5.** |
| React | `^18` | Astro 4 + `@astrojs/react` v3 pair with React 18, not 19. |

The sitemap case is the instructive one: "latest v3" looked safe and was not. Version
numbers are not the constraint — the Astro major the release was built against is.
**Check publish dates against Astro 5's release (2024-12-03) before bumping any of
these**, and if you upgrade Astro, re-do this whole review.

## Dev-server hygiene — the one live risk

The `esbuild` and `vite` advisories let **any website you visit** send requests to
your local dev server and read the responses, while `npm run dev` is running.

- Don't leave the dev server running while browsing.
- Don't use `--host` on untrusted networks; the default binds localhost only.

## Headers and CSP

`dist/_headers` is **generated** by `scripts/build-headers.mjs` on every build
(`postbuild`). Don't hand-edit it.

The CSP's `script-src` carries a SHA-256 hash for each inline script. The build
currently has **two** inline scripts — Astro's island bootstrap on `/plants`, and a
second the contact page's module loader emits — and **zero** external `src` scripts.
The hashes change whenever either changes, which is why they are computed rather than
hardcoded: a stale hash breaks hydration silently.

The zero is now **asserted**, not counted. `build-headers.mjs` exits non-zero if the
build contains any external `<script src>`, because the whole per-package analysis
above rests on there being none — and a dependency that started emitting one would
have moved the site outside its own security review without anyone noticing.

Two deliberate compromises:

- **`style-src` requires `'unsafe-inline'` and this is not removable.** The plant
  browser is a React component built from inline style objects (~2,600 `style="…"`
  attributes) and Astro emits scoped `<style>` blocks per component. It is acceptable
  *here* only because the site renders no user input: every value comes from a
  build-time data file, and the single `dangerouslySetInnerHTML` is a static literal
  with no interpolation. Do not read this as "inline styles are fine".
- **No HSTS yet.** `Strict-Transport-Security` is a promise that the domain is always
  reachable over HTTPS, cached by browsers for its `max-age` regardless of whether
  that stays true. Add it once the real domain is wired up and confirmed.

To verify the CSP doesn't break anything after a change, serve `dist/` with the
headers applied (`astro preview` ignores `_headers`) and confirm the `/plants` island
hydrates with a clean console.

## Third-party scripts: one, and it is Cloudflare's

`static.cloudflareinsights.com` is allowed in `script-src`, and
`cloudflareinsights.com` in `connect-src`. This is **Cloudflare Web Analytics,
injected at the edge** — there is no `<script>` tag for it anywhere in `src/`, so do
not go looking. It is cookieless and does not track across sites.

Turning Web Analytics off in the Cloudflare dashboard makes both allowances
unnecessary; remove them together if you do. The CSP found this on the first live
deploy by refusing it, which is the policy working as intended.

## Transport security

`Strict-Transport-Security: max-age=31536000` — **one year, reached by ramp.**

`max-age` is cached by the browser: for its duration the browser refuses HTTP for this
domain and refuses to let a visitor click through a certificate error, and it cannot
be shortened server-side for anyone who already holds it. So it started at `86400`,
one day, on 2026-08-13 — deliberately small, so a mistake would expire overnight. It
ran clean for ten days and went to the full year on 2026-08-23, which is the value
that actually protects a first visit on a hostile network.

**Do not add `preload`** — that compiles the domain into browser binaries and takes
months to undo.

## Other third-party requests: one, on one page, only when asked

Fonts are self-hosted in `public/fonts` (see the README there for attribution and
licensing). Previously Fraunces/IBM Plex loaded from `fonts.googleapis.com` in
`global.css`, and the plant browser loaded Fraunces/Jost from there again — every
visitor's IP went to Google twice per page. Both are gone.

The component's own `@import` still exists upstream in the database repo's
`ui/template.jsx`, because its standalone view needs it. `scripts/build-island.mjs`
strips it while generating the island and **fails the build if it can't find it**, so
an upstream template change cannot silently reintroduce the request.

Check after any dependency or template change:

```bash
grep -rhao 'https\?://[a-zA-Z0-9.-]*' dist/ | sort -u
```

Expect only these, and nothing else:

| host | why it is there |
|---|---|
| `www.w3.org` | SVG namespace |
| `nextsteppe.garden` | canonical / `og:url` / sitemap — this site |
| `formspree.io` | the contact form's action |
| `reactjs.org` | a comment inside React's bundle |
| `github.com`, `scripts.sil.org` | text inside the font licence files |
| `www.sitemaps.org`, `www.google.com` | XML namespaces in the sitemap (`google.com/schemas/sitemap-image`) |
| `www.inaturalist.org` | each borrowed photograph's `sourceUrl` — a CC-BY obligation, on `/credits` and the species pages |
| `creativecommons.org` | the licence deeds those credits link to |
| `cloudflareinsights.com`, `static.cloudflareinsights.com` | named in the CSP, not fetched by any markup here |
| `elevation.nationalmap.gov` | USGS 3DEP, fetched by the plant browser's address lookup — **the one third-party request this site makes**, and only after a visitor types an address and presses Measure |

**No `fonts.googleapis.com`.** Most of these are link *targets* in the markup, not
requests the page makes. Cloudflare's beacon is injected at the edge and so never
appears in `dist/`.

## The plant browser's address lookup

`/plants/` offers to tune its list to a visitor's site. They type a street address;
the browser returns elevation, slope and aspect and filters on them. Two upstreams
are involved and **they are deliberately reached by different routes**.

| what | where it goes | who sees the address |
|---|---|---|
| geocode | `functions/api/site-lookup.js` → `geocoding.geo.census.gov` | this origin, and the Census Bureau |
| hardiness zone | the same function → `phzmapi.org`, by **ZIP only** | neither sees the street address |
| elevation / slope / aspect | the browser → `elevation.nationalmap.gov` | nobody — USGS is given coordinates |

The split is the point. The Census geocoder sends no `Access-Control-Allow-Origin`,
so it *had* to be proxied — but having a proxy also means the typed address never
reaches a third party from the visitor's own browser, where it would arrive with
their IP and a `Referer`. USGS gets coordinates rounded to six decimal places and
nothing else, and `phzmapi.org` gets a five-digit ZIP.

**The function stores and logs nothing.** It holds no state, writes no header
containing the address, and answers `Cache-Control: no-store` so neither
Cloudflare's cache nor the browser keeps a copy. An address in a shared cache key
is an address in a shared cache. Do not add logging there "temporarily".

**This is the first server-side code in this repo.** Everything else is static.
`functions/` is picked up by Cloudflare Pages automatically at build time; there is
no Astro adapter and the site is still `output: 'static'`. It also means
`astro dev` cannot exercise it — use the Pages runtime:

```bash
cd site && npx wrangler pages dev dist --compatibility-date 2024-11-01 --port 8788
```

**Why the CSP gained a host and not two.** `connect-src` allows
`elevation.nationalmap.gov` because the browser genuinely fetches it. It does *not*
allow a geocoding host, and adding one would silently undo the routing above — the
comment in `scripts/build-headers.mjs` says so at the point of change.

**Input handling.** The function accepts one query parameter, rejects anything over
200 characters, and forwards it URL-encoded to a fixed endpoint. It never
interpolates the address into HTML, and the browser renders `matchedAddress` — the
Census Bureau's normalised echo — as a React text child, not as markup.

## Contact form

Live, posting to `https://formspree.io/f/mlgqrnzy`. Submissions carry a name, email,
location and free-text project details; Formspree processes them and forwards by
email. Nothing is stored on this site. A notice under the submit button says so.

**No Formspree SDK is used.** Their Vanilla-JS guide loads
`https://unpkg.com/@formspree/ajax`, which would reintroduce a third-party request and
require `script-src https://unpkg.com` — undoing the font self-hosting. Their React
guide would put a framework runtime on a page that otherwise ships ~1 KB of script.
The handler in `contact.astro` is a plain `fetch` with `Accept: application/json`,
about 25 lines and no dependency.

**Two CSP directives serve this one form and both are required:**

| directive | path |
|---|---|
| `connect-src … https://formspree.io` | the `fetch` (normal path) |
| `form-action https://formspree.io` | native form POST when JavaScript is unavailable |

Removing either half-breaks the form in a way that is easy to miss, because whichever
path you happen to test still works.

**The error path renders as text, not markup.** Formspree returns validation messages
in its JSON and the page shows them. That is third-party data, so it goes in through
`textContent`; only the static literals use `innerHTML`. Until 2026-08-23 the error
branch interpolated the response into `innerHTML`, which quietly falsified the "renders
no user input" claim at the top of this file. The CSP would have stopped an injected
script — `script-src` carries no `'unsafe-inline'` — but a CSP is the second line, not
a reason to hand markup to a parser you did not write.

**Spam protection is a `_gotcha` honeypot** — a hidden field bots fill and Formspree
discards. Deliberately not reCAPTCHA, which would load Google's script and require
`script-src`/`frame-src` exceptions.

**Operational risk:** Formspree's free tier caps monthly submissions. Over the cap it
*rejects* rather than queues, so the enquiry path fails silently. Check the cap on
their pricing page and watch the volume.

**First submission:** Formspree emails the form owner a confirmation on the very first
submission and holds delivery until it is clicked. Until then a working form looks
broken — check spam before debugging.

## Data published here

`data/plants.public.json` is a **gated projection** of the plant database, not a copy.
It deliberately omits unpublished (estimated) fire ratings and unverified cultural
notes, keeping only `ignWithheld` / `cultureWithheld` flags to record that something
was withheld. See `src/lib/publish-gate.js` and the README. The raw export is
gitignored so it cannot be committed by accident.

`data/images.public.json` is the same arrangement for photographs, gated twice: by an
allowlist in the database (`PUBLIC_IMAGE_FIELDS` in its `scripts/build.py`) and again
here by `src/lib/image-gate.js`. `lat`, `lon`, `notes`, `file`, `determinations` and
`sourceTaxon` never cross; only the stripped `thumb` and `card` derivatives do, and
`sync-plant-db.mjs` walks each one's RIFF chunk list and refuses any carrying EXIF or
XMP. A photograph's capture location is, on a job, a client's address.

No secrets, `.env` files, or API keys are present or expected — the site is fully
static and calls no APIs.

## Accepted, not fixed

The initial commit carries the author email `nick@Nicholass-MacBook-Air.local`
(name plus machine hostname). Rewriting an already-pushed commit costs more than the
disclosure is worth. Consider setting a per-repo `user.email` for future commits.
