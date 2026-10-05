/**
 * /studio/api/*  — the private routes, behind Cloudflare Access.
 *
 * WHAT IS PRIVATE HERE AND WHAT IS NOT
 * The studio PAGE is a static asset. Access protects it at the edge, and this
 * file never sees a request for it. What comes here is the small number of
 * things the page cannot do for itself:
 *
 *   /studio/api/session    is this sign-in still good, and until when
 *   /studio/api/map-tile   Esri World Imagery, which costs money per tile
 *
 * Everything else the studio needs is already public and stays public:
 * `/api/site-lookup` for the geocode, and `/api/map-tile` for the USGS layers,
 * which are keyless, public-domain and cached at our edge for a week. Sending
 * them through here would mean a second, private copy of that cache for one
 * user, which is slower for no gain.
 *
 * AUTHENTICATE FIRST, ROUTE SECOND
 * A 404 that only appears for a signed-in visitor is a 404 that tells a stranger
 * which paths exist. So verifyAccess() runs before the path is looked at, and an
 * unauthenticated request gets the same 403 whatever it asked for.
 *
 * SAME ORIGIN, IN DEVELOPMENT TOO
 * There is no CORS header in this file, or anywhere else in this repo. The
 * studio page and these routes are one origin in production, and one origin
 * under `npm run dev:worker` (:8788), which serves the built page through the
 * real runtime. On `npm run dev` (:4321) Astro serves the page and no Worker
 * runs, so these routes are simply absent — the page says so and asks for the
 * other server, which is cheaper than teaching this file to trust another one.
 */

import { isLocalDev, refuse, verifyAccess } from './access.js';
import { handleMapTile, STUDIO_DEFAULT, STUDIO_LAYERS } from './map-tile.js';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      /* Nothing about a private session belongs in any cache, shared or not. */
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });

export async function handleStudio(request, env, ctx) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }

  const dev = isLocalDev(request, env);
  const seen = dev ? { ok: true, exp: 0 } : await verifyAccess(request, env);
  if (!seen.ok) return refuse();

  const { pathname } = new URL(request.url);

  /* The page probes this to tell three states apart that all look like a failed
     fetch: signed in, signed out (Access answers with a redirect the page reads
     as `opaqueredirect`), and "you are on the Astro dev server" (a 404). `exp`
     lets it warn before a session lapses mid-trace rather than after. */
  if (pathname === '/studio/api/session') {
    return json({ ok: true, exp: seen.exp || 0, dev });
  }

  if (pathname === '/studio/api/map-tile') {
    return handleMapTile(request, env, ctx, {
      allowed: STUDIO_LAYERS,
      fallback: STUDIO_DEFAULT,
    });
  }

  return json({ error: 'not-found' }, 404);
}
