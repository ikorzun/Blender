# BLENDO — current state

A short page to read from your phone. Updated at big milestones.
⚠️ PROJECT MEMORY (survives any chat): [CLAUDE.md](CLAUDE.md) — all
decisions, bans and traps with their reasons; [WORKSTREAMS.md](WORKSTREAMS.md) —
a log of EVERY release with your specs verbatim; docs/ — plans.
A new session is required to read the canon first — that rule is in its header.

**Build: batch 2026-09-09-a on top of 2026-09-08 a–i, v2 = main** · the suite **1105 green, 0 red, SUITE: PASS** (run 36) · the live
site verified by byte size against the build (index.html and both portrait video files) · the leaderboard worker is deployed (the rank fix and the `t` field) · the video worker answers 206 for the landscape pair; **the portrait pair reaches the domain only with your redeploy** (item 6 below) · portal package unchanged in shape

**9 SEPTEMBER, MIDDAY — THE GAME ON YOUR DOMAIN: THE SITE WORKER IS BUILT (batch 2026-09-09-c in CLAUDE.md).**
`server/site/` serves `blendo.monster` and `www.blendo.monster` (www → apex, http → https, the music sliced for
Safari's Range through the video worker's own code, html revalidated on every load); `npm run site:deploy` packs
`site/` from the build and deploys. Verified locally over `wrangler dev`: the html byte-identical to the build,
music 206, the tail byte-identical, avatars a day, 404s pass. YOUR DEPLOY LINE (item 7 below), then the three
curls. Note: `site/` is packed from the CURRENT build, which carries the phone-poster batch of the same morning
before it is pushed to GitHub. The full steps: docs/SITE-MOVE.md.

**9 SEPTEMBER — THE PORTRAIT FILM ON THE PHONE AND THE PORTRAIT TABLET, THE GAME'S MUSIC ONLY AFTER THE INTRO (batch
2026-09-09-a in CLAUDE.md).** Your 9:16 film (720×1280, 4 s, 4.4 MB) was re-encoded into two files next to the build —
WebM 675 KB and MP4 1.35 MB, mono audio (the master's «stereo» is one mono mix; nothing is lost) — and it plays where the
poster showed: on the phone and on the portrait tablet, OVER the poster, in the poster's own box (under the bottom bar
on the phone). Frame 0 of the film is the poster, so the switch is seamless; the poster stays as the load's cover and as
the fallback — a film that is not ready, refused or broken leaves the poster's 1.5 s hold as before. At the film's end
both fade together and the pour starts under the fade. **«Remove the music, leave only the sound»:** the file carries ONE
mixed track (measured: a hit at 2 s and a broadband rumble tail — no separable music bed inside it), so what shipped is
that the GAME's background music never starts under an intro (poster or film) on any device and starts when the intro
closes; the film's own track is the intro's only sound. If you meant a music bed INSIDE the clip, send an SFX-only
render — one command re-encodes it. ⚠️ Named: 720 wide is a 1.6× upscale on your phone and 2.1× on the iPad — a
1080×1920 render would be sharper at about double the bytes, your call. ⚠️ A landscape phone under 768 wide gets the
portrait film cover-cropped, as it gets the poster. ⚠️ On the desktop the music no longer starts under the loading
screen where autoplay was allowed (the wrapper, the portal) — it starts after the film, without the stutter. A bench at
your phone's geometry and at 768×1024 was sent to you first. Guarded five new ways on the phone plus the re-based film
arms; fifteen sabotage variants each reddened their own arm, a comment edit none. The suite: **1105 green, 0 red** (run 36). A read-only review (three lenses, a
skeptic per finding) confirmed four things, none refuted, all fixed before the run: a BLOCKER on the phone's own path
(a film that started late was cut by the 1.5 s grace timer — pre-existing, never reachable before the phone's film), the
deferred music ignoring the portal's sound-off, the poster's fallback hold measured from the wrong moment on a portal,
and the body colour during the joint fade.
**YOUR ONE COMMAND** — the two new files reach `video.blendo.monster` only with a redeploy of the video Worker
(the same line as before): `npx wrangler deploy --config /Users/ikorzyn/Desktop/Claude/Blender/server/video/wrangler.toml`,
then `curl -sI -H 'Range: bytes=0-99' https://video.blendo.monster/blendo-intro-portrait.webm` → `HTTP/2 206`. Until
then the phone's film comes from github.io (the direct link takes the relative address anyway).
**Your devices, when you look:** the phone — the poster, then the film starting on it, its sound on the first tap (the
second skips), the film under the address bar, the music arriving only after; the iPad in portrait the same; whether
the film starts at all on iOS Safari before the poster's hold runs out (an iOS load kick is in; unmeasurable here).

**8 SEPTEMBER, NIGHT — THE BONUS OBJECT'S SHIMMER ON A CONTOUR (batch 2026-09-08-i in CLAUDE.md).** The
electric band no longer paints the object's body: the shell is an inflated copy of the model (×1.06, the ice's
device) and its alpha is gated by the fresnel, so the band lights the OUTLINE as it sweeps — the top and the
bottom of the contour with the head across the middle, the sides at the edges — and the face keeps only a faint
tint. A before/after sheet at your phone's viewport went to you. ⚠️ Two knobs are yours: the contour's THICKNESS
(1.06 now; the ice is 1.14, but the slot's spin frame allows 1.08 — a thicker halo means widening the camera and
the object in the slot shrinks ~5 %), and the rim's weight at rest (a pale outline stays around the object between
passes; one constant). ⚠️ One property of any fresnel shell, shown to you on the banana: turned end-on by the
slot's turntable, an elongated object has its whole visible skin at a grazing angle and the band covers the face
for that part of the turn (the ice crust does the same). Guarded four ways (the old alpha, the shell at 1.0, the
shell at 1.14, a comment edit); a read-only review of the batch (three lenses, one skeptic per finding) caught
one bug in the guard and two blind spots, all fixed before the run.

