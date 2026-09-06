# BLENDO — current state

A short page to read from your phone. Updated at big milestones.
⚠️ PROJECT MEMORY (survives any chat): [CLAUDE.md](CLAUDE.md) — all
decisions, bans and traps with their reasons; [WORKSTREAMS.md](WORKSTREAMS.md) —
a log of EVERY release with your specs verbatim; docs/ — plans.
A new session is required to read the canon first — that rule is in its header.

**Build: v2 = 68f95d6 (2026-09-06)** · the suite **987 green, 0 red, SUITE: PASS**
match · the live site verified by byte size against the build · portal package **5.48 MB** of the
8 MB reference (headroom 2.52)

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

## Decisions only you can take

- **The boost after a reload**: measured — it survives (25 min / 83% before and after the reload,
  the numbers are in `localStorage` under the player's own guest id). What you saw was the live
  build without the badge's active look; this deploy fixes that. Where a paid boost lives:
  the device's storage, the portal's cloud save (Playgama keeps it under the guest id), the
  wrapper's StoreKit restore. The one hole is the plain web after Safari clears storage — say if
  you want our own server ledger keyed by the guest id (the leaderboard service already has it).

- Telemetry is OFF (`URL = ''`); switching it on is one line, and needs a privacy policy with it.
- `bonus.html` — the one Cyrillic file left: translate its branch, or drop it.
- `mat_cream` is first audible at level 87 — the order of TYPES is your lever.
- Story after level 37, dailies, localisation — planned AFTER the release.
