# Screen map of «Mixer» — what exists, what is missing (2026-07-20)

INTERFACE workstream. Basis: `docs/DESIGN-ROADMAP.md` (meta v1/v1.1/v1.2),
the current `src/shell.html`. A clickable mockup of all screens — `src/ui-proto.html`
(opens on a double click, standalone, imports nothing).

## 1. What the game already has

| # | Screen | Where | State |
|---|-------|-----|-----------|
| 1 | In-game HUD | `#topBar`, `#eyes`, `#chainBar`, `#bottomBar` | live |
| 2 | ⚙️ Debug panel | `#debugPanel` | **was repaired 2026-07-20** — in the v1 branch the base CSS selector went missing, the panel did not open at all |
| 3 | Shake request (rewarded/coins) | `#adAskOverlay` | live |
| 4 | Ad stub | `#adOverlay` | live (stub 3 s) |
| 5 | Defeat | `#loseOverlay` | live |
| 6 | Victory (stars, coins, ×2) | `#winOverlay` | live |
| 7 | «No WebGL» fallback | `#fatal` | live |

Bottom line: the game can do **a round and its outcomes**. Everything around the round is missing.

## 2. What is missing

Priority: **P0** — without it the player's path breaks already now; **P1** — per the
v1.1 roadmap (museum/daily/shop); **P2** — later.

| # | Screen | P | Why | Cost |
|---|-------|---|-------|------|
| 8 | **Loading** | P0 | right now the first seconds are an empty white screen: 2.9 MB + WASM + intro. The roadmap keeps «time to first tap < 20 s» as a trump card — it has to be SHOWN, otherwise the player reads the pause as «it broke» | low |
| 9 | **Pause** | P0 | there is no way out of a round at all; the mixer timer keeps ticking, you cannot step away | low |
| 10 | **Settings** | P0 | right now the player's settings (sound, difficulty) are mixed with debug ones (radius, «pairs available») in a single ⚙️ panel. It must not be shown to a non-developer tester | low |
| 11 | **Tutorial (3 steps)** | P0 | the player is thrown into a full bowl without a single word: tap on a group, the mixer's anger, the shake. Per the roadmap — with pictograms, without translatable text | medium |
| 12 | **Main screen (hub)** | P1 | the entry point into the museum/daily/shop; right now there is nowhere to enter. ⚠️ see the open question in §4 | medium |
| 13 | **Showcase after a win** | P1 | the roadmap, «designed incompleteness»: a shelf ≤5 s between levels — the main D1 lever | medium |
| 14 | **Museum** | P1 | a collection of sets and artifacts, halls as sections | high |
| 15 | **Shop** | P1 | right now the assortment lives in the shake overlay; for 3 items (shake/aim/magnet) that is too little, plus the roadmap requires a visible goal «35 coins to the Magnet» | medium |
| 16 | **Daily Challenge + streak** | P1 | the roadmap: the main return mechanism without a backend | medium |
| 17 | **Level goal (pre-level)** | P2 | telegraphs the hall and the 2★/3★ conditions; skipped with a tap | low |
| 18 | **Days in the game / return bonus** | P2 | a popup on entry, roadmap v1.1 P1 | low |
| 19 | **Leaderboards** | P2 | only where the platform gives it, behind a flag | low |

### Found along the way: the top bar does not hold «rich» values

Headless measurement (eyes 71px, level 12 values: `Lv.12 · 141`, `12:45`,
`🪙 1240`, `★ 12480`):

| width | eye overlap on the left | on the right | what is lost |
|--------|--------------------|--------|--------------|
| 320 px | 29 px | 42 px | the timer and coins are hidden, the left/right chips have closed together |
| 360 px | 32 px | 39 px | same; «Lv.12 · 141» wraps onto 2 lines |
| 390 px | 31 px | 40 px | same |

That is, by level 10 with a couple hundred coins the player stops seeing the
round timer and the coin counter. Right now it goes unnoticed only because on level 1
the values are short. The HUD geometry is the owner's spec (eyes ×3, then −30%),
therefore I **did not touch it**; options to choose from:

1. eyes 56–60 px (minus ~20%) — the cheapest of all, the character stays large;
2. merge coins and ★ into one chip (`🪙 1240 · ★ 12k`) — frees up ~90 px;
3. move the eyes below the chips (top +46) — the HUD is intact, but the character climbs into the bowl;
4. shorten the numbers (`12.5k`) — the smallest gain, but also the cheapest.

A separate **level map is not planned**: the progression is linear, the role of the map is played by
the museum halls (roadmap §2) — otherwise we get a screen there is nothing to fill.

## 3. Order of work

1. **Batch A (P0, before handing out to testers):** loading → pause → settings (split
   the ⚙️: the player separately, debug behind a flag) → tutorial.
2. **Batch B (P1, v1.1):** hub → showcase → shop → museum → daily.
3. **Batch C (P2):** pre-level, visits, leaderboards.

Localization: overlay headings, toasts and the ⚙️ panel are still Russian while the buttons
are English. A full EN pass is cheaper to do ONCE — after the set of
screens is approved, otherwise we translate twice.

## 4. Open question for the owner (the decision affects the whole of batch B)

**Where does the player land on launch — straight into a level or on the main screen?**

- «Straight into a level» (as it is now) — the portals' trump card: time to first tap
  is minimal, but the hub has nowhere to live, and there is no getting into the museum/shop.
- «Main screen» — the meta is visible, but every launch += one tap before the game.
- The compromise that is built into the mockup: **the first launch — straight into a level**
  (time to first tap does not grow), and the hub opens via the «home» button — from
  the pause and from the showcase. Between levels we do NOT show the hub automatically: the roadmap
  requires «win → showcase ≤5 s → one tap on „Next“ → next level».
  The menu is found by whoever looks for it, the session's tempo is not broken.

## 5. Mockup verification

`src/ui-proto.html` — 15 frames of 390×844, modes «path» (one at a time) and «grid»
(all at once, for unfolding in Figma). The style is taken from the live `shell.html`:
cards `#1d2432`, chips `rgba(20,26,38,.75)`, flat buttons `#3e63dd` /
`#2aa876` / `#8e4ec6`, gold `#ffc84a`, radii 12–20 px, white field.
Every frame is marked: «in the game» / «new P0» / «new P1» / «new P2».
