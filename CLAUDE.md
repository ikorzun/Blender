# CLAUDE.md — BLENDO (working name "Mixer"), branch v2

> COMPACT CANON — the rules in force. State as of 2026-10-01 (commit 9ded9c7 + this file).
> The full history — 344 sections, 1.7 MB, July–September 2026 — moved VERBATIM to
> docs/CANON-HISTORY.md on 2026-10-01. Auto-loaded into every session it cost 563K tokens
> (56% of the 1M window) before the first message, and sessions died in auto-compact
> (the owner: «Blender — I cannot assemble a session, the limit is not enough»).

## 0. Keep this file small — read before writing anything here

- **NEW BATCH RECORDS GO TO THE END OF docs/CANON-HISTORY.md, NEVER HERE.** Same style as
  before: `## BATCH YYYY-MM-DD-x: <what> (<his word, translated>)`, measurements, traps, runs.
  Appending at the end keeps the earlier line numbers valid.
- This file changes ONLY when a rule in force changes: edit that one line here, put the why and
  the numbers in the archive record. **Budget: ≤ 40 KB** — check `wc -c CLAUDE.md` before
  committing an edit to it. A batch that grows this file by a section is the defect that made
  it 1.7 MB.
- **NEVER read whole:** docs/CANON-HISTORY.md (1.7 MB), WORKSTREAMS.md (0.7 MB), STATUS.md
  (0.12 MB) — each would eat a session. Grep them:
  - list the sections: `grep -n '^## ' docs/CANON-HISTORY.md`
  - one subsystem: `grep -n -i '<keyword>' docs/CANON-HISTORY.md | head -40`, then Read with
    offset/limit. The table in §9 gives keywords per subsystem.
- Before changing a subsystem, grep its history. In the archive «⛔» marks a cancelled rule and
  the LATEST dated record wins over an earlier one.
- Never name another file CLAUDE.md (nested CLAUDE.md files are auto-loaded on demand — that is
  how sessions started in the parent folder got hit too), and never reference a file from here
  with the import syntax (an at-sign followed by a path).
- Comments in src/, test.js and docs/ that say "the canon" or "CLAUDE.md §…" were written
  before 2026-10-01 and mean docs/CANON-HISTORY.md.

## 1. The project in one screen

- BLENDO is a mobile-first HTML5 3D match-pair game: a glass bowl (a blender) is filled with
  ~140 3D items; the player taps groups of identical ACCESSIBLE items; the mixer at the bottom
  grinds pairs when the player idles. Every level unlocks one new model.
- The owner (Ivan) is talked to in **RUSSIAN**. The repository is **ENGLISH-ONLY** (his word
  2026-08-22-g): no Cyrillic in tracked files except bonus.html; quote him as literal English
  translations in «». Census: python over the U+0400–U+04FF range (perl without -CSD is blind).
- **Points only — there is NO concept of stars** (his word 2026-09-01-i); the ★ glyph is just
  the points icon.
- Day theme only (2026-08-20): the night palette and `html.night` rules exist and are unreachable.

## 2. Where things live

- Branch `v2` = work; `main` = GitHub Pages, https://ikorzun.github.io/Blender/ (it serves the
  index.html of the commit `main` stands on). Remote `blender` = github.com/ikorzun/Blender —
  a PUBLIC repository.
- **blendo.monster** = Cloudflare Worker `blendo-site` (server/site/) serving the packed `site/`
  folder (gitignored). It does NOT follow GitHub.
- Other workers — each deploy is the OWNER's action (give him the exact command):
  lb.blendo.monster (server/leaderboard, D1), video.blendo.monster (server/video — the intro
  films, it slices Range requests itself), pay.blendo.monster (server/pay — Stripe Checkout +
  Google sign-in, D1).
- Playgama portal package = index.html + playgama-bridge.js + playgama-bridge-config.json +
  music.mp3, uploaded by hand by the owner (cabinet: DRAFT). Measure its weight by the ZIP
  (reference 8 MB) — every model batch spends it.
