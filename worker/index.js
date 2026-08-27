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
 * request matching no asset arrives here. `/api/site-lookup` is the one route
 * that means, and everything else falls through to `env.ASSETS.fetch()` so the
 * 404 page is still the built one rather than something invented here.
 */

import { handleSiteLookup } from './site-lookup.js';
import { handleMapTile } from './map-tile.js';

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);

    // `ctx` reaches the lookup so it can pre-warm map tiles with waitUntil
    // after the response has gone. See warmTiles() in map-tile.js.
    if (pathname === '/api/site-lookup') {
      return handleSiteLookup(request, ctx);
    }

    // Imagery for the pin map, addressed by integer z/x/y so the edge cache can
    // actually hit. map-tile.js explains why that is the whole fix.
    if (pathname === '/api/map-tile') {
      return handleMapTile(request);
    }

    // Not an asset and not a route: hand it back to the asset server, which
    // answers with the built 404 page per `not_found_handling`.
    return env.ASSETS.fetch(request);
  },
};
