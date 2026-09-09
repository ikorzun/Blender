// THE SITE WORKER — blendo.monster (2026-09-09-c, the crawler card 2026-09-09-g). Four jobs, each one
// line of policy:
//   1. ONE canonical address: `www.blendo.monster` → `https://blendo.monster` and `http://blendo.monster`
//      → `https://blendo.monster`, a 301 that keeps the path and the query. A host rule cannot be an asset
//      path pattern, which is why every request runs this script (`run_worker_first = true`, the toml).
//      Any other host (wrangler dev's localhost, a preview) is served as is — the smoke needs that.
//   2. MEDIA are served by the VIDEO WORKER'S slicer, imported from server/video/src/index.js — the same
//      code that answers 206 on video.blendo.monster (measured there on 2026-09-08-g). Not a copy: the
//      project's most repeated defect is a copy that drifts. Its policy travels with it: the store is asked
//      for the whole file without the client's Range, 206/416 by the RFC, `Cache-Control: public,
//      max-age=86400`, HEAD without a body.
//   3. A LINK-PREVIEW CRAWLER asking for the document gets `card.html` (1 KB of the same head metas, built
//      from index.html by tools/site-pack.py) instead of the build. Telegram, X and the rest give a page a
//      small budget of bytes and seconds, and index.html is 12.7 MB raw / 4.5 MB gzipped (measured
//      2026-09-09-g) — nobody's crawler is obliged to read that far to find a meta at byte 2522. Only the
//      DOCUMENT is swapped: /og.jpg, the media and everything else fall through untouched, because the
//      crawler's SECOND request is for the picture itself.
//   4. EVERYTHING ELSE passes through the assets store with a cache policy set here: html, the bridge
//      script and its config revalidate every time (`no-cache` — the ETag makes that a 304 when nothing
//      changed, and a release must reach a returning player on the next load); images live a day.
import film from '../../video/src/index.js';

const APEX = 'blendo.monster', WWW = 'www.' + APEX;
const MEDIA = /\.(mp3|mp4|webm|m4a|aac|ogg|wav)$/i;          // through the slicer (Range → 206)
const STATIC_DAY = /\.(png|jpe?g|webp|gif|svg|ico|woff2?)$/i;  // a day; the html and the bridge revalidate
// ⛔ SEARCH ENGINES ARE DELIBERATELY ABSENT from this list (no Googlebot, no Bingbot, no Applebot):
// handing a crawler that RANKS the page a different document than the player gets is cloaking, and it is
// punished. A preview bot renders a card and ranks nothing, which is why the swap is legitimate for it.
const PREVIEW_BOT = /TelegramBot|Twitterbot|facebookexternalhit|WhatsApp|Discordbot|Slackbot|Slack-ImgProxy|LinkedInBot|Pinterest|redditbot|vkShare|Iframely|SkypeUriPreview|Embedly|Mastodon|Bluesky/i;
const DOC = /^\/(index\.html)?$/;                            // the document itself, nothing else

// ⚡ THE DOCUMENT'S VALIDATOR (2026-09-09-k, his «the game loads longer at the address than on GitHub Pages»).
// MEASURED at the edge: every asset keeps the store's ETag (the icons, the manifest, the bridge, og.jpg) —
// EXCEPT the document at `/`, which arrives with no ETag and no Last-Modified. Together with our own
// `Cache-Control: no-cache` that means a returning player re-downloads the WHOLE 4.5 MB compressed document
// on EVERY load, while GitHub Pages (max-age=600 + ETag) answers him from his own browser cache for nothing.
// ⚠️ THE FIX IS A VALIDATOR, NOT A LONGER max-age: `no-cache` is the promise that a release reaches the next
// load (2026-09-09-c), and a max-age would break exactly that for the length of the window. With an ETag the
// browser asks and gets a 304 of a few bytes — faster than Pages AND still instant on a release.
// The stamp is the md5 of index.html, written into site/build.txt by tools/site-pack.py, read ONCE per
// isolate. ⚠️ A failure is memoised too, or a store without build.txt would be asked on every request.
let BUILD_TAG = null;
async function buildTag(env, url) {
  if (BUILD_TAG !== null) return BUILD_TAG;
  BUILD_TAG = '';
  try {
    const r = await env.ASSETS.fetch(new Request(new URL('/build.txt', url).toString()));
    if (r.status === 200) { const t = (await r.text()).trim(); if (/^[0-9a-f]{6,64}$/.test(t)) BUILD_TAG = '"' + t + '"'; }
  } catch (_) {}
  return BUILD_TAG;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === WWW || (url.hostname === APEX && url.protocol === 'http:')) {
      url.hostname = APEX; url.protocol = 'https:'; url.port = '';
      return Response.redirect(url.toString(), 301);
    }
    if (DOC.test(url.pathname) && PREVIEW_BOT.test(request.headers.get('user-agent') || '')) {
      // The store is asked WITHOUT the client's conditional headers: an If-None-Match carrying the INDEX's
      // ETag would earn a 304 for a different file. A missing card (an old `site/` packed before this
      // batch) falls through to the build — degraded, never broken.
      const card = await env.ASSETS.fetch(new Request(new URL('/card.html', url).toString(),
        { method: request.method === 'HEAD' ? 'HEAD' : 'GET' }));
      if (card.status === 200) {
        const r = new Response(card.body, card);
        r.headers.set('Cache-Control', 'no-cache');
        r.headers.set('Vary', 'User-Agent');   // one URL, two documents: the shared cache must not mix them
        return r;
      }
    }
    if (DOC.test(url.pathname) && (request.method === 'GET' || request.method === 'HEAD')) {
      const tag = await buildTag(env, url);
      if (tag) {
        const inm = request.headers.get('if-none-match') || '';
        // a weak comparison: the edge weakens a strong ETag when it compresses, so `W/"x"` must match `"x"`
        if (inm.split(',').some((t) => t.trim().replace(/^W\//, '') === tag)) {
          return new Response(null, { status: 304, headers: { ETag: tag, 'Cache-Control': 'no-cache' } });
        }
        // the store is asked WITHOUT the client's conditional headers, for the card's reason: an
        // If-None-Match of OURS would otherwise earn a 304 whose empty body we would pass on as the game
        const up = await env.ASSETS.fetch(new Request(url.toString(), { method: request.method }));
        const r = new Response(up.body, up);
        r.headers.set('Cache-Control', 'no-cache');
        r.headers.set('ETag', tag);
        return r;
      }
    }
    if (MEDIA.test(url.pathname)) return film.fetch(request, env);
    const upstream = await env.ASSETS.fetch(request);
    const res = new Response(upstream.body, upstream);
    res.headers.set('Cache-Control', STATIC_DAY.test(url.pathname) ? 'public, max-age=86400' : 'no-cache');
    // ⚠️ THE MANIFEST'S TYPE IS FORCED (2026-09-09-h): the assets store need not know `.webmanifest`,
    // and a manifest served as octet-stream is a warning in Chrome and a refusal in some browsers —
    // i.e. exactly «the browser does not understand that the game can be installed». `sw.js` needs no
    // such line (`.js` is a known type) but WOULD need one if it ever stopped being served as
    // JavaScript: a worker script with a wrong MIME fails registration with a SecurityError.
    if (url.pathname.endsWith('.webmanifest')) res.headers.set('Content-Type', 'application/manifest+json');
    return res;
  }
};