- The iOS/macOS wrapper (another chat, clone "Blendo iOS") serves `blendo://game` and injects
  `window.__nativePayments` (StoreKit). Other clones on this disk (`Blendo iOS`,
  `Blendo v2 Codex`) belong to other chats: never sync or touch them. Before work:
  `git fetch blender && git status`; the main tree stays on `v2`; leave other people's
  untracked files alone.

## 3. Source, build, tools

- `src/shell.html` — markup, CSS, inline gates, placeholders. `src/app/NN-*.js` — 31 modules
  concatenated BY NUMBER into ONE IIFE (one scope, not ES modules). The number is the top-level
  init order: **top-level code must never read a `const`/`let` of a higher-numbered module**
  (TDZ — even `typeof` on it throws; it once cost six days). Functions are hoisted and fine.
- Map: 00-config (every tuning constant — read numbers THERE, not here), 08 matcap packs,
  10-stage (renderer, sky, matcaps), 12 matcap editor, 20-arena (blades, radiusAt), 30-shapes
  (TYPES, MESH_SCALE), 36/38/39/41 generated model modules, 40-items (genLevel, items, specials),
  50-physics (Rapier world, colliders, rescuers), 60-access (accessibility), 70-fx, 73-material
  (MATERIAL_OF), 74-sfx-data (generated), 75-audio, 77-save, 78-ads (bridge + payments seam),
  79-telemetry (off: URL = ''), 80-gameplay, 82-lb, 83-pay, 84-auth, 85-hud, 86-story,
  90-input, 99-main (the loop; test hooks on `window.__game`, DEV only).
- `python3 build.py` (= `npm run build`) → index.html (**never edit by hand**), sw.js (from
  src/sw.js), music.mp3 (from Audio/2-music/background-music.mp3), and re-packs `site/`.
  Deterministic: same sources → same bytes. The dev label is stamped by the build; it refuses
  to build without exactly one placeholder.
- Engine: three.js r149 UMD (never above r160 — the UMD build is gone; an upgrade means ES
  modules + a bundler, a separate decision). Rapier 0.20.0 (the npm package rapier3d-compat;
  the lock pins it; vendor bundle src/vendor/rapier.js). Playgama bridge 2.2.0 vendored as
  playgama-bridge.js (not the CDN).
- `3d assets/` (gitignored; `models/` is the generator input, `matcap/`) — the ONLY copy is on
  this disk. tools/glb2module.py regenerates a model module ALL OR NOTHING and needs its
  post-steps (atlas alias, duplicate consts) — grep the archive for `glb2module` first.
  Model budget: docs/MODEL-BUDGET.md (1500-triangle policy ceiling, held by review). A batch
  that adds models owes BOTH numbers: bytes (ZIP) and triangles (a frame A/B).
- `Audio/` — the source of every sound (1-interface, 2-music, 3-objects, 4-gameplay);
  tools/sfx-pack.py packs it into 74-sfx-data.js. A file dropped in goes into the game.
- Tools: tools/section-dryrun.js, tools/build-variant.py, tools/site-pack.py, tools/icon-gen.py,
  tools/hitfx-pack.py, tools/avatar-tint.js, tools/material-map-check.js, tools/flow-band.js
  (the phone-geometry bench), tools/bridge-probes/, tools/play-record.js (`npm run record` —
  the bot that records 60-s videos into renders/; never beside the suite).
- Suite: test.js (Playwright, ~1320 checks; sections marked `⟦NAME-SECTION-BEGIN⟧` …
  `⟦NAME-SECTION-END⟧` — keep the markers, the dry-run tool lifts by them). Server suites:
  `npm run test:lb | test:pay | test:site | test:video`, each with a `:break` sabotage twin.

## 4. The owner's standing process rules

1. **RUNS.** No full suite unless he asks («never unasked», 2026-09-12). The gate for a commit
   and a push = every section the change touches, dry-run ALONE
   (`SECTION=NAME node tools/section-dryrun.js`), plus sabotage variants built OUTSIDE the tree
   (`python3 tools/build-variant.py …`, then `MIXER_PAGE=<variant>`), each red on its own arm,
   a comment-only edit green, the tree's index.html md5 unchanged after. A change to a shared
   helper → dry-run every section that reads it. A change to shell.html's HEAD → check the
   suite's own mini-servers (they serve a fixed file list). Docs-only changes need no run.
   Main-run arms outside marked sections cannot be dry-run: replicate their reads in a probe.
