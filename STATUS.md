# BLENDO — current state

A short page to read from your phone. Updated at big milestones.
⚠️ PROJECT MEMORY (survives any chat): [CLAUDE.md](CLAUDE.md) — all
decisions, bans and traps with their reasons; [WORKSTREAMS.md](WORKSTREAMS.md) —
a log of EVERY release with your specs verbatim; docs/ — plans.
A new session is required to read the canon first — that rule is in its header.

**Build: batch 2026-09-10 (the beginner window 1 → 5, the clamp 5 → 10) on top of 2026-09-09 a–m and 2026-09-08 a–i, v2 = main** · **the full suite: 1125 green, 0 red, `ERRORS: none`, SUITE: PASS** (run 45) · **blendo.monster is deployed and measured** · the leaderboard, video and site workers are deployed

**10 SEPTEMBER — THE FIRST FIVE LEVELS NO LONGER TAKE POINTS (batch 2026-09-10, your «A+B»).**
`SCORE_NO_PENALTY_LEVELS` 1 → 5 and `SCORE_CLAMP_LEVELS` 5 → 10. Levels 1-5 charge nothing at all;
6-10 charge but cannot push you into the minus; from 11 the full minus, as before. Measured on the
built page at every boundary: at level 5 a real miss on a score of 500 leaves 500, at level 6 it
leaves 400, at 10 it holds 0, at 11 it reads −100.
⛔ **THE LEVER I RECOMMENDED TO YOU FIRST DOES NOTHING, AND I SAY SO RATHER THAN SHIP IT.** Lowering
`MISS_TIE_FROM` to 1 is a no-op below level 20: the tie caps the price at four typical merges, and
on low levels merges are FAT (three types, sixty copies each — a merge is worth 8, four of them 32)
against a ladder that tops at 15. The cap hangs twice above the ladder. I recommended it without
re-reading my own memory file, which had said exactly this all along. The constant was not touched.
✅ **WHAT WAS ACTUALLY WRONG:** on levels 2-5 the score WAS charged and then clamped at zero — so a
pair's +2 moved a chip pinned to 0 (nothing to see) while every miss fired a red pop, a reddened
chip and a −10. The price there was fair; the FEEDBACK was one-sided. That is the tester's «any tap
takes points away», word for word.
⚠️ **THE OTHER SIDE, SO YOU HEAR IT FROM ME:** on levels 1-5 a pairless tap now costs nothing and
says nothing but the sound — and it is still a mistake (the turbo resets, the radius assist accrues,
the counters climb). The cliff moved from level 2 to level 6: it used to stand where you could not
see it, it now stands where you already have something to lose.
Nine guards in the suite moved with the rule, and two of them would otherwise have stayed GREEN for
the wrong reason — they stood on level 3 and measured «clamped at zero», which after this change
reads 0 because NOTHING IS CHARGED. The window now has boundaries pinned from both sides, which it
never had. **Run 45: 1125 green, 0 red.** Pushed; the site needs your `npm run site:deploy`.

**10 SEPTEMBER — THREE THINGS THE PLAYTEST AUDIT FOUND, AND ONE FALSE ALARM I KILLED.**
The audit's headline was a legal blocker before publishing, quoting `docs/3D-ASSETS.md`: *«the models
look like a third-party asset pack, the sticker sheet contains someone else's PYRE PALS logo»*.
**Checked: misdirected.** That model (`CA_Head`) appears in that document only, zero occurrences in
the code, and the recommendation three lines above it — «put it on hold» — is what happened. A
tombstone now sits at that line so nobody raises it a third time. ⚠️ The real open licence item is a
different one and it is your own recorded decision, not a discovery: the matcaps come from a library
with no licence at all, the risk was named to you on 18 August and you answered «we take the images».
Three real defects, each verified by me:
1. **`wiggle(item)` fires twice on one pairless tap** (`80-gameplay.js:1128` and `:1152`). One line.
2. **The level goal went dark by accident, not by decision** — it is written into a node inside a
   `hidden` holder, a side effect of the Figma win-screen redesign of 24 July. ⚠️ Simply un-hiding it
   makes things worse: nothing branches on the goal and it is beaten several times over at level 1.
3. **Telemetry is switched off** (`let URL = ''`), so the tester's «a solid 3» and «six minutes» are
   unanswerable and will stay so until a worker exists. You already run three.
