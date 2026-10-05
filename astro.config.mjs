import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  // Live domain, served by Cloudflare Pages. The sitemap and the canonical/og:url
  // tags in BaseLayout are both built from this, so it must stay correct.
  site: 'https://nextsteppe.garden',
  // Both integrations are pinned to the major line built for Astro 4 — see the
  // version-pinning note in SECURITY.md. `astro add` installs whatever is newest,
  // which for React meant an Astro 5 build that broke `astro dev`.
  integrations: [
    react(),
    // The studio is private and behind Cloudflare Access; a crawler asking for it
    // gets a login redirect. Listing it in the sitemap would still publish the
    // path and invite the attempt, so it is filtered out here. This repo has no
    // robots.txt of its own to say it instead — Cloudflare serves a managed one —
    // and `dist/_headers` adds `X-Robots-Tag: noindex` for the same paths.
    sitemap({ filter: (page) => !/^\/studio(\/|$)/.test(new URL(page).pathname) }),
  ],
});