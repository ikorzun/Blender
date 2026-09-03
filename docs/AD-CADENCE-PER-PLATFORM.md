# Ad cadence per platform — DRAFT OF THE MECHANISM

⛔⛔ **SUPERSEDED 2026-09-03 by the owner's word: «ads only when the shakes and the tips have run
out, nowhere else».** There is NO interstitial in the game any more (the show point, the cadence
counter and the config placement are gone — CLAUDE.md batch 2026-09-03-c); the only ads are the
two rewarded offers the player asks for himself. This document stays as the record of the
mechanism that was designed and never switched on.

⚠️ **STATUS: DRAFT. Does NOT change game behavior, does not touch code in `src/`,
`INTER_*` in 00-config are NOT touched.** Written in advance (the dispatcher's
permission 2026-07-23) so that by the time the owner says "do it" we discuss a
ready structure instead of starting from scratch. Zone: INTEGRATION AND PUBLISHING.

⚠️ **THE PLATFORMS' NUMBERS ARE DELIBERATELY ABSENT HERE.** Poki's and CrazyGames'
requirements are taken from their official documentation at the checklist stage
(item 4 of the INTEGRATION block) — such things must not be written from
memory, platform policies change, and a divergence = rejection at review. Below
the MECHANISM is designed; the numbers are plugged into it later.

## 1. Why

Right now the cadence is one for everybody, hardcoded in two constants
(`00-config.js:84-85`) and applied at a single point —
`maybeInterstitial` (`78-ads.js:99-110`):

```
INTER_MIN_WINS = 2;      // not earlier than the 2nd win of the session
INTER_GAP_MS   = 180000; // and not more often than once every 3 minutes
```

Verdict of the v1 plan audit: platforms have different requirements for
interstitial ads; one cadence for everybody will either break the rules of a
strict platform or under-earn on a liberal one. Move it into a per-platform config.

## 2. What has already been verified (facts, not assumptions)

- **Both target platforms are supported by our SDK.** The vendored
  `playgama-bridge.js` (v2.0.0) has `PLATFORM_ID.POKI = "poki"` and
  `PLATFORM_ID.CRAZY_GAMES = "crazy_games"` — next to `PLAYGAMA`,
  `YANDEX`, `GAME_DISTRIBUTION`, `MOCK`. So branching on
  `bridge.platform.id` is the right mechanism, separate per-platform
  builds are not needed.
- **The identifier is available at runtime:** `bridge.platform.id` (in the SDK
  it is a getter over `platformId`). Measurement on live Pages: returns `mock`.
- **There is exactly one gate** — `maybeInterstitial`; all interstitial shows
  go through it. There will be no need to spread the logic across call sites.
- **In stub mode the interstitial is not shown at all** (an existing
  invariant: "we don't annoy in the stub") — this behavior is preserved, and it
  also protects file:// and local runs.

## 2-bis. ⚠️ THE DRAFT'S PREMISE REQUIRES A REVERSAL (cross-check with sources 2026-07-23)

The audit's verdict read as "platforms have a stricter cadence, move it into a
config". The cross-check with the official documentation showed **the opposite:
Poki and CrazyGames manage the frequency THEMSELVES, and expect signals about
opportunities from the game**.

- Poki, the requirements section: "Do not implement internal ad timers" — in
  plain text they ask NOT to keep our own timer and to rely on their system.
- CrazyGames: the SDK regulates the interstitial frequency itself, including
  the interaction with rewarded (their own cap is documented on the
  requirements page — we take the numbers from there, not from here).

Our `INTER_MIN_WINS`/`INTER_GAP_MS` are exactly an "internal ad timer".
So on these platforms the correct setting is not "make it stricter" but
**turn off our throttle and call for a show at every natural break**; the
platform will decide itself whether to show. Otherwise we cut the shows
(and the revenue) with our own hand while formally breaking nothing.

Practical conclusion for §3: the `enabled` knob turns from "the platform
forbids ads" into **"who owns the pacing — we or the platform"**, and that is
its main purpose. The table structure remains fit; what changes is the meaning
of the default values for poki/crazy_games.

## 3. Proposed structure (NOT applied)

A table in `00-config.js` (by the zone rule INTEGRATION may ADD its own
constants; the existing `INTER_*` remain as the default values —
accepting the draft does not change behavior on any single
platform until the table is filled in):

```js
// Interstitial ad cadence per platform. The key is bridge.platform.id.
// default must match the current behavior: an unknown platform
// gets the same as everybody gets today.
const AD_CADENCE = {
  default:       { enabled: true, minWins: INTER_MIN_WINS, gapMs: INTER_GAP_MS },
  poki:          { /* from Poki's official requirements */ },
  crazy_games:   { /* from CrazyGames' official requirements */ },
};
```

Resolution is a pure function next to the gate (`78-ads.js`):

```js
function cadence(){
  const id = (window.bridge && window.bridge.platform && window.bridge.platform.id) || '';
  return Object.assign({}, AD_CADENCE.default, AD_CADENCE[id] || {});
}
```

`maybeInterstitial` changes by three lines: `enabled`, `minWins`, `gapMs`
are taken from `cadence()` instead of the constants directly. The merge on top
of `default` means that a platform only needs to override ONE knob.

