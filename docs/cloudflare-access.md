# Putting the studio behind Cloudflare Access

A click-by-click setup for the one part of the private studio that cannot live in
this repository: the sign-in itself. Everything here is done once, in a browser,
in your own Cloudflare account. Allow about fifteen minutes.

Checked against Cloudflare's documentation on **2026-10-04**. Dashboard labels do
move; where they have, the headings below name what the step is *for*, so you can
find its new name. The source pages are linked at the end.

**What you are setting up:** `nextsteppe.garden/studio` asks for your email, mails
you a six-digit code, and lets nobody else in. The rest of the site is untouched.

**Why it has to be Cloudflare and not code in this repo:** the studio page is a
static file, and on a Worker with static assets those are served *before* the
Worker runs — so no check written in `worker/` could ever defend the page itself.
Cloudflare's own words: "every request is checked before your Worker runs", and
with static assets "Access still protects the application and its assets". The
Worker's own token check (`worker/access.js`) is a second line for the `/studio/api/*`
routes, and it is what keeps the Esri key safe on any hostname Access does not cover.

---

## Before you start

- You already own `nextsteppe.garden` in this Cloudflare account, and the
  `dry-gulch-site` Worker is deployed. Nothing else is needed.
- **The free plan asks for a payment method.** Cloudflare's docs say it plainly:
  "If you chose the Zero Trust Free plan, this step is still needed but you will
  not be charged." The free plan covers 50 users; you need one.
- Have a terminal open at `~/Documents/NextSteppe/site` for the last step.

---

## Step 1 — Turn on Zero Trust, and pick a team name

