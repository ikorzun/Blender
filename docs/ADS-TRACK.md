# Blendo — the Ads Track: rewarded ads when the shakes and the tips run out

Research of 2026-09-13, branch v2. Read-only: no file was edited, built or committed. This is the separate track the owner asked for (item 7: check that the bridge is current and write the track for implementing ads when the stock runs out).

## 0. The short answer

1. **The bridge is current.** The vendored `playgama-bridge.js` is 2.1.0 = the newest tag, the npm `@playgama/bridge` latest and the version the CDN `stable` channel reports. Nothing to update.
2. **The mechanic is already in the game and matches his rule.** Exactly two rewarded offers exist — a Shake and a Tip — and only when the stock is empty (the «Ad» badge, a tap = a video for +1). There is no interstitial and no other placement (his 2026-09-03-c decision), and the no-ads plumbing is dormant.
3. **Two defects were found while reading:**
   - the game never tells the SDK which placement is playing — both offers go out as the fallback `rewarded`, the configured `shake` placement is dead and there is no `hint` placement at all;
   - wherever there is no ad provider — **blendo.monster, GitHub Pages and the iOS wrapper** — the «Ad» badge is not an ad at all: a tap shows «Ad unavailable» and then gives the resource for free (the no-fill rule of 2026-08-05). Shakes are unlimited (`AD_SHAKES_PER_LEVEL = Infinity`), and so are Tips, because the no-fill branch does not spend the per-level cap. On the portal the same button plays a real video.
4. **The track has four stages:**
   - **Stage 0** — make the badge honest (repo only, no accounts);
   - **Stage 1** — make the portal ads correct and ready for moderation;
   - **Stage 2** — real rewarded ads on the own domain through Google H5 Games Ads or an alternative (accounts, approval, consent banner, privacy rewrite);
   - **Stage 3** — native AdMob in the iOS wrapper (already deferred to pre-release by his word).
   Each stage stands alone; none is required by the next except that Stage 2 and 3 reuse Stage 0's availability seam.
5. **One conflict he must decide:** Playgama's wiki labels interstitials «required» for revenue share and warns that games without them «can be rejected during moderation»; his rule is «ads only when the stock is empty, nowhere else». Named here, not decided.

## 1. Bridge currency (verified against primary sources)

| Item | Value |
|---|---|
| Vendored file | `playgama-bridge.js` 2.1.0, 285 273 B, md5 34aff111…, a monolithic bundle (root and `site/`) |
| GitHub | tag v2.1.0 (2026-08-21) is the newest; no changelog entry after it |
| npm | the package was renamed `playgama-bridge-sdk` → `@playgama/bridge`; latest = 2.1.0 |
| CDN `bridge.playgama.com/v2/stable/playgama-bridge.js` | reports 2.1.0 but is a different BUILD: 111 759 B, md5 243ca4c2…, code-split, fetching chunks from the CDN at runtime and referencing adsbygoogle.js |
| Config `playgama-bridge-config.json` | `advertisement.rewarded { placementFallback:'rewarded', placements:[{id:'shake'}] }`; payments `bundle5` (20 GAM), `noads_forever` (49); saas publicToken `cms68frqf0008ri0h81k1dujg`; leaderboard `Blendo` |

**Do not swap the vendored file for the CDN file.** The CDN build loads chunks at runtime, which breaks the hand-assembled portal package, the offline single-file promise and verification by byte size. The canon keeps the vendored copy on purpose: «stable» moves without a commit.

**Ads API changes since 2.0.x that matter to us: none breaking.**
- `advertisement.showRewarded(placement)`, `REWARDED_STATE_CHANGED` (loading / opened / rewarded / closed / failed), `isRewardedSupported`, `rewardedPlacement` and the interstitial API are unchanged. The 13-module method census of 2026-09-03 was identical member for member; only a `notifications` module was added.
- The playgama adapter's `showRewarded` calls `platformSdk.rewardedBreak(...)` and maps placements through `placementFallback` + `placements`.