**There are exactly three knobs, and not one beyond that.** `enabled` is needed
because a platform may forbid the interstitial entirely or require its own
API wrapper; `minWins` and `gapMs` already exist. Candidates like "a pause
after the first launch", "a cap of shows per session", "do not show in the first
N minutes" must NOT be introduced speculatively — only if a concrete requirement
of a concrete platform demands it, and then one knob at a time.

## 4. How to verify this

Extend the bridge section of the suite — the test bench is ready and works: a
local http server + a FAKE `playgama-bridge.js` (appeared 2026-07-23 for the
sake of the cloud-save fix). It is enough to parameterize the mock by
`platform.id` and to assert that `cadence()` returned the expected values for
`poki`, `crazy_games` and an unknown platform (the latter must yield `default`).

⚠️ The assert "an unknown platform = today's behavior" is mandatory: it guards
against a silent change of the cadence where we did not intend to change it.

**Telemetry:** the `inter` event (79-telemetry) must carry `platform` and the
resolved cadence — otherwise there is nothing to confirm compliance with the
platform's rules after the fact, and in case of a review complaint that is the
first thing they will ask about.

## 5. Open questions (into item 4, before the table is filled in)

1. Poki's and CrazyGames' requirements for the interstitial: the minimum
   interval, the permissible moments of a show, mandatory pre-rolls /
   "commercial break". Our show goes on the "Next"/"Retry" buttons — that is a
   natural break, but the platforms' wording must be cross-checked verbatim.
2. Whether they require THEIR OWN call instead of the generic
   `showInterstitial()` — Bridge abstracts it away, but if a platform expects an
   explicit "loading has started / the game has resumed" signal, that may be a
   separate integration item, not covered by the cadence.
3. Rewarded cadence: right now the caps are our own (3 free shakes
   + 2 for ads). Whether the platforms have limits on the rewarded frequency —
   to be checked; into this same table if needed.
4. Who is the source of truth for the numbers — the platform's documentation
   or the answer from their review. Record divergences right here.

## 6. Sources (verified by opening the pages 2026-07-23)

A "where to look" list, not an extract of the requirements — the numbers and
the exact wording are taken from here at the checklist stage (item 4 of the
INTEGRATION block). The links were verified live; the platforms' doc structure
changes, in case of a divergence trust the page, not this file.

**Poki**
- `https://sdk.poki.com/new-requirements` — the requirements for the game, the
  ad integration section: frequency (their system), the game's behavior during
  the spot (sound, input), the rewarded rules, the policy under an ad blocker.
- `https://sdk.poki.com/html5` — HTML5 game integration: the signatures of
  `commercialBreak()` / `rewardedBreak()`, the order of the calls.

**CrazyGames**
- `https://docs.crazygames.com/requirements/ads/` — the ad requirements:
  when a midgame is permissible, the mandatory alternative for rewarded,
  the behavior during the spot. ⚠️ Their warning verbatim: the game is
  rejected without explanation if the requirements are not met.
- `https://docs.crazygames.com/sdk/video-ads/` — the video ads API:
  the midgame/rewarded types, the `adFinished` / `adError` events.
- `https://docs.crazygames.com/resources/ad-monetization-guide/` —
  placement recommendations (not requirements, but useful for the show sites).

**Our layer**
- `github.com/playgama/bridge` — what Bridge covers these platforms with
  (`PLATFORM_ID.POKI`, `CRAZY_GAMES` are present in the vendored v2.0.0).
  ⚠️ OPEN: whether Bridge covers the platforms' requirements FULLY (sound
  muting, pause, input blocking) or whether that stays on the game — to be
  checked by reading its adapters, not by assumption.

## 7. ⚠️ COMPLIANCE RISKS ALREADY VISIBLE NOW

Found while cross-checking the sources against our code. This is NOT a checklist
(that one is in item 4) and NOT tasks — this is what must not be left unwritten,
because two items lead to rejection at review, and one runs into a decision by
the owner.

| The platforms' requirement | What we have now | Status |
|---|---|---|
| Mute the game's sound for the duration of the spot (both platforms) | We do NOT mute: there is no mute in `78-ads.js`, in `75-audio.js` there is only the global toggle `CFG.sound` | open |
| Pausing the game and blocking input for the duration of the spot (both) | Input is silenced only while OUR stub overlay is visible (`90-input.js:233`), and in bridge mode `showRewarded` does not show it — during a real spot the canvas is alive; the game is not paused, only `stats.lastAction` is ticked so that the mixer does not eat items | open |
| An ALTERNATIVE is mandatory for rewarded (CrazyGames — in plain text; Poki — an "ordinary" button next to the ad one) | The alternative exists in the code (a shake for coins), but `COINS_ENABLED=false` (00-config:78) — right now the rewarded shake has NO alternative | ⚠️ runs into a decision by the owner (coins are hidden by his spec) |
| Do not grant the reward under an ad blocker | The `settleFail` paths exist; there is no separate ad-blocker detection — we rely on the platform's state | to be checked on the smoke test |
| Our own message when a show fails | `toast('Ad unavailable')` (78-ads.js:38) | to be checked: at Poki the communication about the ad blocker is handled by the platform |

Not a single row from here is to be fixed before the owner's word: the edits
touch sound, input and the economy — other people's zones and his decisions.

## 8. What this draft does NOT do

It does not change `INTER_*`, does not add code to `src/`, does not touch the
balance or the game rules. Acceptance = a separate task with a suite run and a
handover by protocol; until the owner's word — only this document.