1. Go to **[one.dash.cloudflare.com](https://one.dash.cloudflare.com)** and sign in.
   (This is the Cloudflare One / Zero Trust dashboard — a different front door from
   the main `dash.cloudflare.com` you use for DNS and Workers. Both are the same
   account.)
2. If this is the first time, it asks you to **choose a team name**. Pick something
   short and permanent, like `nextsteppe`. Lowercase, no spaces.
3. Choose the **Free** plan and enter payment details when asked. You will not be
   charged.

**Write down what it gives you.** Your team name becomes a domain:

```
nextsteppe.cloudflareaccess.com        ← yours will differ
```

That is the **team domain**. You need it twice: it is where your login page lives,
and it is one of the two secrets in Step 4. If you lose it, it is shown in the
Zero Trust dashboard under **Settings → Custom pages**, and it is in the URL
whenever you sign in.

---

## Step 2 — Add One-time PIN as a login method

This used to be automatic and **is not any more** — Cloudflare's docs: "OTP is no
longer added automatically, but you can set it up at any time." If you skip this
step, the application you make in Step 3 will have no way for anyone to sign in.

1. In the Zero Trust dashboard, go to **Integrations → Identity providers**.
2. Under *Your identity providers*, select **Add new identity provider**.
3. Choose **One-time PIN**. Save.

That is the whole thing. There is nothing to configure: when you visit the studio,
you type your email, Cloudflare mails you a PIN, and you paste it back. The PIN
expires after 10 minutes and works once.

*(If you would rather sign in with Google, add Google as an identity provider here
instead, or as well. One-time PIN needs no third party and no password, which is
why it is the recommendation for a tool only you use.)*

---

## Step 3 — Create the application

This is the step that actually protects the path.

1. Go to **Access controls → Applications**.
2. Select **Create new application**.
3. Select **Self-hosted and private**.
4. Select **Add public hostname**.
5. Fill in the destination:
   - **Domain:** `nextsteppe.garden` (from the dropdown — it must be an active zone
     in this account)
   - **Subdomain:** leave empty
   - **Path:** `studio`
6. **Now add a second destination to the same application.** Select **Add public
   hostname** again and enter the same domain with the path `studio/*`.

   Both are needed, and this is the one thing here that is easy to get wrong.
   Cloudflare's rule: "Using a wildcard in the **Path** field does not cover the
   parent path nor the apex domain." So `studio/*` protects `/studio/api/session`
   and everything else underneath, but leaves `/studio` itself — the page — wide
   open. With both entries, the whole tool is covered.

7. Under **Access policies**, create a policy that allows you and no one else:
   - **Action:** Allow
   - **Rule type:** Include
   - **Selector:** Emails
   - **Value:** your email address

   Type it into the dashboard only. It is deliberately not written down anywhere in
   this repository, which is public. Applications are **deny by default** — anyone
   who does not match an Allow policy is refused — so this one rule is the whole
   guest list.

8. Under the authentication options, make sure **One-time PIN** is among the
   selected identity providers.
9. **Session Duration:** 24 hours is a good default. It is how long a sign-in lasts
   before you are asked for a new PIN. Longer is less typing; shorter is better if
   a laptop ever goes missing. Nothing is lost when it expires — the studio keeps
   its draft in your browser and tells you to reload.
10. Select **Create**.

You can do this before the studio is deployed. Protecting a path that does not
exist yet is harmless: it just asks you to sign in and then shows a 404.

---

## Step 4 — Give the Worker the two values it checks

The Worker verifies Cloudflare's signature on every `/studio/api/*` request. To do
that it needs to know *which* Access organisation and *which* application to trust.

**First, copy the AUD tag:**

1. **Access controls → Applications**, and select **Configure** on the application
   you just made.
2. Open the **Additional settings** tab.
3. Copy **Application Audience (AUD) Tag** — a long hexadecimal string.

**Then, in a terminal at `~/Documents/NextSteppe/site`:**

```bash
npx wrangler secret put ACCESS_AUD
```

It prompts for the value: paste the AUD tag, press Enter. Nothing is echoed back.

```bash
npx wrangler secret put ACCESS_TEAM_DOMAIN
```

Paste your team domain — `nextsteppe.cloudflareaccess.com`, with no `https://` and
no trailing slash. (The Worker tolerates both, but tidy is tidy.)

These are **Secrets**, not variables, deliberately: a secret survives a deploy,
while a dashboard variable of type Text is removed by the next `wrangler deploy`
that does not mention it. If you would rather use the dashboard: **Workers & Pages
→ dry-gulch-site → Settings → Variables and Secrets → Add**, and set the type to
**Secret**.

Neither value is especially sensitive — they identify, they do not authorise — but
this repository is public, so they stay out of it.

---

## Step 5 — Check it

From any terminal:

```bash
curl -sI https://nextsteppe.garden/studio/ | head -3
```

Expect a **302** to `<your-team>.cloudflareaccess.com/cdn-cgi/access/login/…`. That
is Access doing its job before anything of ours runs.

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://nextsteppe.garden/studio/api/session
```

Expect **302** or **403** — never 200.

Then the real test, in Chrome: open a **new incognito window** (so your normal
session is not reused) and go to `https://nextsteppe.garden/studio/`. You should
get the Cloudflare login page, enter your email, receive a PIN, and land in the
studio with the aerial imagery loading.

And confirm the public side is unchanged: `https://nextsteppe.garden/plants/`
should load with no sign-in at all.

---

## When something is wrong

| What you see | What it means | What to do |
|---|---|---|
| `/studio/` loads with no sign-in | The application is not covering that path | Check the destination is `nextsteppe.garden` + path `studio`, and that there are **two** entries (`studio` and `studio/*`) |
| The page loads after sign-in, but the map is blank and a banner says the session expired | Access let you in; the Worker is refusing the API | The two secrets are missing or wrong. Re-copy the AUD tag and re-run both `wrangler secret put` commands |
| The map is blank and there is no banner | More likely the imagery key than Access | Check `ARCGIS_API_KEY` is still set on the Worker |
| No PIN email arrives | One-time PIN is not enabled, or your email is not in the policy | Step 2, then check the Allow policy's email in Step 3 |
| "This PIN has already been used" | A security scanner in your mail opened the link first, or you asked for a second PIN | Request a new one and paste it promptly; each new PIN invalidates the last |
| Signing in loops back to the login page | Usually third-party cookies blocked for `cloudflareaccess.com` | Allow cookies for that domain in Chrome |
| You are asked to sign in far too often | Session Duration is short | Raise it on the application |

---

## Two notes worth keeping

**Why the Worker checks the token itself.** Cloudflare can now hand a Worker the
signed-in identity directly, as `ctx.access` — no JWT parsing. It does not apply
here, and the docs say why: "Workers with Static Assets execute behind an internal
router Worker. Access still protects the application and its assets. However, the
router does not pass `ctx.access` to the user Worker." This site has static assets,
so `worker/access.js` verifies the signature itself.

**About preview URLs.** A Worker can also be reached on `*.workers.dev` and on
per-version preview URLs, and an application attached to a zone hostname does not
cover those. This repo turns both off (`workers_dev: false`, `preview_urls: false`
in `wrangler.jsonc`), and the Worker's token check means that even if one came
back, `/studio/api/*` would answer 403 there and no Esri tile would be spent.

If you ever want branch previews back, do not simply re-enable them — protect the
Worker itself instead: **Workers & Pages → dry-gulch-site → Access →
Protect this Worker behind Access → Previews only**. That covers every hostname the
Worker answers on, previews included.

---

## Turning it off, or handing it over

- **Add another person:** edit the Allow policy and add their email. They get their
  own PIN; nothing is shared.
- **Lock everyone out quickly:** disable the policy on the application, or delete
  the application. The studio then returns 404-behind-login to everybody, and the
  public site is unaffected either way.
- **Rotate:** if you ever delete and recreate the application, the AUD tag changes —
  re-run `npx wrangler secret put ACCESS_AUD`.

---

## Sources

- [Cloudflare Access with Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/) — enforcement before the Worker, protection scopes, `ctx.access` limits
- [Publish a self-hosted application](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/) — the Step 3 flow
- [Application paths](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/) — why `studio/*` does not cover `studio`
- [One-time PIN](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/) — no longer added automatically
- [Validating the JWT](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/) — where the AUD tag lives, and the certificate URL
- [Zero Trust setup](https://developers.cloudflare.com/cloudflare-one/setup/) — team name, and the payment note on the free plan

`SECURITY.md` has the security reasoning behind all of this; this file is only the
clicking.
