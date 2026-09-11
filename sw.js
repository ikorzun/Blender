/* Blendo — the service worker. SOURCE: src/sw.js; build.py writes the served copy to the
   repo root with the build placeholder replaced by the md5 of THIS build's index.html. Do not
   edit the root sw.js by hand — it is a build artifact, like index.html.
   ⚠️ THE PLACEHOLDER IS SPELLED OUT NOWHERE IN THIS PROSE ON PURPOSE: build.py replaces EVERY
   occurrence, so a comment that named it would ship carrying the stamp — the served file's first
   sentence then read «with 96d252b3198d replaced by the md5», which is nonsense, and it also gave
   a naive «replace the stamp» edit a first target that is not the constant (measured 2026-09-10-i,
   in this batch's own rig).

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
   - ⚡ THE DOCUMENT IS CACHE-FIRST (2026-09-10-i, his word «делаем 1 пункт» — the first of the three
     levers he was offered against «долго все грузится»). An installed launch answers from the
     player's own copy and touches the network for the document NOT AT ALL. ⛔⛔ THE PRICE WAS NAMED
     TO HIM IN THOSE WORDS AND HE TOOK IT: «после выпуска новой версии вы один раз увидите старую» —
     a release reaches him on the NEXT launch, not this one. Whoever wants that back changes one
     line (`docFromCache` → `docFromNetwork` in the navigate branch) and gives up the instant start.
   - THE UPDATE RIDES sw.js, NOT THE DOCUMENT. `BUILD` carries the md5 of this build's index.html,
     so a release changes THIS FILE — and the game calls `navigator.serviceWorker.register('sw.js')`
     at EVERY boot (99-main), which byte-checks the script, installs the new one, and lets the
     install PREFETCH the document into the NEW cache while the player is still playing the old
     one — ⚠️ ON A RELEASE ONLY; a first-ever install prefetches nothing, and the measurement that
     decided that is at the `install` handler below.
     ⚠️⚠️ AND THE CHECK IS AN EXPLICIT `registration.update()` IN 99-main, WHICH IS THE OPPOSITE OF
     WHAT I WAS ADVISED AND IS A MEASUREMENT RATHER THAN AN OPINION: `register()` on an existing
     registration with the same script url short-circuits by spec and byte-checks NOTHING. Measured in
     a real browser against the real site worker — four launches after a release asked the server for
     `sw.js` exactly ONCE (the first registration), the old build kept answering and the new cache was
     never built; one `update()` and the release arrived on the spot. Take that line out and a release
     sits on an installed device until the browser's own soft-update throttle expires.
   - a small allowlist (the manifest, the icons, the avatars, the share picture, the bridge
     pair) is cache-first: they are content-addressed by the cache NAME, which carries the
     build hash, so a new build drops the old cache wholesale.
   - everything else falls through untouched. A positive allowlist cannot surprise us; a
     "cache everything except…" list would grow a hole at the first new asset.

   ⛔⛔ AND THE ONE RULE THE CACHE-FIRST DOCUMENT BOUGHT ITS OWN WAY OUT OF: THE OLD CACHES ARE
   DROPPED ONLY ONCE THE NEW ONE HOLDS THE DOCUMENT. The install prefetch can fail — offline, an
   interrupted release, a store that refuses the quota — and a `activate` that deletes the previous
   cache unconditionally would turn the next OFFLINE launch from «yesterday's game» into a blank
   page. Both halves are guarded, and the fetch handler's own catch searches EVERY `blendo-` cache
   for a document rather than only this build's.  */

const BUILD = '33c0cc3d2d9e';
const CACHE = 'blendo-' + BUILD;
const DOC   = './';                       // the document is cached under ONE key, so `?flow=0` still finds it

/* media: never intercepted. `/video/` is listed as a path as well as by extension — the
   folder is what the intro's sources point at, and a future asset there must be safe too. */
const MEDIA = /(^|\/)video\/|\.(mp3|mp4|webm|m4a|aac|ogg|wav|mov)$/i;
/* the cache-first allowlist. og.jpg is here for the offline share picture; the bridge pair
   because the SDK 404-ing offline is graceful but noisy (the game falls back to its stub). */