**Changes in 2.1.0 that touch us indirectly:**
- The playgama adapter now **forwards every platform message except GAME_READY** to the portal's `gameService.sendMessage`. So our `LEVEL_STARTED` / `LEVEL_PAUSED` / `LEVEL_RESUMED` / `LEVEL_COMPLETED` now reach the portal. Watch in QA whether the portal answers `level_completed` with an interstitial of its own — the SDK side (`autoShow`) is off, the portal side is not ours to read.
- The loader's `showFullLoadingLogo` default flipped (cosmetic).
- `PLATFORM_ID.PLAYDECK` was removed (unused).

**Two landmine config keys — they must never appear without the dispatcher's word:**
- `advertisement.interstitial.autoShow` — an array of platform-message names; if present the SDK shows interstitials by itself and bypasses our rules;
- `loadingSound` — plays a sound over the start and holds the curtain up to 3 s.

**How the bridge ships:**
- `build.py` does NOT inline it (LGPL, and it loads only over http/https).
- `tools/site-pack.py` `FILES` copies both bridge files into `site/` for blendo.monster.
- The Playgama portal package is assembled BY HAND: `index.html` + the two bridge files + `music.mp3`. The canon's risk row: the config gets forgotten, and then placements fall back to `rewarded` silently.
- The Playgama cabinet app (`cms68frqf0008ri0h81k1dujg`) is still a DRAFT with no archive, no media, no cover, and a stale description (3 stars, grey rocks, an iridescent bomb — all removed from the game).

## 2. How ads work today

### 2.1 The code path

**`src/app/78-ads.js` (the `Ads` adapter):**
- `mode` starts as `'stub'`.
- `init()` restores native purchases and boots web payments BEFORE the SDK gate (the 2026-08-28 lesson: a boot pass must not live behind the SDK gate).
- It returns early on any protocol other than http/https (line 291). This covers `file://` and the wrapper's `blendo://game`.
- Otherwise it loads the neighbouring bridge and calls `bridge.initialize()`. It syncs the save, restores purchases, subscribes to audio/pause and reads the language.
- Only if `advertisement.isRewardedSupported` is true (line 371) does it subscribe to `REWARDED_STATE_CHANGED` and set `mode = 'bridge'`.
- An `INTERSTITIAL_STATE_CHANGED` listener stays as a safety net (pause + mute) for a spot the PLATFORM opens by itself.

**`Ads.showRewarded(onReward, onFail, placement)` (lines ~1010-1039):**
- **bridge mode:** a 20 s watchdog, then `bridge.advertisement.showRewarded(placement || 'rewarded')`. `opened` → the pause (`pausedByAd`, `pauseGame(true)`) and the mute sum. `rewarded` → `settleReward()`. Closed before the reward → `settleFail(true)` = reason `closed`, no reward. `failed` or a watchdog → `settleFail(false)` = the toast «Ad unavailable» + reason `unavailable`.
- **stub mode + `DEV`** (`file:`, localhost, 127.0.0.1, empty host, `?dev=1`, `mixer_dev`): the `#adOverlay` 3-second fake video, then the reward.
- **stub mode, not DEV:** `settleFail(false)` at once.

**The callers (`src/app/80-gameplay.js`):**
- `requestShake` (~1423): free shakes → purchased shakes → `level.adShakes > 0` → `startAd()`; else the toast «No shakes left» (unreachable, since the cap is Infinity).
  - `startAd()` (1460-1482) calls `Ads.showRewarded(reward, fail)` **with no placement**.
  - Reward: `adShakes--`, telemetry `rw`, `performShake`.
  - Fail `unavailable`: the toast «Free shake» + `performShake` (the 2026-08-05 no-fill rule).
  - Fail `closed`: nothing.
- `requestAdHint` (1264-1287), gated by `adHintAvailable()` (1258: no charges, `level.adHints > 0`, `AD_HINTS_PER_LEVEL = 2`), also calls `Ads.showRewarded` **with no placement**.
  - Reward: +1 hint, the cap decremented, `showHint()`.
  - Fail `unavailable`: +1 hint, **the cap NOT decremented**, `showHint()`.
- `genLevel` calls `Ads.cancel()` (40-items:905), so a video bound to the old level cannot reward the new one.

**The HUD (`85-hud.js`):**
- The Shake badge reads «Ad» when `level.adShakes > 0` (1940).
- The hint badge reads «Ad» when `adHintAvailable()` (1961-1962).
- Neither asks whether an ad provider exists.

