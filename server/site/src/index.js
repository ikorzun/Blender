// THE SITE WORKER — blendo.monster (2026-09-09-c). Three jobs, each one line of policy:
//   1. ONE canonical address: `www.blendo.monster` → `https://blendo.monster` and `http://blendo.monster`
//      → `https://blendo.monster`, a 301 that keeps the path and the query. A host rule cannot be an asset
//      path pattern, which is why every request runs this script (`run_worker_first = true`, the toml).
//      Any other host (wrangler dev's localhost, a preview) is served as is — the smoke needs that.
//   2. MEDIA are served by the VIDEO WORKER'S slicer, imported from server/video/src/index.js — the same
//      code that answers 206 on video.blendo.monster (measured there on 2026-09-08-g). Not a copy: the
//      project's most repeated defect is a copy that drifts. Its policy travels with it: the store is asked
//      for the whole file without the client's Range, 206/416 by the RFC, `Cache-Control: public,
//      max-age=86400`, HEAD without a body.
//   3. EVERYTHING ELSE passes through the assets store with a cache policy set here: html, the bridge
//      script and its config revalidate every time (`no-cache` — the ETag makes that a 304 when nothing
//      changed, and a release must reach a returning player on the next load); images live a day.
import film from '../../video/src/index.js';

const APEX = 'blendo.monster', WWW = 'www.' + APEX;
const MEDIA = /\.(mp3|mp4|webm|m4a|aac|ogg|wav)$/i;          // through the slicer (Range → 206)
const STATIC_DAY = /\.(png|jpe?g|webp|gif|svg|ico|woff2?)$/i;  // a day; the html and the bridge revalidate

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === WWW || (url.hostname === APEX && url.protocol === 'http:')) {
      url.hostname = APEX; url.protocol = 'https:'; url.port = '';
      return Response.redirect(url.toString(), 301);
    }
    if (MEDIA.test(url.pathname)) return film.fetch(request, env);
    const upstream = await env.ASSETS.fetch(request);
    const res = new Response(upstream.body, upstream);
    res.headers.set('Cache-Control', STATIC_DAY.test(url.pathname) ? 'public, max-age=86400' : 'no-cache');
    return res;
  }
};