2. A full run (`node test.js`, ~20 min) only on his word. **Never open any browser beside it**
   (probes, dry runs, screenshots → false reds). Read the result by the `SUITE:` line, never by
   the FAIL count — a run that died has zero FAILs.
3. **Kill only your own processes:** record the PID at launch; never `pkill` by name (other
   chats run the suite); worktrees live inside this tree, so compare cwd in full.
4. **RELEASE** after a green gate: `git fetch`; commit with a targeted `git add` (never `-A`);
   push `v2`, then `v2:main` (fast-forward); verify Pages by the md5 of the served index.html.
   Then deploy the domain YOURSELF (his word 2026-09-10): `npm run site:deploy`, and verify by
   bytes — md5 of https://blendo.monster/ equals the local index.html (an edge node can lag a
   minute: read twice and compare content-length), a `TelegramBot` user-agent gets the ~1.2 KB
   card, `Range: bytes=0-99` on /music.mp3 → 206. A returning BROWSER may show the previous
   build (the service worker cache) — curl sees the server. A docs-only commit changes nothing
   in site/ and needs no deploy.
5. Worker deploys (pay, lb, video) and everything in dashboards (Cloudflare, Stripe, Google,
   Playgama, App Store) are HIS actions.
6. **A PICTURE FIRST** for anything visual: render frames on a bench at his phone's geometry
   (402×654 layout viewport in an 874-pt screen, DPR 3; tools/flow-band.js) and send them before
   trusting guards. Measure layout by computed style and rects, not by eye; check the worst
   CONTENT (a long name, a nine-digit number), and sweep widths — breakpoint cliffs live
   between the widths anyone picks.