⚠️ AND ONE QUESTION FOR THE TESTER, WHICH I GOT WRONG MYSELF: I told you he was on Easy. His wording
«предметы заблочены другими» matches the HARD toast «Item is covered from above» almost verbatim. On
Easy nothing is ever blocked. Which difficulty he played decides whether that complaint is in scope
at all.

**9 SEPTEMBER — THE SPEED FIX OF LAST NIGHT WAS DOING NOTHING, AND NOW IT IS (batch 2026-09-09-m).**
I deployed it, checked it, and found the domain unchanged: the page still came back without a validator and
a second visit still downloaded all 4.5 MB. The cause is Cloudflare, not our code — **it strips the ETag from
any response big enough to be streamed** (measured, eight cases: a 12-byte file keeps its tag, the 12.7 MB
page loses it, and it loses it whether the tag is strong, weak, ours or the store's own). `Last-Modified`
survives the same response untouched. So the page now carries a DATE as well as the tag, and answers both.
**Measured on the live domain just now: a repeat visit is `304, 0 bytes, 0.147 s` instead of 4.5 MB**, and a
player on an older build still gets the whole new page, so a release still reaches him at once. Telegram's
card and the music are untouched. Nothing for you to do — the deploy is done.
⚠️ The lesson I am writing into the memory file: a green test suite here proves our code, not what Cloudflare
does to it on the way out. Anything that depends on the CDN gets one real measurement against the CDN before
I call it fixed. That is on me — last night I reported it as done on the strength of the tests alone.

**AND THE FULL RUN FOUND ONE THING — A QUESTION FOR YOU AT THE END.** 1123 checks passed and the run
still came back red, on a 404 in a TEST rig: the bridge stand serves three files and 404s the rest, and the
PWA batch added three links to the page's head seven batches ago. Fixed the rig (it now serves what a real
host serves) and re-ran green. ⚠️ But the same 404 is REAL on Playgama: the package you upload there is
index.html + two bridge files + music.mp3, so the manifest and two icons are missing and the portal logs
three 404s at every launch. Nothing breaks — you cannot install a game inside an iframe anyway — it is
console noise in their console. **77.7 KB against a 13.96 MB package.** Say the word and I add the three
files to the package; I did not change your upload routine on my own.

**9 SEPTEMBER, NIGHT — THE TELEGRAM PREVIEW WORKS.** Confirmed by you after `@WebpageBot`. The cause was
Telegram remembering a FAILED preview on the address, not the page itself: a URL it had never seen showed the
picture straight away. ⚠️ Honestly: I never proved my original suspicion — that the 12.7 MB page was too big
for the crawler — and now it cannot be proved either way. The 1 KB card stays regardless, because it takes the
page's size out of the question for every messenger and every network, and it is built from the game itself so
it cannot drift. Worth remembering for the next time something of ours is cached somewhere invisible: ask with
an address the other side has never seen, `?v=2` and the like, and you learn in five seconds whether the fault
is ours or their memory.

**9 SEPTEMBER, NIGHT — WHY THE DOMAIN FELT SLOWER, AND THE TELEGRAM ANSWER (batch 2026-09-09-k).**
THE SPEED: measured, and the pipe was innocent — the domain even sends FEWER bytes than GitHub Pages (brotli
4.50 MB against gzip 4.59 MB, the same build). The difference is the browser cache. Pages says `max-age=600`
and gives you an ETag, so a second visit downloads NOTHING. The domain said `no-cache`, and Cloudflare's asset
store gives the page at `/` no ETag at all — every asset around it has one, only the page does not. Without a
validator «revalidate» means «download the whole 4.5 MB again», on every single load. Fixed: the site now
hands out the build's hash as the ETag and answers a repeat visit with a 304 of zero bytes. That is faster
than Pages on a second visit and still instant on a release, which `max-age` would not be. The service worker
also stopped rewriting the 12.7 MB page into its cache on every load; once per build is enough.
⚠️ IT REACHES THE DOMAIN ONLY WITH YOUR DEPLOY, and the check afterwards is one line, both below.

THE PREVIEW: our side is correct and I measured it from outside. To Telegram's crawler the address returns the
1162-byte card with the picture in it, and `og.jpg` answers 200 as a 2 MB JPEG. I also checked the thing that
would have been really bad — Cloudflare's cache ignoring `Vary: User-Agent` and mixing the two — and it does
not: six alternating requests gave the bot the card and the browser the game, six times out of six. So what is
left is Telegram itself. It remembers a FAILED preview for days, and `@WebpageBot` is the only way to clear
it. To tell the two causes apart in five seconds: send `https://blendo.monster/?v=2` in any chat — that URL
Telegram has never seen, and the site answers it exactly like the main one. Preview appears there → the main
URL is just a stale cache, push it through `@WebpageBot`. Preview does NOT appear even there → the crawler is
not reaching us, and the answer is in Cloudflare, Security → Events, filter user-agent `TelegramBot`.

