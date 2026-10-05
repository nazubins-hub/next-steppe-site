/**
 * The Worker in front of the static site.
 *
 * WHY THIS FILE EXISTS
 * nextsteppe.garden is a Cloudflare **Worker** with static assets, not a Pages
 * project. The distinction is invisible until you need one route to run code,
 * and then it is total: `functions/api/foo.js` is a Pages Functions convention,
 * and on a Worker it does not merely fail to route — its presence pushed the
 * build off the Astro static preset it had been using, and `wrangler deploy`
 * fell over with "Missing entry-point to Worker script or to assets directory"
 * because nothing in the repo said what to deploy.
 *
 * So the repo says it now, in `wrangler.jsonc`. That is the real fix: the build
 * was configured entirely in the dashboard, where it could not be reviewed,
 * diffed, or reproduced from a clean clone.
 *
 * HOW ROUTING WORKS HERE
 * Workers static assets are served BEFORE this Worker runs. Every page, style,
 * font and photograph matches an asset and never reaches this code — which is
 * the point, because a Worker invocation per image would be absurd. Only a
 * request matching no asset arrives here. Three route groups mean something —
 * `/api/site-lookup`, `/api/map-tile` and `/studio/api/*` — and everything else
 * falls through to `env.ASSETS.fetch()` so the 404 page is still the built one
 * rather than something invented here.
 *
 * That the studio's PAGE is an asset is exactly why Cloudflare Access, and not
 * this file, is what keeps strangers out of it: a password check in a Worker
 * cannot protect a file the Worker never sees. access.js explains the division.
 *
 * `env` carries three secrets. ARCGIS_API_KEY is the map's Esri imagery key,
 * read in map-tile.js and nowhere else; ACCESS_TEAM_DOMAIN and ACCESS_AUD are
 * read in access.js. None of them reaches a response, and `wrangler.jsonc`
 * keeps request logging off so none of them reaches a log either.
 */

import { handleSiteLookup } from './site-lookup.js';
import { handleMapTile, PUBLIC_DEFAULT, PUBLIC_LAYERS } from './map-tile.js';
import { handleStudio } from './studio.js';

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);

    // `ctx` reaches the lookup so it can pre-warm map tiles with waitUntil
    // after the response has gone, and `env` so it knows whether that is worth
    // doing. See warmTiles() in map-tile.js.
    if (pathname === '/api/site-lookup') {
      return handleSiteLookup(request, env, ctx);
    }

    // Imagery for the pin map, addressed by integer z/x/y so the edge cache can
    // actually hit. map-tile.js explains why that is the whole fix, and why the
    // Esri layer is the one exception to it.
    if (pathname === '/api/map-tile') {
      // `ctx` so a render that outruns the visitor's patience is still finished
      // and cached in the background rather than thrown away. See map-tile.js.
      // The layer set is passed in rather than assumed, because the private
      // route passes a different one — see PUBLIC_LAYERS in map-tile.js.
      return handleMapTile(request, env, ctx, {
        allowed: PUBLIC_LAYERS,
        fallback: PUBLIC_DEFAULT,
      });
    }

    // The private tool's routes. Cloudflare Access stops a stranger at the edge
    // before any of this runs — including for the studio PAGE, which is a static
    // asset this Worker never sees. studio.js verifies Access's signed token
    // anyway, because `*.workers.dev` and preview URLs are not covered by an
    // Access application on the zone. Nothing under here matches an asset (there
    // is no `src/pages/studio/api`, and the build asserts it), so these requests
    // always arrive.
    if (pathname === '/studio/api' || pathname.startsWith('/studio/api/')) {
      return handleStudio(request, env, ctx);
    }

    // Not an asset and not a route: hand it back to the asset server, which
    // answers with the built 404 page per `not_found_handling`.
    return env.ASSETS.fetch(request);
  },
};