**Other:**
- Telemetry is OFF (`79-telemetry.js`, `URL = ''`), so `rw` / `rw_nofill` events go nowhere. There is no data on fill rates.

### 2.2 What each environment actually does

| Where | `Ads.mode` | A tap on «Ad» (Shake / Tip) |
|---|---|---|
| Playgama portal, rewarded supported | `bridge` | a real video; reward on completion; a closed video = nothing; a failure = «Ad unavailable» + a free resource |
| Portal, before `initialize()` resolves, or a platform without rewarded | `stub` | a free resource with two toasts |
| blendo.monster, GitHub Pages (platform `mock`) | `stub`, not DEV | «Ad unavailable» + «Free shake» + a shake; or «Ad unavailable» + a free hint. **Unlimited both.** |
| iOS wrapper (`blendo://game`) | `stub` (protocol gate), host `game` is not DEV | same as the web: free and unlimited |
| `file://`, localhost, `?dev=1` | `stub`, DEV | the 3-second fake video (`#adOverlay`), then the reward |

### 2.3 Pause, mute, LEVEL_PAUSED
- The ad owns its pause through `pausedByAd` (the pattern the main-menu pause copied): it lifts only the pause it set, and the menu refuses to open over it.
- Mute is a sum of owners (`applyMute`), so a platform mute and an ad mute do not undo each other.
- `LEVEL_PAUSED` / `LEVEL_RESUMED` go out through `pauseGame` / `resumeGame` and, since 2.1.0, reach the portal.
- Any new provider must reuse `tryAdPause` / `adBlockOn` / `adBlockOff` / `beginPending` / `endPending`, not write its own.

### 2.4 The standing rules this track respects
- **Ads only when the shakes or the tips have run out, nowhere else** (2026-09-03-c). The interstitial show point, the Continue and the ×2 placements were removed.
- The owner is not chasing money (memory): the track proposes nothing beyond what he named.
- No fake stub in production (the 2026-07-29 cancellation recorded in `startAd`): DEV only.
- The no-fill rule (2026-08-05): if no video was matched, still give the resource; if the player closed it himself, give nothing.
- `privacy.html` promises «no advertising trackers, no analytics, and no cookies at all» and covers only blendo.monster.
- Pause ownership, the mute sum and the bridge landmine keys.
- The web payment gate `payHostOk` (own origin, not in an iframe, not the wrapper).
- The service worker never touches cross-origin requests or media.
- The run rule: section dry-runs + sabotages gate a push; the full suite only on his word.

## 3. The two defects, precisely

### 3.1 The placement is never sent
- `startAd()` and `requestAdHint()` pass two arguments, so every show is `showRewarded('rewarded')`.
- The config's `placements:[{id:'shake'}]` is dead and there is no `hint` entry, so portal statistics cannot tell the two offers apart.
- The existing guard (`test.js` ~4776-4782) calls `window.__ads.showRewarded(..., 'shake')` directly. It measures the API door, not the wiring, so it stays green on the broken build.

### 3.2 «Ad» where no ad can play
- On the three provider-less environments the badge promises a video, and the tap gives a free resource with a double toast («Ad unavailable» then «Free shake»).
- Because `AD_SHAKES_PER_LEVEL = Infinity` and the Tip's no-fill branch does not spend `level.adHints`, the web and the app give unlimited free shakes and tips.
- This is the canon's no-fill rule applied to a case it was not written for: a platform that has no ads at all, rather than a video that did not fill.
- A side effect: the deadlock detector treats `adShakes > 0` as a way out, so on the web a deadlocked pile is never ground — the player shakes for free instead.

## 4. The track

### Stage 0 — The honest «Ad» badge (repo only; no accounts; ~half a day)

**Goal.** The badge says «Ad» only where a video can actually play. What replaces it where none can is HIS choice (decision D2):
- **(a)** hide «Ad» — the button shows 0 and dims; the tip offers nothing; the deadlock rescue grinds as designed;
- **(b)** keep the free resource but drop the word «Ad» and the double toast (e.g. the badge reads «Free» or just the count);
- **(c)** leave it as it is until Stage 2.

