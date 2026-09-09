# blendo.monster — the game on the owner's domain (2026-09-09-c)

The zone `blendo.monster` is on Cloudflare (the leaderboard at `lb.` and the film at `video.` are Workers
with Custom Domains on the same account). Until this batch the apex and `www` pointed, through proxied
A records, at Namecheap's URL forwarder: `http://` answered 302 to `www` with `X-Served-By: Namecheap
URL Forward`, `https://` answered 522 (the apex) and 525 (`www`). The game needs no edit to live on its
own host: off a local or github host it already takes the production leaderboard and the film from
`video.blendo.monster`.

## What ships

- `server/site/` — a Worker (`blendo-site`) with the repo's `site/` folder as its static assets, both
  `blendo.monster` and `www.blendo.monster` bound as Custom Domains, `workers_dev = false`.
  `src/index.js`: `www` → `https://blendo.monster` and `http` → `https` (301, the path and the query
  kept); media (`.mp3 .mp4 .webm .m4a .aac .ogg .wav`) go through the VIDEO worker's Range slicer,
  imported from `server/video/src/index.js` (Safari plays nothing from a server that answers 200 to a
  two-byte Range — the 2026-09-08-g measurement); everything else passes through the store with the
  cache policy: html, the bridge script and its config `no-cache` (revalidated by ETag on every load, so
  a release reaches a returning player at once), images a day.
- `tools/site-pack.py` — assembles `site/` from the build: `index.html`, `playgama-bridge.js`,
  `playgama-bridge-config.json`, `music.mp3`, `avatars/` (`--with-video` adds `video/`; off by default,
  because on this host the gate asks `video.blendo.monster` first and github.io second and never the
  relative folder). `build.py` runs it at the end of every build; `site/` is gitignored.
- `npm run site:deploy` = pack + `wrangler deploy`; `npm run test:site` / `test:site:break` — 13 guards
  and five sabotages (each on its own arms, a comment edit on none).

## The owner's steps

1. **Cloudflare dashboard → blendo.monster → DNS → Records** (done on 2026-09-09 before the first
   deploy): delete the apex `A`/`AAAA` records (the ones pointing at Namecheap's forwarder) and the
   `www` record. Do NOT touch `lb`, `video` (type Worker — wrangler made them) or any MX/TXT.
   Why delete rather than override: a Custom Domain cannot be created over an existing CNAME
   (the docs), the docs are silent on A/AAAA, and wrangler creates its own record — an empty name is
   the one case with no override to get wrong. Nothing to do at Namecheap: its forwarder was reached
   only through those records.
2. **Deploy, one command** (the site is not updated from GitHub — repeat after every release, after
   the push to `main`):
   ```
   npm run site:deploy
   ```
   The first upload is ~15 MB (54 files), later deploys upload only what changed. wrangler creates the
   two DNS records of type Worker and requests the certificates; for a few minutes `https://` may show
   525/526 or «not secure» — wait, do not redeploy. If wrangler asks to override existing DNS
   records, step 1 is not finished: answer no.
3. **Check** — three lines, in this order:
   ```
   curl -sI https://blendo.monster/ | head -3
   ```
   → `HTTP/2 200`, `content-type: text/html`.
   ```
   curl -sI https://www.blendo.monster/ | grep -i "^HTTP\|^location"
   ```
   → `301`, `location: https://blendo.monster/`.
   ```
   curl -sI -H 'Range: bytes=0-99' https://blendo.monster/music.mp3 | grep -i "^HTTP\|content-range"
   ```
   → `206`, `content-range: bytes 0-99/1575693`.
   Then the phone: `https://blendo.monster` — the poster, the game, the music after the intro (Safari:
   after the first tap), the leaderboard in the menu from `lb.blendo.monster`. The iPad's portrait film
   comes from `video.blendo.monster` only after the video Worker's redeploy (STATUS, item 6); until then
   two 404s and the github copy.

## What stays as it is

GitHub Pages (`ikorzun.github.io/Blender/`) — the testers' link and the film's second source. The
portal package (four files) is unchanged in shape. The Playgama bridge on this host initialises in its
mock mode (no ads, no payments), exactly as on github.io.

## The measured facts behind the design

- `wrangler dev` over plain http rewrites every request to the route's host (`http://blendo.monster/…`)
  and rewrites a Location back to localhost, so the script's http→https rule answers 301 to everything;
  the local smoke runs with `--local-protocol https` and `curl -k`. Measured 2026-09-09: `/` 200
  text/html, 12 762 024 B byte-identical to the build, `no-cache` + ETag; `/music.mp3` with
  `Range: bytes=0-99` → 206, `bytes 0-99/1575693`, the 100 bytes right, the tail (`bytes=1500000-`)
  byte-identical to the file; without a Range → 200 with `Accept-Ranges: bytes`; an avatar `image/png`
  with a day of cache; the bridge script `no-cache`; `/nope.txt` 404; `/index.html` → 307 to `/` (the
  store's own html handling — link the root).
- `run_worker_first = true` (every request runs the script) is deliberate: a host rule cannot be an
  asset path pattern. The price is the Free plan's daily Worker requests (100 000/day; a visit is ~8
  requests). If that ever binds: `run_worker_first = ["/music.mp3", "/video/*"]` and a Redirect Rule
  for `www` in the dashboard.
- Static-asset limits (the platform): 20 000 files per version, 25 MiB per file; the packer refuses a
  file over the limit. `index.html` is 12.7 MB.