**8 SEPTEMBER, YOUR FOUR ANSWERS TO THE OPEN LIST (batch 2026-09-08-h in CLAUDE.md).** The vignettes K1–K4 stay
switched off as they are (nothing changed; deleting them would have saved ~20 KB and nothing else). **The portrait
tablet shows the poster instead of the film:** the two intro gates are mirrors now — the phone width OR any wider
viewport in portrait gets your 9:16 picture (on 768×1024 it loses ~170 px of sky and ground, nothing at the sides;
the film there cut 526 px a side), a landscape tablet and the desktop get the film as before; the poster's tall box
(+80 under the bottom bar) stays the phone width's. **On a film the browser started without sound (Safari's default
on your Mac and iPad at every launch, Chrome on a first visit) the first tap or key turns the sound on and the second
skips;** a film that already sounds, or is silent by the music slider, skips on the first tap as before. The unmute
runs on the `click`/`keydown` that carries user activation in every browser (a touch `pointerdown` does not by the
spec), the background music is held while the film sounds and plays after it — measured with a mouse and with a
finger. The read-only review of the change found 11 things, none refuted; all taken (the click form, a held key
ignored, the `videoSkip` door always skips, one viewport sample for both gates, comments and arm texts). ⚠️ NAMED,
NOT FIXED: an iPad mini in portrait (744 wide) and a narrow Mac Safari window still take the tall poster box (they
did since -f) — a width term, not a device term. **Your devices, when you look:** the poster on the phone under the
address bar with no line; the poster on the iPad in portrait, the film in landscape; the first tap on the film in
Safari gives sound, the second skips; the toolbar zone over the film on the iPad in the film's sky.

**8 SEPTEMBER, THE 206 CHECK (batch 2026-09-08-g in CLAUDE.md).** You deployed the video Worker and I checked
it: **it answers `200` with the whole file to every Range request** (both files, both edge IPs) — no 206, no
`Content-Range`, no `Accept-Ranges`. Cloudflare's static-asset store ignores Range, and Safari plays nothing from a
source that answers 200 to its two-byte probe — so until the redeploy, Safari on iPad and Mac skips your domain
pair and takes the github.io copy two failed downloads later, if the 1.5 s grace has not run out. **The fix is a
small script in front of the store** (`server/video/src/index.js`, `run_worker_first` in the toml): it fetches the
file from the store and slices the requested bytes itself — 206 with `Content-Range`, `Accept-Ranges`, 416 past the
end, HEAD, a stale `If-Range` → a plain GET. Proven three ways here: a unit test with a fake store (14 green, five
sabotages each reddening its own assert), and `wrangler dev` with the real runtime and the real files (206 / 416 /
200, the slices byte-identical to `video/`). **YOUR ONE COMMAND — the same deploy line as before**:
`npx wrangler deploy --config /Users/ikorzyn/Desktop/Claude/Blender/server/video/wrangler.toml`, then
`curl -sI -H 'Range: bytes=0-99' https://video.blendo.monster/blendo-intro.webm` → `HTTP/2 206`,
`content-range: bytes 0-99/1100266`. Plan B stays R2 if the script ever does not do.
✅ **REDEPLOYED AND MEASURED, 8 SEPTEMBER:** both files, both edge IPs — `Range: bytes=0-99` → `HTTP/2 206`,
`content-range: bytes 0-99/1100266` (`/2438208`), `accept-ranges: bytes`, exactly 100 bytes; the open tail
`1000000-` → 206 and byte-identical to `video/`; the plain GET 200 byte-identical to the file with
`Accept-Ranges`; HEAD 0-99 → 206 with no body; past the end → 416 `bytes */size`; a missing file → 404. The
domain resolves on this Mac again (the stale NXDOMAIN cache expired), and a plain `curl` without `--resolve`
gives 206 too. Safari on the iPad and the Mac takes the film from your domain now — nothing page-side to do.

