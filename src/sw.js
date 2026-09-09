/* Blendo — the service worker. SOURCE: src/sw.js; build.py writes the served copy to the
   repo root with __BUILD__ replaced by the md5 of THIS build's index.html. Do not edit the
   root sw.js by hand — it is a build artifact, like index.html.

   ⛔⛔ THE ONE RULE THAT MUST NEVER BE RELAXED: THIS WORKER DOES NOT TOUCH MEDIA.
   A `respondWith` on a request that carries a Range header answers Safari's two-byte probe
   with a 200 from the Cache API, and Safari then plays NOTHING — no film, no music. The site
   Worker slices ranges on purpose (server/video/src/index.js, batch 2026-09-08-g); a service
   worker in front of it would undo that.
   ⚠️ IT IS PROTECTED IN TWO LAYERS, AND A SABOTAGE PROVED WHICH ONE DOES THE WORK TODAY: the
   ALLOWLIST below simply does not list media, so removing the MEDIA test alone changes nothing
   observable (measured — that variant stayed green). MEDIA is the layer that saves the NEXT
   edit: add `music.mp3` to the allowlist and the worker still refuses it; remove MEDIA as well
   and the guard reddens. Keep both. The `range` test is a third layer and the only one that
   covers a Range on the DOCUMENT.

   THE STRATEGY, and why it is not the usual precache:
   - the document is 12.7 MB and is served `no-cache` + ETag, so an unchanged build costs a
     304 and a release reaches the next load. NETWORK-FIRST keeps that promise; the cache is
     the OFFLINE fallback, never the fast path.
   - a small allowlist (the manifest, the icons, the avatars, the share picture, the bridge
     pair) is cache-first: they are content-addressed by the cache NAME, which carries the
     build hash, so a new build drops the old cache wholesale.
   - everything else falls through untouched. A positive allowlist cannot surprise us; a
     "cache everything except…" list would grow a hole at the first new asset.  */

const BUILD = '__BUILD__';
const CACHE = 'blendo-' + BUILD;
const DOC   = './';                       // the document is cached under ONE key, so `?flow=0` still finds it

/* media: never intercepted. `/video/` is listed as a path as well as by extension — the
   folder is what the intro's sources point at, and a future asset there must be safe too. */
const MEDIA = /(^|\/)video\/|\.(mp3|mp4|webm|m4a|aac|ogg|wav|mov)$/i;
/* the cache-first allowlist. og.jpg is here for the offline share picture; the bridge pair
   because the SDK 404-ing offline is graceful but noisy (the game falls back to its stub). */
const ALLOW = /(^|\/)(manifest\.webmanifest|og\.jpg|playgama-bridge\.js|playgama-bridge-config\.json)$|(^|\/)(icons|avatars)\//;

self.addEventListener('install', (e) => { self.skipWaiting(); });

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE && k.indexOf('blendo-') === 0) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function fromNetworkThenCache(req) {
  try {
    const res = await fetch(req);
    if (res && res.ok && res.type !== 'opaque') {
      const c = await caches.open(CACHE);
      await c.put(DOC, res.clone());
    }
    return res;
  } catch (err) {
    const hit = await caches.match(DOC);
    if (hit) return hit;
    throw err;
  }
}

async function fromCacheThenNetwork(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok && res.status === 200 && res.type !== 'opaque') {
    const c = await caches.open(CACHE);
    await c.put(req, res.clone());
  }
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (req.headers && req.headers.has && req.headers.has('range')) return;   // ⛔ see the header
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;   // the leaderboard, video.blendo.monster, the SDK
  if (MEDIA.test(url.pathname)) return;              // ⛔ see the header
  if (req.mode === 'navigate') { e.respondWith(fromNetworkThenCache(req)); return; }
  if (ALLOW.test(url.pathname)) { e.respondWith(fromCacheThenNetwork(req)); return; }
});