**What we build:**
- One seam: `Ads.rewardedAvailable(placement)` = bridge mode with `isRewardedSupported` (Stage 1), OR an H5 offer is ready (Stage 2), OR the native wrapper reports support (Stage 3), OR the DEV stub. Everything else is false.
- The HUD's two badges, `adHintAvailable()`, the ad branch of `requestShake` and the deadlock detector's «ad shakes count as a way out» read that ONE function.
- `level.adShakes` is **not** mutated. Keeping `Infinity` keeps five existing guards green.
- `settleFail` gets the reason as its own parameter, so a provider-less refusal can be silent without being reported as «closed». The double toast goes away.

**How we test:** a new marked section (e.g. `ADS-HONEST`) on a foreign host name mapped to the loopback with `--host-resolver-rules` (the leaderboard gate's precedent), where DEV is false and the platform is `mock`.
- With the stock empty: the Shake badge is not «Ad».
- A tap does not play the stub and does not give a free shake (option a) or gives it silently (option b).
- On `file://` DEV the stub path is unchanged.
- Sabotage: `rewardedAvailable` hard-wired to true → the badge reads «Ad» again.

**Risk:** under option (a), a player on the web without shakes relies on the grinding rescue (it costs points). That is his design, but it is new on the web.

### Stage 1 — Playgama portal: correct placements, QA, and the moderation question (~1 day of code + his QA)

**Owner prerequisites:**
- Refresh the cabinet listing (description, how-to-play, cover, media) — it describes removed content.
- Decide D1 (interstitials).
- Upload an archive when ready. The cabinet shows the QA Tool; submission is his manual step.

**What we build:**
- `startAd()` → `Ads.showRewarded(..., 'shake')`; `requestAdHint()` → `..., 'hint'`.
- `playgama-bridge-config.json` placements `[{id:'shake'},{id:'hint'}]`, keeping `placementFallback:'rewarded'`.
- If he answers D1 with a portal-only interstitial: ONE show point gated on `platform.id === 'playgama'` (never the web, never the app), with `minimumDelayBetweenInterstitial` respected, through the existing safety-net listener. **Default: nothing is built.**
- A packing note in `docs/`: the portal package must carry the config (the placements live there).

**How we test:**
- **Suite:** rewrite the placement arm to drive `requestShake()` and `requestAdHint()` through the `MOCK_RW` stand with the stock empty, and read `rwPlace` `shake` / `hint`. Sabotage: drop the argument in one caller → `rwPlace` reads `rewarded`.
- **The Playgama QA Tool against the local build** (the cabinet tool `get_local_game_qa_tool_link` for `http://localhost:8779/index.html`; ask for the link each time, never build it by hand). It is the only place `initialize()` settles outside the portal and ad states can be driven. Check:
  - the rewarded states;
  - the pause + mute during the video;
  - the reward only on completion;
  - «closed» gives nothing;
  - `level_started` / `level_paused` / `level_resumed` / `level_completed` arrive;
  - the portal does not show an interstitial of its own after `level_completed`.
- The same checks against an uploaded archive (`get_archive_qa_tool_link`).

**Risks:**
- moderation or revenue-share consequences of no interstitials;
- the portal reacting to the now-forwarded `level_completed`;
- a hand-built package without the config.

### Stage 2 — Own domain (blendo.monster): real rewarded ads (~2-3 days of code after approval)

**Recommended provider: Google H5 Games Ads** (the Ad Placement API). Alternatives are noted at the end of the stage.

**Owner prerequisites (in this order):**
1. **Decide D3** — does he want ads on his own domain at all? The price is below.
2. **An AdSense account** for `blendo.monster` (site review), then **apply for H5 Games Ads** (by application; approval is not guaranteed; a one-page game site can be rejected as low content). Record the publisher id `ca-pub-…`.
3. **A consent banner (CMP)** — mandatory for players in the EEA/UK (since 16 Jan 2024) and Switzerland (since 31 Jul 2024), or Google stops serving ads there. It must be Google-certified TCF 2.2. The cheapest is **Google's own CMP** (AdSense → Privacy & messaging), which needs no third-party script. Decide D5 (personalised or non-personalised ads).
4. **`ads.txt`** on the domain with the publisher line (AdSense warns about earnings without it; confirm at sign-up).
5. **Rewrite `privacy.html` and add an ads clause to `terms.html` BEFORE the script ships.** Today privacy says no advertising, no analytics, no cookies, and that the children's section collects no personal data. The new text must name Google as an ad partner, cookies and identifiers, consent and withdrawal, and child-directed handling (decision D6).
6. Nothing at Cloudflare, unless Bot Fight Mode blocks Google's ads.txt crawler (check Security → Events).

**What we build:**
- **A gate, shared, not copied:** the ads provider exists only on our own origin, outside an iframe and outside the wrapper — the same three questions as `payHostOk()`. Extract a shared `ownSiteHost()` in 83-pay, used by both. The portal keeps the bridge, the app keeps the native side, GitHub Pages gets no ads.
- **Loading, dynamic only:** the Google script (and the CMP, if a third-party one) is injected by `Ads` at `init()` inside that gate, **never** as a tag in `shell.html` — so the portal package and the wrapper can never load Google.
  - Boot it BEFORE the protocol/SDK gate, next to `payWebBoot`.
  - The standard stub: `window.adsbygoogle = window.adsbygoogle || []; adBreak = adConfig = o => adsbygoogle.push(o);`
  - `adConfig({ preloadAdBreaks: 'on', sound: <the game's current sound state> })`.
  - `data-adbreak-test="on"` while testing (a constant or `?adtest=1` on a local host).
- **A third mode `h5` in `78-ads.js`:**
  - When the stock hits zero (the moment the badge would show «Ad»), call `adBreak({ type:'reward', name: placement, … })`.
  - `beforeReward(showAdFn)` → store `offer[placement] = showAdFn` and refresh the HUD. **Only now does `rewardedAvailable(placement)` become true, so the badge is honest by construction.**
  - `beforeAd` → `beginPending` + `tryAdPause` + `adBlockOn` (mute).
  - `afterAd` → `adBlockOff` + `endPending`.
  - `adViewed` → `settleReward`.
  - `adDismissed` → `settleFail(silent, 'closed')`.
  - `adBreakDone(info)` → clear the offer, log `info.breakStatus`, re-prepare the next break.
  - `showRewarded` in `h5` mode calls the stored `showAdFn()` **synchronously inside the tap** (it must run under the user gesture — no `await` between the tap and the call).
- **No-fill on the web:** with an honest badge there is no offer without a preloaded ad, so the 2026-08-05 grant only applies if `showAdFn` fails after the tap. Whether to keep granting then is his call (D2).
- **Packing:** add `ads.txt` to `tools/site-pack.py` `FILES` (the site worker serves it from the store as text/plain; verify with curl after `npm run site:deploy`).
- **Nothing else changes:**
  - the service worker already skips cross-origin requests (`sw.js:159`), so Google's requests and the ad iframe are untouched;
  - there is no CSP meta to update;
  - the Stripe path is independent.

**How we test:**
- **Suite, a marked section `ADS-H5`** on an http stand with a FAKE `window.adsbygoogle` whose `push` records the `adBreak` object and lets the arm invoke its callbacks:
  - no offer → no «Ad»;
  - `beforeReward` → «Ad»;
  - a tap calls `showAdFn` in the same task;
  - `beforeAd` pauses and mutes, and `afterAd` lifts only its own pause;
  - `adViewed` grants, `adDismissed` does not;
  - `adBreakDone` clears the offer and re-prepares;
  - the gate: no Google script tag in an iframe, in the wrapper, on github.io or on a foreign host;
  - with a third-party CMP, it is inserted before the ad script.
  - Each arm gets its own sabotage (Section 6 lists them).
- **Node-side arm:** `ads.txt` exists, carries the publisher id and is in the packer list; `privacy.html` names advertising while the provider constant is set.
- **Manual, before approval:** `data-adbreak-test="on"` on a local https stand (`wrangler dev --local-protocol https`) and on the deployed domain. Check the consent banner appears for an EU IP, test ads play and reward, and the music is muted and comes back.
- **His devices:** iPhone Safari and Chrome desktop (a real reward, pause/mute, no layout damage, the fields unchanged when no ad is showing).

**Alternatives if Google declines or he prefers:**
- AppLixir — rewarded video for web games, no AdSense;
- AdinPlay / Venatus — traffic minimums;
- GameDistribution / GamePix — portals with their own SDK, which move the game rather than add ads;
- Playwire — traffic minimums.
- Any of them plugs into the same `h5`-shaped seam: an offer-available callback, a show call inside the tap, viewed/dismissed callbacks.

**Price, named:**
- a third-party script and cookies on his page;
- a consent banner at first launch for EU players;
- the privacy promise changes;
- more weight and network on phones (the lag reports of September);
- ad blockers remove the offer (so the stock simply stays at zero — honest, not broken).

### Stage 3 — iOS wrapper: native rewarded ads (pre-release; blocked on his word; ~3-5 days Swift + review)

The canon already says: «ADS IN THE WRAPPER + noads_forever → pre-release». H5 Games Ads inside an app WebView is Android-only, so iOS needs the native Google Mobile Ads SDK.

**Owner prerequisites:**
- an AdMob account, the iOS app registered, one rewarded ad unit per placement (`shake`, `hint`);
- the UMP consent form configured in AdMob;
- the App Store privacy label updated;
- if personalised ads: the App Tracking Transparency prompt text and the SKAdNetwork identifiers;
- check the Kids category rules if the app is listed there;
- decide `noads_forever` (keep, sell as non-consumable, or delete) and D7.

**What we build:**
- **Swift side:** the GMA SDK, UMP consent at launch (before the game asks for an ad), ATT only if personalised. It injects `window.__nativeAds` at documentStart — the same way `__nativePayments` is injected, **never impersonating `window.bridge`** — with:
  - `isRewardedSupported()`;
  - `prepare(placement)` → a promise of availability;
  - `show(placement)` → a promise of `'rewarded' | 'dismissed' | 'unavailable'`;
  - native audio-session handling plus a JS callback so `Ads` can pause and mute.
- **JS side:** in `78-ads.js` a `nativeAds()` detector (the `nativePayments()` shape; `null` and `undefined` both mean «none»). The provider order becomes `nativeAds || bridge || h5 || DEV stub`, and `rewardedAvailable` reads it. `showRewarded` maps the three results onto `settleReward` / `settleFail(closed)` / `settleFail(unavailable)`.

**How we test:**
- **Suite:** a stubbed `window.__nativeAds` on a page (the native payments section is the pattern). Rewarded → grant; dismissed → nothing; unavailable → the D2 rule; it does not set or read `window.bridge`.
- **The iOS Simulator** with Google's test ad unit ids; then a TestFlight build on his phone.

**Risks:**
- App Store review (tracking disclosure, ATT wording, Kids rules);
- the GMA SDK's weight and startup cost;
- consent UX before the poster intro;
- until Stage 3 ships, the app gives free resources behind «Ad» unless Stage 0 is done.

## 5. Owner checklist, in plain language

| # | What | Needed for |
|---|---|---|
| 1 | Answer the decisions in section 8 | everything |
| 2 | Refresh the Playgama cabinet description, cover and media; upload an archive when ready | Stage 1 |
| 3 | Create an AdSense account for blendo.monster and apply for H5 Games Ads | Stage 2 |
| 4 | Set up the consent message in AdSense (Privacy & messaging) | Stage 2 |
| 5 | Approve the new privacy and terms wording before ads go live | Stage 2 |
| 6 | Create an AdMob account, the iOS app, two rewarded ad units and the consent form; update the App Store privacy label | Stage 3 |
| 7 | Run `npm run site:deploy` after each web release (the dispatcher now does this after a green run) | Stage 2 |

## 6. Testing toolkit

- **DEV stub:** `file://`, localhost or `?dev=1` shows `#adOverlay` for 3 s and then rewards. Keep it DEV-only.
- **`MOCK_RW` http stand in `test.js` (~4477-4531):** a fake bridge with rewarded/interstitial recorders and emitted states. It is the base for the Stage 1 wiring arm.
- **The Playgama QA Tool:** a local build and uploaded archives; ask the cabinet tools for the link each time.
- **The H5 test mode:** `data-adbreak-test="on"`; a fake `window.adsbygoogle` for the suite.
- **A foreign host via `--host-resolver-rules`,** to test gates where DEV is false.
- **`tools/section-dryrun.js` + `tools/build-variant.py`:** every new ads section is marked (`⟦ADS-…-SECTION⟧`), dry-run alone, and proven against sabotage variants built outside the tree. The full suite runs only on his word.
- **After a web deploy:** verify by bytes (the md5 of `/`, the Telegram card, a 206 on `music.mp3`) and curl `ads.txt`.
- **His devices are the final check** for pause/mute, consent and the Safari fields.

## 7. Risks

1. Playgama may reject the game or withhold revenue share without interstitials (their wiki: «Interstitial (required)»).
2. Since 2.1.0 the portal receives `level_completed`; it may react with its own ad — unverifiable until the QA Tool.
3. AdSense and H5 approval can fail or take weeks; a single-page game site is a known rejection reason.
4. **The consent banner and the Safari fields:** a fixed banner at the bottom edge becomes WebKit's colour candidate and repaints the address-bar zone while it is up (the measured mechanism of 2026-09-05-g). This is cosmetic, but it is exactly the area the owner is sensitive to.
5. The privacy promise («no cookies at all») becomes false the day the Google script loads; shipping the script before the text changes is a legal and trust risk.
6. Ad blockers remove the web offer; with an honest badge the stock just stays at zero, while with the old no-fill grant they would mean unlimited free resources.
7. The user-gesture requirement: calling `showAdFn` after any `await` is refused by the browser and the tap does nothing.
8. Audio: the ad must mute our music and SFX (`beforeAd`), and the music deferral around the intro must not start the track under an ad.
9. Pause ownership: an ad must not be unpaused by the menu, and a `visibilitychange` during an ad must not resume the game.
10. **Children:** if players include children, Google requires child-directed or under-age handling, and the privacy page's children section must change.
11. Telemetry is off, so fill rates, dismissals and rewards will not be visible without enabling it (another privacy change).
12. The iOS wrapper today turns «Ad» into free unlimited resources; shipping the app before Stage 0 or Stage 3 exposes it.
13. The portal package is assembled by hand; forgetting the config silently breaks the placement names again.
14. Performance: a third-party ad script on phones already reported as laggy in Low Power Mode.
15. A future «update» to the CDN bridge build would break the offline package (the chunks load at runtime).

## 8. Decisions for the owner (plain language)

- **D1 — Portal interstitials.** Playgama says every game must show between-level ads to earn a revenue share and may reject games without them. Your rule is «ads only when the stock is empty». Options:
  - keep your rule and accept the risk;
  - allow ONE between-level ad on Playgama only (never on your site or in the app).
- **D2 — What «Ad» does where no ad exists** (your site today, GitHub Pages, the iPhone app). Today it quietly gives the resource for free, without limit. Options:
  - (a) hide «Ad» there — no free resource, the rescue grinding helps when stuck;
  - (b) keep the free resource but stop calling it an ad;
  - (c) leave it until real ads exist.
  - The same question applies to what happens if an ad fails after the player tapped.
- **D3 — Ads on your own domain at all?** The price: a Google account and approval, a consent banner for European players, rewriting the privacy page (it currently promises no ads and no cookies), a third-party script. If you are not chasing money, «not yet» is a valid answer.
- **D4 — Which ad partner for the site:** Google H5 Games Ads (the most common; approval uncertain) or a smaller rewarded-video network.
- **D5 — Personalised or non-personalised ads.** Non-personalised is simpler (a lighter consent, no tracking prompt in the app) and pays less.
- **D6 — Children.** Is the game meant for children? If yes, ads must be child-safe and the privacy page must say so.
- **D7 — Ads in the iPhone app and `noads_forever`.** Confirm «pre-release», and whether the «no ads forever» product should be sold, kept dormant or deleted.
- **D8 — Should the ×5 Boost purchase switch off ads for its 30 minutes?** It used to; that was removed on 2026-09-03.
- **D9 — The Playgama listing** describes removed content (stars, grey rocks, an iridescent bomb). Refresh it before submitting?

## 9. Not in this track

- No interstitials, banners or new placements (his rule).
- No change to prices, the ×5 package or Stripe.
- No telemetry switch-on (a separate privacy decision).
- No Android wrapper (none exists).