**8 SEPTEMBER, NIGHT — THE REVIEW'S SEVEN (batch 2026-09-08-f in CLAUDE.md).** The film's volume is the music
slider itself, not the music bus (it played 5 dB under the music that follows it; the iPad ignores element volume
and plays it at unity). The film follows the portal's audio-off and a platform mute mid-film, and a platform
un-mute no longer restarts the music over it. The poster's tall box (under the bottom bar) exists only where the
gate sees Apple WebKit with browser chrome — +80 instead of +120 (the poster's last rows are on the screen, ~35 px
a side cut instead of 45); in your wrapper's full-screen view the box is one viewport. The 206 check after the
Worker deploy is the whole check (Safari plays nothing from a 200); plan B if it answers 200 is an R2 bucket on the
same domain. ⛔ 2026-09-08-g: MEASURED — it answered 200; the script above is the cure, a redeploy is yours. ✅ Redeployed the
same evening and measured 206 (the first paragraph).

**8 SEPTEMBER, LATE — THE INTROS BY YOUR FIVE ANSWERS (batches 2026-09-08-d and -e in CLAUDE.md).** No lines
over the poster: both edge cards are gone while it shows, the splash gate is the first thing in body (no frame of a
slow load can show the game's card lines), body carries the poster's sky (the status zone above the picture stays
a flat colour by Safari's own law — the picture cannot rise above its origin). **The poster occupies the whole
screen:** the box is absolute and taller than the layout viewport, so on the phone it lies UNDER the bottom bar
through its glass (the measured route of the flow mode); cover on the taller box cuts ~45 px a side on your phone.
**There is no comic:** the prologue is deleted, the intro is the picture (phone) or the film (tablet/desktop), and
where neither applies the game starts at once. **The film sounds:** unmuted at the music slider's volume, muted
only where the browser refuses an autoplay with sound (a first visit in Chrome, Safari's default) or the music is
off; the background music is held while it sounds. **The film on your domain:** a Worker in
`server/video/` for `video.blendo.monster` — YOUR deploy (the command is in the toml); until then the game takes
the github.io copy after two failed lookups (⛔ -g: the assets-only edition answered 200; ✅ the script edition
is deployed and answers 206 — measured, the first paragraph). **On the iPad and the Mac** the toolbar zone over the film is the film's
sky while it plays (scoped to the play so a skip-tap freezes the game's colour, not the film's). What only your
devices can say: the phone's poster under the address bar with no line at the bottom and the sky to the top edge;
the iPad's toolbar over the film; the film's sound in the wrapper and on the portal.

**8 SEPTEMBER, THE INTROS (batches 2026-09-08-b and -c in CLAUDE.md).**
**On the phone the three-panel prologue is replaced by your 9:16 poster** — inlined into the build, in the very
first painted frame (it covers the load too), held at least 1.5 s from the moment it was visible (the first
paint; on the portal, the curtain's lift), then a 300 ms fade while the fall starts underneath. Dispatcher's
defaults, yours to change: it shows on EVERY launch on the phone (the comic showed once), the story bits are not
marked (a new player meets K0/K1 between levels), `?splash=0` switches it off. Price: +509 KB in `index.html`.
**On the tablet and the desktop the prologue is replaced by your video** — NOT inside the build: two web encodes
in `video/` next to it (VP9 WebM 1.10 MB, H.264 MP4 2.44 MB, from your 10.2 MB HEVC master; your 3.74 MB
optimised copy is still HEVC, which Chrome, Edge and Firefox do not decode). GitHub Pages serves them with the
game; on the portal the game fetches them from the github.io address (the portal package stays four files).
Muted (an autoplay with sound is refused without a gesture); a click, tap or key skips it; not ready in 1.5 s,
an error or a refused autoplay → the comic as before; `?video=0` switches it off, `?video=1` forces it.
Open for you: (1) sound — a click could unmute it (one line); (2) hosting — your own domain or the package
instead of the github.io files; (3) every launch or the first launch only (both intros); (4) the crop on a
portrait tablet — a 16:9 film cover-fitted keeps the centre and loses the sides.

**8 SEPTEMBER (batch 2026-09-08-a in CLAUDE.md), your four items — and the phone is the only real check.**
(2, 3) **On the phone the pause menu, the leaderboard and the ×5 screen now scroll as the PAGE**, so their
rows pass under the status bar and the address bar: nothing of ours is fixed at a screen edge while one of
them is open (the canvas, the bars, the face and the two colour cards are hidden), the open screen is the
document, and ONLY THE TOPMOST screen exists — the leaderboard and the ×5 screen hide the menu under them
(this is the rule the two 6 September attempts lacked when your phone showed both screens at once). The sky
of the menu is painted by the menu itself, sized to the viewport at load, so the frame at the top is the one
you know; the price is that the sky scrolls with the cards. The colour edition stays as the fallback (the
game's own zones, and any phone where the mode is off). ⚠️ THIS ROUTE BROKE YOUR PHONE TWICE BEFORE AND NEVER
REPRODUCED HERE: the bench renders (sent to you) show the rows under both edges, the guards prove one screen
on top by pixels, but your screenshot after the deploy is the real verdict — open the pause menu and scroll,
open the leaderboard and scroll, open ×5 from the badge. If anything is wrong, `?flow=0` on the link switches
the mode off without a deploy, and the rollback is one commit. (4) **The ×5 screen is centred in the view on the
phone**, both axes, the cross in the top-left corner. (1) **The delay**: measured on the bench, opening ×5 and
the leaderboard costs almost no JS; what is real is the network round trip of the leaderboard on a cold cache
(0.4–0.7 s from this Mac, more on a phone) and the pause menu's FIRST open of a session (~120 ms building the
collection's portraits). The leaderboard now opens on its LAST SNAPSHOT at once and refreshes underneath
(«Loading…» only the very first time). Two candidates the bench cannot see on iOS: the ×5 title's SVG filter
(a heavy CPU rasterisation in WebKit) and the zone recolour Safari does on the two tap-opened screens — if the
delay is still there after this build, a 60 fps screen recording of the two taps is what settles it (it
settled the shake judder). An adversarial review (3 lenses × skeptics) ran before the suite and caught two blockers on the bench — resume
from a scrolled menu left the floating header over the game, and the ×5 block sat at the top on desktop — plus
six smaller ones (pinch zoom re-enabled by the root's touch-action, the snapshot's own row lost on a failed
signed read, the menu thrown to the top after a dark screen closed, the sky's anchor, the zone colour at the
end of the collection, the header pill's cap on a tablet): all fixed and guarded before the run. ⚠️ THE REVIEW
DID NOT EXPLAIN THE ORIGINAL PHONE FAILURE — no finding reproduces «both screens at once»; the topmost-only
rule is the structural answer, and your screenshot is the proof. NAMED, NOT DONE: chunking the menu's
first-open portrait build; a phone loaded in landscape keeps the mode it loaded with.

**THE WORKER IS DEPLOYED** — by the owner on 2026-09-07 at 10:09 (wrangler 4.129.0 via npx, an OAuth login made on the spot; `Deployed blendo-lb`, version `7f3fa914-9ad5-404f-9f4b-00391dfa1a8f`, the custom domain and both crons). Checked right after: `/v1/top` 200, `max-age=60` (not degraded), 52 players, the snapshot of 10:00 UTC; the live smoke (`server/leaderboard/test/smoke.js`, it writes ONE row and deletes it) — **11 green**, the row gone (404 after the delete). The first hourly tick under the new build (11:00 UTC) builds `ladder2`; until then places are counted the whole way, exact. ⚠️ This Mac now HAS wrangler and a Cloudflare login — a deploy is still your call, never a batch's side effect.

**THE AFTERNOON OF 7 SEPTEMBER (batches b–i in CLAUDE.md), all on your words:** (i) the three-digit rank is guarded (a mock at place 845: every circle 37 wide, the avatars on one vertical, the number not cut). (h) the new-object screen now dims the edge cards (its opener never refreshed the state — your «strips» screenshot); every leaderboard avatar stands on one vertical (the rank circle's width is the list's, from the longest rank shown — 28 for two digits, wider for three+ — instead of your row alone growing by 10); the phone's dark screens are OPAQUE and unblurred (your «do it»): cheaper frames in Low Power Mode and every dark screen is a flat edge candidate by itself; the desktop keeps 88% + blur. (g) the charge's electric band now sweeps LEFT → RIGHT across the screen (view-space, whatever the turntable's rotation) and is stronger — a wider, brighter, faster band on the same cold palette; the five strength numbers are constants in 70-fx if you want more or less. (b) the ×5 screen's close on the phone is on the LEFT, in the flow at the wrap's 16 — and, by your evening word (f), it is the CROSS again (the arrow lived one batch; `Interface/back.svg` stays in the folder); the leaderboard's close on the phone moved LEFT to the same 16, still sticky above the heading; the desktop keeps its 24. (c) the arrow keys orbit the bowl on the desktop — ←/→ the azimuth, ↑/↓ the tilt, the drag's directions and clamps, a held key integrated on the real clock (a full turn ≈ 3.5 s); not under the menu (there the arrows still scroll the list), not in the intro, not after the level; a press aborts the hint flight. The edge cards are PHONE-ONLY from now: hidden from 768 (the HUD's own boundary). (d) the desktop menu on a short window: the eye card lost its 423 floor and shrinks (the eyes scale down to a 60 floor) so the settings stay on screen; only past that floor does the wrap scroll. (e) a desktop window under 900 of viewport height wears the phone's HUD eyes (120 / the number 53 instead of 210 / 68). Every rule has a two-sided guard (five marked sections; the dry-run tools in `tools/`). ⚠️ TWO THINGS NAMED, NOT DECIDED: a phone in LANDSCAPE (≥ 768 wide) loses the edge cards; the 900px height threshold of the HUD eyes is a dispatcher's number (your 1352×878 gives ~770 in Chrome, a 1080p monitor ~970). And one question: «the eyes from the mobile version» was read as the GAME's HUD (your screenshot) — if you also meant the pause menu's collapsed pill at that resolution, say so.

**Play from your phone:** https://ikorzun.github.io/Blender/ (debug: ?dev=1)

## To continue on another device (a new chat, a fresh clone)

1. `git clone git@github.com:ikorzun/Blender.git` → `git checkout v2` (the work branch; `main` is
   what GitHub Pages serves — the deploy is a push of `v2` onto `main`).
2. Node 22 + `npm install`, then `npx playwright install chromium` (the suite drives headless
   Chromium). Python 3 for the build.
3. Build: `python3 build.py` → `index.html` (one file, everything inlined but `playgama-bridge.js`,
   `playgama-bridge-config.json` and `music.mp3`, which sit beside it). Suite: `node test.js`
   (~10 min, 940+ checks; never rebuild while it runs). Preview: any static server at the repo
   root (e.g. `python3 -m http.server 8781`) and open `index.html?dev=1`.
4. Ship: commit on `v2`, `git push origin v2`, then `git push origin v2:main`; verify the live
   files by byte size (`curl -sI` against `git cat-file -s v2:index.html`, the bridge and the
   config). The raw 3D/animation folders are ignored on purpose — the build does not need them;
   the models' versioned copy is the branch `assets/models-in-game`.
5. Read first: [CLAUDE.md](CLAUDE.md) (the batches of 2026-09-03 a–h are the latest — the one
   package, the play-time budget, no interstitials, the x5 badge, the penalty rule), then this
   page; the suite's red lines are read before anything is re-based. On a Mac whose git fails
   with rc 69 (the Xcode licence), prefix `DEVELOPER_DIR=/Library/Developer/CommandLineTools`.

## What shipped 7 September, morning (your word «variant 1, bring back the colour edition»)

- **The Safari 26 fields are coloured again, by the edition your phone confirmed on 6 September**: two thin
  strips at the screen edges carry exactly the colour of the row they cover, the seven dark screens get
  their own near-black in the zones, and during a chain reaction the bottom follows the sky as it goes
  green. Ten lines of CSS, two elements, no driver, nothing hidden. The design inside the screen is
  untouched. Restored from git verbatim, together with its ten guards.
- **What is not promised, and why**: content under the bars. Your own `?v=cards` frame proved the browser
  paints its fill OVER page content wherever a fixed box touches the edge, and the two attempts to make the
  menu and the leaderboard flow under the bar broke both screens on your phone in ways this Mac never
  reproduced. The outside advice you pasted says the same: a flat colour at the edge, and no promise of a
  gradient continuing under the chrome. The advice's `theme-color` does not apply — Safari 26 parses it and
  ignores it.
- **Where it shows**: only on a direct link (GitHub Pages, a shared URL). In the Playgama portal the game
  is an iframe and Safari takes its colours from the portal's page; in the SwiftUI wrapper there is no
  Safari chrome at all.

## What shipped 6 September, evening (the September review checked, your word «do only what you consider necessary»)

- **The review** (`Blendo gpt/docs/CLAUDE-PROJECT-REVIEW-2026-09-06.md`) was checked against the tree item by
  item; the disposition table is in CLAUDE.md, batch 2026-09-06-e. Four of its eight items were already
  raised by the August review and had never been decided — they are decided now.
- **Your leaderboard row no longer freezes on a second device.** The signing key that owns the row lives in
  the save with your id and travels with it: whichever id wins a merge, its key wins with it. A key the
  server refuses is dropped, so the next cloud sync brings the right one; a row deleted by the 180-day
  retention is re-created on the next win instead of being refused for ever. ⚠️ Not retroactive: a row
  frozen before this heals only after the device that owns the key runs the new build once.
- **The rank was wrong for equal scores and said it was exact**: 200 players with the same score, the 50th
  by time was told place 249, the very first place 200. The hourly ladder now remembers WHICH row stands
  at every hundredth place, not only its score. ⚠️ The base of a deep place still comes from the hourly
  snapshot, so it can lag by up to an hour while players above move (the review's second case); the
  server now says «as of when» (`t`), and the screen may show it — that is a separate, unmade change.
- **A crafted link can no longer redirect the first submission** (id, score, key) to a foreign server:
  the `?lb=` and localStorage overrides work only on a local host — your `localhost:8781/?lb=` link and
  every stand still work.
- **Small things**: `npm run build` / `npm test` / `npm run test:lb`; the worker's module warning is gone;
  the stale sabotage tool carries a dated warning; the July tech review is marked historical.
- **Not done, on purpose**: the save merge that loses overlapping sessions on two devices (a recorded
  boundary, V2-IDEAS); accessibility (your word whether it is a release requirement); the monolith and
  the D1 budget (recorded decisions).

## What shipped 5 September (your words with the inspector open, and your Safari instruction)

- **The zoom + and −** are 24 (your evening word; the morning said 28, before that 32) in the Shake
  caption's colour `#484472` (was black); one number `--shake-ink` serves the caption and the glyphs.
- **The pause icon** is 28 inside the 56 button.
- **The menu**: the side insets are 8 like the top one (was 16); the Easy/Hard segment sits 12 from
  the right like from the top and bottom (was 20); in the collection cards the count line is 2 px
  closer to the name (gap 5 → 3).
- **The ×5 screen on the phone**: the two chips are one row with a 16 gap and no labels (+13 🔍,
  +9 ✋) and 16 to the right of the icon inside each chip (your evening word, «double»); the whole
  screen fits without scrolling on a 375×667 SE (the 80 after the cross and the 136 bottom inset
  become 32 under 760 of height; under 375 the icons shrink to 44 so a 360 Android fits); the
  desktop row keeps its labels.
- **The eruption after a shake or a bomb falls slower** (your word about the phone in Low Power
  Mode, «a braking effect»): while the pile is in the air the terminal falling speed is 12 instead
  of the combat 16, the sleep of the pile restores 16, the pour keeps its own 14. Measured first: the
  braking is the physics falling behind real time on frames longer than 33 ms (0.88 of real time at
  CPU ×4), and lifting the dt/substep caps does not buy it back (canon 2026-09-05-d). ⚠️ **Your A/B
  on the phone in Low Power Mode**: `?fallcap=10`, `?fallcap=12` (production), `?fallcap=16` (the
  old feel) on the live link — the number you pick is one constant.
- **The Safari 26 fields are fixed, and your screenshot is what fixed them.** The bands are drawn by the
  browser itself, not by us: iOS 26 Safari paints its own flat colour over the top and bottom of the screen,
  taking it from whatever part of the page is pinned to that edge. In this game everything is pinned and
  nothing declared a colour, so the browser fell back to the page's `body` colour — the sky's ZENITH violet.
  That is why the bottom looked cut (violet under a mint horizon) and why the dark screens were framed in
  violet. Your `?v=cards` shot proved the last unknown: the top band went pure red and the bottom pure blue,
  over content that was lying right there, so the browser's fill paints OVER page content.
- **What shipped:** two thin strips at the screen edges, each carrying exactly the colour of the row it
  covers, taken from the sky's own palette. The game and the menu get the sky's top and bottom colours, the
  seven dark screens get their own near-black, and during a chain reaction the bottom follows the sky as it
  goes green. Ten lines of CSS, two elements, no driver and nothing hidden anywhere — that last part is what
  was wrong with the version you rejected. Guarded, and each guard proven by breaking it on purpose.
- **And on the pause screen and the leaderboard the content now really goes under the bar** (your two
  screenshots). Those two screens are lists, so they can own that strip: they stop being pinned to the
  viewport, grow as tall as the screen, and the coloured strip steps aside for them — so a card or a row is
  sliced by the address bar and continues through its glass instead of stopping at a line. Scrolled to the
  very end, the last card still clears the bar. The game keeps the colour, because its bottom row is a 3D
  canvas pinned to the viewport and there is nothing to lay out down there.
- ⚠️ **What is impossible, so you do not wait for it:** page content cannot lie under either bar on this
  phone under the ISLAND: the page begins below it and has no rows above its own first one, so that band can
  only ever be a colour — and it already matches the sky's first row exactly. Under the address bar content
  is possible only where the page has rows to put there and nothing of ours is pinned to that edge, which is
  why the menu and the leaderboard get it and the game screen cannot.

## What shipped 1–3 September

- **The full audit** you asked for: 8 finder lenses, two skeptics per finding, 34 findings survived —
  two real gameplay blockers fixed (the bomb destroyed the very block it had just thawed; the
  rescuer teleported a resting bomb because it read the dynamite as a sphere), plus the
  unshifted charge anchor, the painted-brick debris colour, and a tool that had checked nothing.
- **Ring accessibility samples fixed** (lifebuoy, donut): 6 of 8 origins used to sit in the hole;
  now 8 of 8, verified on a real level-39 Hard game — surgical, zero change to any other type.
- **The miss radius inverted on your word**: a mistake no longer drops the radius to 0.30; it
  now grows +0.05 per consecutive miss, stop at +0.20, always below the turbo ceiling 0.8, and any
  merge cancels the help. Measured: lv39 available pairs 3 → 4.
- **The props cadence restored**: 6, 9, 12 … 60, every gap exactly 3; nothing before level 51 moved.
- **Final screen**: the reward badge is a circle on one digit (36×36), the pills are circles.
- **Removed**: `07-matcap-bomb.js` (168 KB painting nothing) and the `release/` folder.
- **The Get More screen is ONE package** (3 September, your mock-ups 937:1505 / 937:1533): ×5 score
  for 30 min + 9 Shake's + 13 Tips for $1.99 (your numbers; the mock-up said 15/25) — the three cards are gone, the bridge catalogue and
  the wrapper's id table carry `bundle5` alone (+ `noads_forever`).
- **The «x5 float» badge** (your component 947:3670) sits in the HUD under the score: 20 px under
  it, its right edge flush with the score's, 70% on phones; «Boost» opens the purchase popup directly (the
  game pauses under it and resumes on close); the pause-menu button is now «×5 Boost». After a
  purchase the badge shows the minutes left and its button is a lime progress bar; buying again
  adds time (15 of 30 left + 30 = 45 of 60). The whole badge is the click; a tap on the dark
  area closes the purchase popup; the popups paint their dark fill on an inner layer now (the iOS
  26 edge law — check the top strip on your phone); the treasure's spawn flash at the top of the
  pour is removed.
- **The win screen**: the score now paints above the «SAVED» sticker where they overlap (your
  screenshot).
- **The ×5 screen, your three notes of 4 September**: both lime badges are 71 wide; the «o» in
  «score» has no gap (a gradient slug under the outline); the pills and the text are 80% of the
  screen under 400 px and 60% from 400 up — and by your second note the desktop row is used
  wherever it fits (from 560 px: tablets, landscape phones); under 400 px the content block is
  90% of the width, the text never leaves the pills. Tips come first, then Shake's; a pill keeps
  at least 20 px on the right inside; the gap between the pills is at least 16 px; the pill's
  backing is your three properties (radius 64, the 16% border, the 4% fill — no inner glow); your
  new magnifier file (00:38) is embedded in the hint button and the popup chip, and the hint
  button draws it in the same 38 box as the shake's hand (the whole sheet, nothing cropped).
- **Three more of your notes of 4 September**: the zoom buttons are 56 on the desktop (the hint's
  size); on the phone the zoom column sits 16 from the bottom edge like the hint and the shake; the
  menu button says «Play».
- **A mistake under ×5 costs its plain price** (your word of 3 September): the booster multiplies
  the reward only — the miss, the ice tap and the mixer's grind are not multiplied any more.
- **Your four answers of 3 September are in:** 20 Gam stays; the ×5 budget counts ONLY play time
  (it stands still on the menu, on the win/lose screens, in the intro, with the tab hidden); no
  no-ads window anywhere; **ads only when the shakes and the tips have run out** — the interstitial
  between levels, the «📺 Continue» and the «×2 coins» rewarded buttons are removed.
- **Platform SDK (Playgama Bridge) 2.0.2 → 2.1.0** (3 September): the newest tag, checked the way the
  canon demands — the public surface of every module we use is identical, a live A/B on
  `?platform_id=playgama` is identical, the config untouched. The npm package is `@playgama/bridge`
  now; we stay on the vendored file (verified by byte size on the live site), not on the CDN.
- **Audio/** is the source of every sound: four folders, drop a file in and it reaches the game.

## Direction chats

All five (Physics, Story, Bridge, Interface, Graphics) are archived 2026-09-02 — their work is in
`v2` or superseded. Load-bearing branches stay on GitHub by name: `bonus-standalone`,
`matcap-bench`, `assets/models-in-game` (the only versioned copy of the models).
**Blendo SwiftUI** (the iOS wrapper) stays open: wrapper ads + `noads_forever` and the Xcode
payment tests are on it.

## What is waiting for YOUR actions (the pre-launch checklist is in the 2026-09-02 report)

1. Playgama dashboard — ONE product since 3 September: `bundle5` (Consumable) — the config
   charges **20 Gam** for it (= $2.00 at the fixed rate; the mock-up says $1.99, which is 19.9 Gam
   and GAM is whole — say «19» if you want $1.90 instead). Delete `bundle3` / `bundle2` there.
   App Store: `monster.blendo.bundle5` keeps its id, move its price tier to $1.99. The wrapper
   (Blendo SwiftUI chat): drop `monster.blendo.bundle3` / `bundle2` from its StoreKit product list.
   `noads_forever` only if you decide, and NOT Consumable.
2. Store listing: icon 1024×1024, cover 1920×1080 (+1080×1920), 4–6 screenshots.
   Texts are ready in `docs/STORE-LISTING.md`.
3. Ads in the iOS wrapper: ONLY the two rewarded offers (a shake / a tip when the stock is
   empty) — since 3 September there is no interstitial anywhere. `noads_forever` has nothing left
   to switch off: say whether to delete the product from the catalogue (it is dormant, no entry point).
4. Smoke test on developer.playgama.com after the upload — the only place where the ads are
   real, the purchase is real and the Safari bars are visible. Two things to watch there after
   the SDK 2.1.0 update: the curtain now shows Playgama's full logo (their new default), and the
   portal now receives our `level_completed` — make sure NO interstitial appears at all (we call
   none since 3 September; one would be the portal's own doing).
5. A `?fps=1` reading from your iPhone on level 39+ on Hard.
6. The video Worker — ONE redeploy so the two new portrait files reach `video.blendo.monster`
   (the store reads the repo's `video/` folder; a dry-run deploy here reads 4 files — both pairs):
   `npx wrangler deploy --config /Users/ikorzyn/Desktop/Claude/Blender/server/video/wrangler.toml`, then
   `curl -sI -H 'Range: bytes=0-99' https://video.blendo.monster/blendo-intro-portrait.webm` → `HTTP/2 206`.
   Until then the phone's film comes from github.io (the direct link takes the relative address anyway).

7. YOUR DOMAIN — the site Worker's deploy (after step 1 in the dashboard, which you did; repeat after every
   release — the site does not follow GitHub):
   `cd /Users/ikorzyn/Desktop/Claude/Blender && npm run site:deploy`, then
   `curl -sI https://blendo.monster/ | head -3` → `HTTP/2 200`; `curl -sI https://www.blendo.monster/ | grep -i "^HTTP\|^location"`
   → `301` to `https://blendo.monster/`; `curl -sI -H 'Range: bytes=0-99' https://blendo.monster/music.mp3 | grep -i "^HTTP\|content-range"`
   → `206`. A 525/526 in the first minutes is the certificate — wait. The full steps: docs/SITE-MOVE.md.

## Decisions only you can take

- **The film's sound — an SFX-only stem?** The 9:16 file carries ONE mixed mono track (a hit at 2 s, a broadband
  rumble tail — nothing separable inside it). Shipped: the game's music never plays under an intro, the film's own
  track is the only sound. If «remove the music» meant a music bed INSIDE the clip, send an SFX-only render — one
  command re-encodes it into the same two files.
- **A 1080×1920 render of the portrait film?** 720 wide is a 1.6× upscale on your phone and 2.1× on the iPad in
  portrait. A 1080×1920 export from your source would be sharper at roughly double the bytes (~1.3 MB WebM,
  ~2.7 MB MP4). Your call; the recipe is one command.
- **The contour's thickness on the bonus object**: 1.06 now. Say «1.14 like the ice» and I widen the slot's
  camera with it (the object in the slot gets ~5 % smaller); say «thinner rim» and RIM drops from 0.30.
- **blendo.monster — what moving the game there needs** (your question of 8 September). The domain is already
  on Cloudflare (the zone that serves lb. and video.), but its apex and www point at a Namecheap forward that is
  broken over https (522 / 525 today; http www shows a parking page). The plan: a THIRD Worker
  (`server/site/`, like the video one) serving the game as static assets — index.html, the two bridge files,
  music.mp3, avatars/ (and video/ if you want one origin) — with the range-slicing script in front (Safari's
  music.mp3 needs 206 exactly like the film) and a cache policy per type (html revalidates on every load so a
  deploy is visible at once; media a day), on the custom domains `blendo.monster` + `www.blendo.monster`
  (www → a 301 to the apex). YOUR two actions: in the Cloudflare DNS dashboard delete the apex A/AAAA and the
  www records (the Cloudflare docs refuse a Worker custom domain only on a hostname with an existing CNAME; the apex
  carries A/AAAA, and removing them first is the safe path either way — wrangler creates its own record),
  then the deploy line I give you. GitHub Pages stays as it is (the testers' link, the film's second source).
  The game needs no change: on a non-local, non-github host it already takes the production leaderboard, the
  mock platform (no ads) and the film from video.blendo.monster. Say «build it» and the Worker + a packer that
  assembles the `site/` folder from the build arrive as the next batch.
- **The boost after a reload**: measured — it survives (25 min / 83% before and after the reload,
  the numbers are in `localStorage` under the player's own guest id). What you saw was the live
  build without the badge's active look; this deploy fixes that. Where a paid boost lives:
  the device's storage, the portal's cloud save (Playgama keeps it under the guest id), the
  wrapper's StoreKit restore. The one hole is the plain web after Safari clears storage — say if
  you want our own server ledger keyed by the guest id (the leaderboard service already has it).

- **The rank's freshness for deep places**: today the base is the hourly snapshot (up to an hour stale).
  The option is a full count for shallow places (say, the first 1000 — at most 1000 rows read per
  request) and the ladder beyond; it spends D1 rows exactly where the spec saved them. Say the number.
- **Accessibility**: dialog roles, focus, keyboard — about half a day for the eight overlays; keyboard play
  of the field is a separate design. Only if it is a release requirement.
- Telemetry is OFF (`URL = ''`); switching it on is one line, and needs a privacy policy with it.
- `bonus.html` — the one Cyrillic file left: translate its branch, or drop it.
- `mat_cream` is first audible at level 87 — the order of TYPES is your lever.
- Story after level 37, dailies, localisation — planned AFTER the release.