const ALLOW = /(^|\/)(manifest\.webmanifest|og\.jpg|playgama-bridge\.js|playgama-bridge-config\.json)$|(^|\/)(icons|avatars)\//;

/* ⚡ THE RELEASE DOWNLOADS ITSELF WHILE THE PLAYER PLAYS. `install` fires for a NEW sw.js, i.e. for a new
   build, and the client is at that moment looking at the OLD document served from the OLD cache.
   ⚠️ A PLAIN `fetch(DOC)`, NEVER `{cache:'reload'}`: the document was just served over the wire seconds
   ago and is sitting in the browser's own HTTP cache under `no-cache` + validators, so this request is a
   conditional one and answers 304 with no body. MEASURED against the real site worker in a real browser —
   see the batch entry; `reload` would deliberately bypass exactly the cache that makes it free.
   ⚠️ `skipWaiting` AFTER the prefetch, not before: the new worker takes over only once its cache can
   answer, which is also what makes the prune below safe. A slow prefetch merely keeps the old worker
   serving for a few seconds longer. A failed one is swallowed — the document then arrives on the first
   navigation that misses, exactly as it did before this batch. */
self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    try {
      // ⛔⛔ ONLY ON A RELEASE, NEVER ON A FIRST-EVER INSTALL — AND THAT LINE IS A MEASUREMENT, NOT A
      // PRECAUTION. Measured in a real browser against the real site worker (2026-09-10-i): the prefetch
      // came back `GET / 200`, i.e. a FULL second download, not the 304 the browser's own HTTP cache was
      // expected to give — the document is 12.7 MB and does not survive in it reliably. On a release those
      // bytes are not extra (the next launch would have spent them anyway, blocking); on a FIRST visit they
      // are pure waste — the document had just arrived as the navigation. The presence of a previous
      // `blendo-` cache is exactly the difference between the two, and a player who cleared his site data
      // reads as a newcomer, which is what he is.
      const old = (await caches.keys()).some(k => k.indexOf('blendo-') === 0 && k !== CACHE);
      if (old) {
        const res = await fetch(DOC);
        if (res && res.ok && res.type !== 'opaque') await (await caches.open(CACHE)).put(DOC, res.clone());
      }
    } catch (_) {}
    await self.skipWaiting();
  })());
});

/* ⛔ THE GATE IS THE WHOLE POINT OF THIS FUNCTION — see the header. An empty new cache keeps the old one. */
async function pruneOldCaches(){
  const c = await caches.open(CACHE);
  if (!(await c.match(DOC))) return;
  for (const k of await caches.keys()) if (k !== CACHE && k.indexOf('blendo-') === 0) await caches.delete(k);
}

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    await pruneOldCaches();
    await self.clients.claim();
  })());
});

/* THE FAST PATH: this build's own copy, and not one byte of network. A miss means either a first-ever
   visit or a release whose prefetch did not complete — both go to the network below. */
async function docFromCache(req) {
  const c = await caches.open(CACHE);
  const hit = await c.match(DOC);
  if (hit) return hit;
  return docFromNetwork(req);
}

async function docFromNetwork(req) {
  try {
    const res = await fetch(req);
    // ⚡ WRITE THE DOCUMENT ONCE PER BUILD, NOT ONCE PER NAVIGATION (2026-09-09-k, his «the game loads longer
    // at the address»): the document is 12.7 MB, and cloning it into the Cache API on every single load is
    // real disk work on a phone for nothing. The cache NAME carries the build's hash, so an entry that is
    // already there is by construction THIS build's — there is nothing to refresh.
    if (res && res.ok && res.type !== 'opaque') {
      const c = await caches.open(CACHE);
      if (!(await c.match(DOC))) { await c.put(DOC, res.clone()); await pruneOldCaches(); }
    }
    return res;
  } catch (err) {
    // ⚠ EVERY `blendo-` CACHE, NOT ONLY THIS BUILD'S: `caches.match` searches them all, and after a release
    // whose prefetch failed the only document on the device is the PREVIOUS build's. Yesterday's game beats a
    // blank page — that is the pair of this file's gated prune.
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
  if (req.mode === 'navigate') { e.respondWith(docFromCache(req)); return; }
  if (ALLOW.test(url.pathname)) { e.respondWith(fromCacheThenNetwork(req)); return; }
});
