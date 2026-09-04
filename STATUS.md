# BLENDO — current state

A short page to read from your phone. Updated at big milestones.
⚠️ PROJECT MEMORY (survives any chat): [CLAUDE.md](CLAUDE.md) — all
decisions, bans and traps with their reasons; [WORKSTREAMS.md](WORKSTREAMS.md) —
a log of EVERY release with your specs verbatim; docs/ — plans.
A new session is required to read the canon first — that rule is in its header.

**Build: v2 = 3db715b (2026-09-03)** · the suite **950 checks, 0 red** · `main` and `v2` on GitHub
match · the live site verified byte-for-byte against the build · portal package **5.43 MB** of the
8 MB reference (headroom 2.57)

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
