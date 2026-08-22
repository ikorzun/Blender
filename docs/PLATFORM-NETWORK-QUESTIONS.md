# Can the game reach OUR domain from the platform (measurement + what to ask)

Dispatcher's question 2026-08-07: this is a blocker not only for the leaderboards, but
also for our own table, and for future content packs. Below is what could be found out
BY MEASUREMENT, and what can be learned only after the upload or from the platform.

## What has been MEASURED (2026-08-07, public server responses)

| what | value |
|---|---|
| CSP of the portal page `playgama.com` | `connect-src *`, `frame-src *`, `default-src 'self'` |
| CSP of the asset host `games.playgama.com` | **NO CSP HEADER AT ALL** |
| `x-frame-options` on the portal | not set (instead of it `frame-ancestors *`) |

**Conclusion:** NO prohibitions on outgoing requests on the platform's side are VISIBLE.
`connect-src *` on the portal means that its own code too is not restricted
to the domain; the host from which the games' static files are served has no policy at all.

⚠️⚠️ **BUT THIS IS NOT THE FINAL ANSWER, AND HERE IS WHY.** THE CSP OF THE PARENT
PAGE DOES NOT EXTEND TO A CROSS-DOMAIN IFRAME — the frame has its own
policy, from the headers of ITS response. Which means what decides is not what I measured on
`playgama.com`, but the headers with which THEY will serve OUR `index.html`
after the upload. This can be measured only on a live build.

## Three real risks (in order of probability)

1. **The iframe's `sandbox`.** If the frame is not given `allow-same-origin`, our
   origin becomes "opaque" (`Origin: null`). Then our backend
   is obliged to answer `Access-Control-Allow-Origin: *`, and requests WITH COOKIES
   (`credentials`) will not go through at all. ⚠️ Consequence for OUR OWN TABLE:
   build authorization NOT on cookies, but on a token in the body/header.
2. **CORS of our own server.** This is our side: without correct
   `Access-Control-Allow-Origin`/`-Headers` the browser will cut the request off, and it
   will look like "the platform forbade it", although it is we ourselves who forbade it.
3. **Mixed content.** Only `https://` — from an http endpoint there will be no
   response under any platform settings whatsoever.

## What to ask the platform (ready-made wordings for the owner)

1. Are there restrictions on the game's outgoing network requests — a CSP
   `connect-src` in the response that serves our `index.html`?
2. With what attributes is the game's iframe inserted (`sandbox`, `allow`)? Is
   `allow-same-origin` needed — on this depends whether we will have a working
   `localStorage` and whether `Origin` will become equal to `null`.
3. Is it allowed to call the developer's OWN backend, and does the domain need to
   be registered (whitelist)?
4. The official build size limit (our reference point is 8 MB, in the project it is NOT
   fixed by a platform document — see the canon, the decision about the hybrid).
5. Is loading additional assets from our domain after the start allowed (this is exactly
   the "hybrid" from the owner's decision 2026-08-06).

## How to answer definitively WITHOUT the platform

After the build is uploaded, open the game on the portal and perform ONE request to our
domain, looking at: (a) did it go through, (b) what `Origin` the server saw,
(c) is there a CSP error in the console. That is thirty seconds and it removes all three
risks at once. Earlier than the upload — the question fundamentally cannot be closed.