**9 SEPTEMBER, NIGHT — THE ICON IS YOURS NOW (batch 2026-09-09-j).** Your `icon.jpg` replaced the crop I had cut
out of the poster. It is taken AS IS for Android, the desktop and iOS: nothing cropped, nothing recoloured, the
JPEG itself untouched. One variant had to be built rather than copied: Android may mask an icon with a CIRCLE,
and your art fills the square, so the bottom of the jar and the tops of the flames were being cut — 6.6% of the
drawing. For that variant the picture is shrunk until it fits the circle, and the field around it is your own
edge continued outward, so there is no square seam inside the icon (measured: the seam is 1 unit of colour,
against 17-20 for every flat backing I tried). The sheet is above.

**9 SEPTEMBER, NIGHT — STRIPE IN PORTUGAL, THE INSTRUCTION (docs/STRIPE-PORTUGAL.md).** Point 3 of your
list. The whole route is written out: what must exist before Stripe (NIF, an open activity at Finanças,
IBAN), the account itself step by step, the taxes honestly, and how it wires into the game — the payment
seam already exists, so Stripe becomes a third provider next to the wrapper and Playgama, and `buyBundle`
does not change at all. THREE THINGS TO READ BEFORE DECIDING: (1) on a €1.99 boost Stripe takes 14–18%,
and almost all of it is the fixed €0.25 — on a €9.99 pack it would be 3.5%, so a bigger item in the
catalogue is worth more than any fee haggling; (2) Stripe is NOT the seller, so the VAT of every European
sale is yours to declare — a merchant of record (~5% + $0.50, i.e. ~30% of €1.99) buys that problem
instead; (3) Portugal wants ATCUD, a QR code and a monthly SAF-T on every invoice, and Stripe's receipts
are not Portuguese invoices — that piece needs a Portuguese invoicing API. ⚠️ I wrote NO code: the first
decision (Stripe or a merchant of record) and the paperwork are yours, and building against an account
that does not exist would be work thrown away. When you decide, the code is one day — and it also closes
the old hole that a purchase today lives only in the browser and dies with a cleared cache.

**9 SEPTEMBER, NIGHT — THE GAME INSTALLS AS AN APP (batch 2026-09-09-h in CLAUDE.md).** Point 2 of your
list is done. On Android and on the desktop Chrome now offers an install; on the iPhone and the iPad it is
Share → «Add to Home Screen», and the game opens without Safari's bars at all — which is, by the way, the
one mode where the whole screen belongs to the page, without the fields we fought all week. THE ICON is cut
from your own `Blendo OG.jpg` — the face on the poster's own sky, nothing redrawn; I sent you a sheet of how
it looks on Android, on iOS and in a round launcher, and one command re-cuts it if you want another framing.
The launch splash on Android is the poster's sky, so it and the poster that follows are one colour.
✅ AND IT WORKS OFFLINE: measured in a real browser against the real site worker — the network cut, a reload,
and the game came up in full from the cache. ⛔ THE ONE THING I WATCHED HARDEST: the worker does not touch the
music or the video AT ALL. A worker that answers a Range request kills playback in Safari, and that is
guarded from three sides plus a live check (the music still answers 206 with the worker in front).
⚠️ YOUR ONE STEP: `npm run site:deploy` — the manifest, the worker and the icons are new files, and the site
does not follow GitHub. After that, open blendo.monster on the phone and try «Add to Home Screen».

**9 SEPTEMBER, NIGHT — THE SHARE PICTURE IN TELEGRAM (batch 2026-09-09-g in CLAUDE.md).** Your report that the
share picture does not come out. The origin turned out to be right already: the metas are whole and sit at byte
2522, and `og.jpg` answers 200 as a 2 MB JPEG. What is out of place is the size of the page itself — a crawler is
asked to read 4.5 MB (12.8 MB unpacked) to find a meta that ends at byte 2.7 K. So the site now hands link-preview
bots a 1162-byte card with the same metas and nothing else, built out of the game by the packer so it can never
drift from it; players and search engines keep getting the real page, because showing a search engine something
else is cloaking and is punished. ⚠️ I could NOT prove that the size is what Telegram chokes on, and I am not
claiming it: two cheaper causes are yours to check first. THREE STEPS, IN ORDER: (1) `npm run site:deploy`;
(2) in Telegram send `https://blendo.monster/` to `@WebpageBot` — it drops the cached preview, and until you do
this the deploy proves nothing, because Telegram remembers a failure for days; (3) if it is still empty, open
Cloudflare → Security → Events and filter the user-agent `TelegramBot`: a challenged crawler is a dashboard
setting, not a page problem (I could not read that from here — the token in this session is refused).