7. **FIGMA:** read nodes through Dev Mode (get_design_context / get_variable_defs with an
   explicit fileKey; the second server mcp__9601b1f2… works when mcp__Figma__ breaks) — never
   eyeball a screenshot. His asset files are taken AS IS: never re-encode, resize or change an
   extension. He delivers files SILENTLY by overwriting them on disk (Interface/*.png,
   icon.jpg…): check `git status`, mtime and md5 before answering «already done».
8. Game-design forks are HIS: name the price in numbers, offer options, never decide silently.
   A guard states a decision, not a truth — when he changes a rule the guard moves with it
   (with a tombstone at the old line); it is not «repaired».
9. zsh traps: no Cyrillic variable names; `for x in "a b c"` and `set -- $x` do NOT split;
   `$2:f…` are history modifiers — write `${2}`. Pass numbers to probes as explicit VAR=value.
10. In Node test code a bare capitalised identifier may resolve to a web global (`URL`,
    `Request`, lowercase `crypto`…) instead of throwing — use the suite's own names (PAGE_FILE).

## 5. Measuring and writing guards (each line was paid for)

- A perf number without its ruler is not a number: CPU throttle, real GPU vs software,
  viewport, level, **Easy vs Hard** (Easy skips the sky-ray fan entirely — measure on Hard, the
  owner plays Hard). Headless rAF on this Mac ticks ~96 Hz. A/B with alternating arms, ≥3 reps,
  medians; attribute the bad frames (loop work vs time outside the loop) before concluding.
- Wait for the FACT (poll a state with a ceiling), never a fixed pause. A bare
  `waitForFunction` that can time out KILLS a section without a verdict — catch it.
- A guard brings about its own state (its own page/context; a long-lived page plays itself out
  under it). A negative assertion needs a positive control (the tap landed, the event fired).
- Two-sided proof is mandatory: red on the sabotage, green on the healthy build. Strike the
  PROPERTY, not its neighbour; take the sabotage's anchor line from the file; prove the
  sabotage actually applied. Sabotage on copies outside the tree; md5 the original after.
- Derive live constants in guards from hooks (pairsRule(), meshScale(), distinctCap()…), never
  copy them; compare raw values against irrational constants (a rounded read flips at the cap).
- Read a hook's body before trusting its silence. `__game` is ONE object literal — a duplicate
  key silently wins: grep before adding a hook. `__game.level` / `__game.stats` are functions.
- A guard against a fake (a node stub) cannot see what a real intermediary does — a CDN edge
  (it strips an ETag from a streamed response), Safari, his phone. Measure the intermediary.
- From level 23 a level deals a random subset of the open types (the distinct cap): a guard
  that names a type there must union over several regens (pinned into every deal: the newest
  unlock, boosted kinds, the returned kind).

## 6. The game as it stands (exact numbers: 00-config.js)

- **Pool:** TYPES in 30-shapes (105 types in 10 packs as of 2026-09-13), LEVEL_TYPES_MIN 3, one
  new type per level, the whole pool open from `TYPES.length − LEVEL_TYPES_MIN + 1`; the New
  Object screen shows on entering levels 2…that level. **The ORDER of TYPES and the spawn
  formula are a difficulty lever — changed only by his word.** Saves are keyed by type NAME. A
  model batch touches TYPES (30-shapes), MATERIAL_OF (73-material), ACC_LABELS (77-save) and
  the suite's sentinels — print the index→level table, the inverse formula is easy to get wrong.
- **Bowl:** PAIRS 70 (140 items from level 7). ONE size knob: `MESH_SCALE = 0.62·ITEM_SIZE_K`
  (K = cbrt(180/140)); the reach radii are their pre-2026-09-13 literals × K; spawn steps are
  derived (SPAWN_LAYER_STEP, DROP_STACK_STEP). The pile tops out at 7.5–9.0.
- **Matching:** a tap removes every accessible same-type item within the match radius (the true
  surface gap through Rapier), group cap MATCH_MAX_N. Dynamic radius + a combo ladder up to
  COMBO_RADIUS; endgame ∞ at ≤ 8 counted alive, soft ∞ at ≤ 15 with ≤ 1 own shake; the miss
  assist widens the radius per consecutive miss (never past the combo ceiling). Turbo («Power
  chain») from a clean series of CHAIN_COMBO_AT; one miss kills it.
- **Accessibility:** Easy = everything but the treasure. Hard = a fan of 7 sky rays from samples
  INSIDE the collider — camera-independent (never from the camera, never into a centre; ring
  types sample on their ring). Background refresh is partial; after a match it is local;
  settles and events ARM a burst of slices (`accSweepBurst`, drained even on a sleeping pile);
  `skipIntro` and `findHintGroup` stay synchronous. Named, open: the fire picker still runs a
  one-frame fan.
- **Scoring:** 1 shown point = SCORE_DENOM raw; every score constant is written `n * PT`.
  `scorePenalty` is the ONLY line that lowers the score, and **no boost ever multiplies a
  penalty**. `rewardMult()` is the single reward multiplier (the paid ×5 × the rival's window).
  Miss price = a ladder 10…15 that wraps, reset by any merge (`stats.missRun`, not
  `stats.misses`); levels 1–5 charge nothing, ≤ 10 clamp at zero; the grinder charges the eaten
  pair's base value (`pairScoreAt`); merge curve from level 17 (MERGE_CURVE_STEP); type tiers
  ACC_MULT_STEP 0.5, cap 9.
- **Specials:** the golden fish (treasure); the bomb = dynamite (from level 5, every 1–3 levels,
  plus a reward for turbo series); the ice block (FROZEN_PAIRS_N); the rival — a glass bubble
  with the NEXT leaderboard neighbour's avatar, a tap = ×3 on earnings for 5 s of play, no
  neighbour → no rival (no avatars ship to the portal); the type charge (turbo ignition + a
  schedule from level 21, lands on the most upgraded kind); fire (one burning item, period
  shorter from level 5); «your item returns» (from level 11 one old kind near its next tier gets
  a double share, latched per level).
- **Economy:** one package `bundle5` — $1.99 / €1.99 / 20 GAM on the portal: 9 shakes, 13 tips,
  ×5 for 30 min of PLAY time (Save.bb/bu budget). Ads: rewarded only when shakes/tips have run
  out; **no interstitials**. Balances are monotone counter pairs (se/ss, he/hs…) — never a
  max-merged balance field. The ads track waits for his decisions: docs/ADS-TRACK.md.
- **Physics:** Rapier 0.20, G 26, 1/60 step, ≤ 2 substeps per frame (more amplifies a slow
  frame), CCD on, walls = stepped rings with WALL_GAP; our own global sleep (never a forced
  sleep on the clock alone, never in the intro); MAX_FALL, FLIGHT_FALL_CAP after a shake/bomb,
  a lower cap in the intro; bodies released in waves during the pour; wall/floor rescuers
  teleport LOCALLY only. Frame cap 60 with a lateness credit (`capDecide`) — not a bucket.

## 7. Subsystem contracts (break one and a guard or a player notices)

- **SAVE (77-save):** `mergeSave` is ALSO the loader — every persisted field must be named in
  it, and it has TWO branches: the newer-generation `gf > gi` branch RETURNS early (a progress
  reset bumps `gen`). Identity: gid (player key), lk (HMAC key), gn/gs/ga (name, its source,
  photo), gp/lp/gr (the device's way back, under `own`); pickLk/pickName make them travel with
  the winning gid. `resetProgress` keeps the identity.
- **LEADERBOARD (82-lb, server/leaderboard):** OUR table, rank = current balance (spending lowers
  you — his «Forbes» model); the platform's setScore is still sent but not shown; one list, no
  tabs. A rank is shown only when exact. No anti-cheat by his word (2026-08-09-b): the HMAC
  signature (row ownership), the rate limit and /admin/hide stay. Sends muted on file:/webdriver
  (LB_NOSEND) and on local hosts (`lbHostIsLocal`); `?lb=` overrides only on local hosts.
- **PAYMENTS (78-ads seam):** `payApi() = native || bridge || web` — the ORDER is the design
  (StoreKit in the wrapper, Playgama in the portal, Stripe only on blendo.monster outside an
  iframe). The webhook is the ONLY grant; claims close by ORDER id (`consumesByOrder`);
  IAP_LEDGER stops double grants; the restore pass must never live behind the SDK gate.
  Checkout opens in a new tab and the paying tab never grants. `?dev=1` emulates purchases only
  where no payment provider exists.
- **AUTH (84-auth):** Google sign-in only on our own origin; One Tap after the intro; Logout
  survives the page (`mixer_auth_out`) and turns auto-select off.
- **SERVICE WORKER (src/sw.js):** never intercepts a Range request or media (allowlist + media
  test); the cache name is the build stamp; the document is cache-first (a release shows on the
  second launch — his price) and only the game's own path is answered; `update()` at boot + a
  silent recheck on return to the screen; `?nosw=1` unregisters; four registration gates
  (https, not webdriver, not in an iframe, not ?nosw).
- **BRIDGE:** never add `advertisement.interstitial.autoShow` or `loadingSound` to
  playgama-bridge-config.json. Platform id `mock` = our own pages → do NOT subscribe to the
  bridge's pause/audio (the blur-freeze cure, 2026-09-15); suite fakes must never use the id
  `mock`.
- **SAFARI 26 CHROME ZONES — final, measured on his iPhone:** WebKit fills each obscured zone
  with the `background-color` of the nearest fixed/sticky box at (w/2, 4) / (w/2, h−4), else
  body's colour; fixed boxes are clipped at the layout viewport, so content cannot pass under a
  bar while any fixed box covers the sample point. Shipped: `#edgeTop/#edgeBot` 12-px cards in
  the sky's edge colours (phone only, < 768), `html.dimmed` for the dark overlays, the list
  screens flow as the page on iPhone with only the TOPMOST screen flowing (`?flow=0` = kill
  switch). The top zone is a flat colour — a platform limit. **Do not start another edition
  without a reproduction on his device** (eight editions died on simulator facts).
- **INTRO:** phone width (≤ 767) → the poster alone; a portrait tablet → the portrait film over
  the poster; landscape ≥ 768 → the landscape film (video/ next to the build; off github.io and
  local hosts: video.blendo.monster first, github.io second). No comic. The game's music waits
  for the film, not for the poster. The loader ring shows from the first frame.
- **MATCAPS:** `itemMatcapAim` (10-stage) is the single selection rule (editor override → the
  type's own kind → pack override → pack image → shared preset).
- **PORTRAITS:** `frameCylinder` for the collection (static and spin identical — his «the size
  must not change on hover»); `frameSilhouette` only for the win rows.

## 8. Removed or rejected — do not bring back without his word

Stars rating; the coins economy (hidden flag); interstitial ads; the bonus level (kept in
bonus.html and branch claude/bonus-standalone — never delete those refs, nor
`assets/models-in-game`, `claude/bonus-level`, `claude/matcap-bench`); rocks; the steak; the
six sport types (only the dynamite bomb remains); the 32 cut types (geometry gone — a return
needs a new model); the prologue comic; the PNG burst and the Grain Ring shader on the New
Object screen; the hit-stop; screen drips; the «Dirty» realistic models; PBR/toon/outline
materials; transmission on glass; accessibility by camera rays; a forced sleep on the clock;
a trim on an unsettled pile; teleporting rescues to the top; the fire at the eyes; the red top
on the mixer's anger; leaderboard tabs; the anti-cheat score ceiling; the bowl tilt
(V2-IDEAS.md); the black outline on the menu's eyes; another «content under the bar» edition.

## 9. Where a subsystem's history lives

`grep -n -i '<keyword>' docs/CANON-HISTORY.md` (the archive keeps its old line numbers):

| subsystem | keywords |
|---|---|
| physics, walls, sleep, rescuers | `RESCUER`, `wallExcess`, `FLOOR_PEN`, `substep`, `sleepPhysics` |
| accessibility, sweeps | `ACCESSIBILITY`, `accSweepBurst`, `SETTLEFAN`, `EVENTFAN`, `ring samples` |
| scoring, balance | `SCOREMATH`, `MISS_PENALTY`, `MERGE_CURVE`, `ACC_MULT_STEP`, `BOWL140`, `UNIFIED BALANCE` |
| pool, models, progression | `STATE OF THE OBJECTS`, `TYPES`, `glb2module`, `PROGRESSION`, `MODEL-BUDGET` |
| specials | `RIVAL`, `FROZEN`, `BOMB`, `TYPE CHARGE`, `FIRE`, `RETURN-SECTION` |
| Safari zones, flow mode | `SAFARI 26`, `fixedContainerEdges`, `edge card`, `flowscroll`, `FLOW-SECTION` |
| intro, poster, film | `INTRO`, `poster`, `introVideo`, `VIDEO_GRACE` |
| payments, Stripe, auth | `PAYWEB`, `payApi`, `webhook`, `GOOGLE SIGN-IN`, `AUTH-SECTION` |
| leaderboard | `LEADERBOARD`, `ladder2`, `lbHostIsLocal`, `exact` |
| service worker, PWA, site | `SERVICE WORKER`, `PWA`, `site worker`, `Last-Modified`, `DEPLOY` |
| HUD, menu, win screen | `HUD`, `WIN SCREEN`, `msLbEntry`, `MENU`, `SHAKE = A HAND` |
| sound | `VOICE_TRIM`, `sfx-pack`, `MATERIAL_OF`, `music bus` |
| matcaps, visuals | `MATCAP`, `itemMatcapAim`, `impactFX`, `HITFX` |
| bridge, portal | `BRIDGE`, `curtain`, `GAME_READY`, `PLATPAUSE` |
| perf, frame cap | `FPSCAP`, `capDecide`, `PERF`, `ruler` |
| measurement lessons | `FALSE METRIC`, `sabotage`, `flake`, `tautolog` |
| recording bot | `play-record`, `RECORDING BOT` |

Also: WORKSTREAMS.md (per-direction history: grep GRAPHICS / PHYSICS / INTERFACE / INTEGRATION /
NARRATIVE / META), STATUS.md (owner-facing status), V2-IDEAS.md (the post-release list), docs/
(ADS-TRACK, STRIPE-PORTUGAL, GOOGLE-AUTH, SITE-MOVE, LEADERBOARD-OWN, SOUND-INVENTORY,
MODEL-BUDGET…). The open forks waiting for his word are named in the LAST records of
docs/CANON-HISTORY.md (among them: the level pacing he is still thinking about, the ads track,
CCD substeps 4 → 1 after a soak, the fire picker's fan, the two-tab save race).