**9 SEPTEMBER, EVENING — THE LOADER, THE SHARE CARD, THE MUSIC (batch 2026-09-09-f in CLAUDE.md).** Your
picture is the share card (`og.jpg`, absolute on blendo.monster — the domain shows it after your deploy). The
desktop/tablet order is now: the sky with a spinning ring while the film loads (the canvas hidden until the film's
first frame) → the film → the game with the pour; the wait for a slow film is 2.5 s instead of 1.5. The music: the
poster no longer holds it (it starts under the poster wherever the browser allows), and the buffer warms under the
intro — measured at 1.5 Mbit, the start after the film 354 → 30 ms, after the poster 314 → 18 ms. What no page can
change: an unmuted autoplay without a gesture is the browser's decision — Safari refuses by default, Chrome allows
it only where the site's media engagement is high, and blendo.monster is two days old (`chrome://media-engagement`);
where refused, the first tap or click starts it at once. Your rule on runs is in force: section dry-runs and
sabotages gate a push, the full suite on your word. Your step: `npm run site:deploy`.

**9 SEPTEMBER, LATE AFTERNOON — «FIX THE REST» (batch 2026-09-09-e in CLAUDE.md).** Read as the FILM (the second
half of your morning word). The poster's recipe was applied to the film, measured and NOT shipped: the film's
zone colour was already right by the afternoon batch (the load fill and body both wear the film's sky while it
plays; the iPad and the Mac have no bottom zone; the top zone is a flat colour on every device — the platform's
limit), and the recipe only moved a ~1 s compositor commit (film + canvas) from under the film to the fade — a
freeze of the fade on the bench. The tree is byte-identical to what you have; two suite arms now wait for the
fact instead of 600 ms of the clock (a latent flake of the tablet's arm, uncovered by this). If «the rest» meant
other phone screens (the game, the menu, the leaderboard, the ×5 screen, the win screen) — name which: those stand
on the 6 September edge cards you confirmed. Your check remains the iPad/Mac over the film, and `npm run
site:deploy` after this push.

**9 SEPTEMBER, AFTERNOON — THE POSTER'S ZONES (batch 2026-09-09-d in CLAUDE.md).** Your screenshot from
blendo.monster: the zones over and under the poster in the game's lavender, the poster cut at the bar. The cause,
by the 5 September measurements: fixed layers under the poster (the load fill with the game's colours, the canvas,
the HUD bars) — WebKit reads the zone colour from the nearest fixed box at its sample point and, while any fixed box
covers the bottom point, paints OVER the document's rows there. One rule now hides them for the poster's duration
only (nothing else touched, one-line rollback): the top zone should be the poster's own sky, the bottom the poster's
rows under the bar. Your check: `npm run site:deploy`, a fresh tab, a screenshot. If the bottom is still cut, plan B
is yours: the poster rounded top and bottom like the browser bar, one line. (Pushed with -b as 0a13b8d after run 40; you confirmed the poster on your phone.)

**9 SEPTEMBER, MIDDAY — THE GAME ON YOUR DOMAIN: THE SITE WORKER IS BUILT (batch 2026-09-09-c in CLAUDE.md).**
`server/site/` serves `blendo.monster` and `www.blendo.monster` (www → apex, http → https, the music sliced for
Safari's Range through the video worker's own code, html revalidated on every load); `npm run site:deploy` packs
`site/` from the build and deploys. Verified locally over `wrangler dev`: the html byte-identical to the build,
music 206, the tail byte-identical, avatars a day, 404s pass. YOUR DEPLOY LINE (item 7 below), then the three
curls. Note: `site/` is packed from the CURRENT build, which carries the phone-poster batch of the same morning
before it is pushed to GitHub. The full steps: docs/SITE-MOVE.md.

**9 SEPTEMBER, THE MORNING — THE PHONE IS THE POSTER ALONE; THE FILM STAYS ON THE TABLETS AND THE DESKTOP (batch
2026-09-09-b in CLAUDE.md).** Your word «leave only the poster on phones; the video on tablets and the desktop; both
always full screen and under all the system elements». Done: on a phone-width screen (under 768, any orientation) the
poster is the whole intro and not a byte of film is fetched; the iPad in portrait keeps last night's composition — the
portrait film over its poster (the poster stays the cover of the load and the fallback; you named the phone, not the
tablet's poster — say the word and the tablet becomes the film alone); the landscape iPad and the Mac keep the landscape
film (an iPhone held sideways lays out wider than 768 and takes the landscape film — the width is what «phone» means
here, as everywhere in the layout; say the word if a sideways phone should show the poster). «Full screen, under the
system elements» is already how both intros are built: cover-fitted over the whole layout
viewport; on the phone the poster's box runs under the address bar (deduced from your phone's measurement of 5 September;
your phone is the check — no line and no violet at the bottom edge). Two limits, plainly: the zone under the clock and the
island is a flat colour on EVERY web page (the intro's own sky here — a page has no rows above its origin, five editions
measured it), and the browser's Fullscreen API needs a tap, so it cannot serve an autoplay intro. The suite: the phone
arms re-based to «no film», the tablet film arms moved to 768×1024, a new arm measures the landscape film's full-viewport
box; two of the moved arms were made page-driven after a race with the bench's clock showed up at the tablet size.

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
1080×1920 render would be sharper at about double the bytes, your call (⛔ since batch -b the same morning the phone
shows the poster alone; the iPad's 2.1× is the one that matters). ⚠️ A landscape phone under 768 wide gets the
portrait film cover-cropped, as it gets the poster (⛔ since batch -b: the poster alone). ⚠️ On the desktop the music no longer starts under the loading
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
then the iPad's portrait film comes from github.io (the direct link takes the relative address anyway; since batch -b
the phone fetches no film at all).
**Your devices, when you look:** the phone — the POSTER ALONE (no film starts on it), its bottom under the address bar
with no line and no violet, the status zone the poster's sky, the music arriving only after; the iPad in portrait — the
poster, then the film starting on it, its sound on the first tap (the second skips), the music only after; whether the
film starts at all on iPadOS Safari before the poster's hold runs out (an iOS load kick is in; unmeasurable here); the
landscape iPad and the Mac — the film over the whole viewport.

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
6. The video Worker — ONE redeploy so the two new portrait files reach `video.blendo.monster` (they serve the iPad
   in portrait alone since batch -b; the store reads the repo's `video/` folder; a dry-run deploy here reads 4 files — both pairs):
   `npx wrangler deploy --config /Users/ikorzyn/Desktop/Claude/Blender/server/video/wrangler.toml`, then
   `curl -sI -H 'Range: bytes=0-99' https://video.blendo.monster/blendo-intro-portrait.webm` → `HTTP/2 206`.
   Until then the tablet's portrait film comes from github.io (the direct link takes the relative address anyway).

7. YOUR DOMAIN — the site Worker's deploy (after step 1 in the dashboard, which you did; repeat after every
   release — the site does not follow GitHub):
   `cd /Users/ikorzyn/Desktop/Claude/Blender && npm run site:deploy`, then
   `curl -sI https://blendo.monster/ | head -3` → `HTTP/2 200`; `curl -sI https://www.blendo.monster/ | grep -i "^HTTP\|^location"`
   → `301` to `https://blendo.monster/`; `curl -sI -H 'Range: bytes=0-99' https://blendo.monster/music.mp3 | grep -i "^HTTP\|content-range"`
   → `206`. A 525/526 in the first minutes is the certificate — wait. The full steps: docs/SITE-MOVE.md.

## Decisions only you can take

- **The portrait film's sound — an SFX-only stem?** (The iPad in portrait is the only place it plays now.) The 9:16 file carries ONE mixed mono track (a hit at 2 s, a broadband
  rumble tail — nothing separable inside it). Shipped: the game's music never plays under an intro, the film's own
  track is the only sound. If «remove the music» meant a music bed INSIDE the clip, send an SFX-only render — one
  command re-encodes it into the same two files.
- **A 1080×1920 render of the portrait film?** 720 wide is a 2.1× upscale on the iPad in portrait — the only place the
  portrait film is seen since batch -b (the phone shows the poster). A 1080×1920 export from your source would be sharper
  at roughly double the bytes (~1.3 MB WebM, ~2.7 MB MP4). Your call; the recipe is one command.
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
