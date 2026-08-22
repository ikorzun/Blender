# Technology reassessment: three.js r149 + Rapier + a single HTML file (July 2026)

## Verdict: KEEP the stack, with planned changes (keep-with-changes)

In short: a game can be built on this technology — it is already built and it works (a fresh build with all the fixes passes the full test suite: «ERRORS: none» — 141 bodies, win/loss/deadlock, the mixer punishment, the finale, the ad stub). The stack is exactly the class of technology that the portals themselves recommend for casual games. There is nothing to migrate to right now and no reason to. But there is one deliberate debt (three.js r149) with a clear plan to pay it off AFTER release.

The main number that decides everything: **the whole game weighs ~1.0 MB over the network** (index.html 2.96 MB → 1.02 MB gzip + playgama-bridge.js 274 KB). Poki's limit is 8 MB (they recommend <5), CrazyGames — 50 MB (20 for the mobile front page), Telegram kills a mini app if it loads for longer than 10 seconds. We pass all three with a several-fold margin. This is a competitive advantage of the channel, not a technical accident.

## 1. three.js r149 UMD — the only real debt

Facts as of July 2026: the current release is **r185** (1 July 2026), r149 came out in January 2023 — we are 36 releases behind. The UMD build (our format, «one file without modules») was declared deprecated in r150 and **removed in r160** — that is, the road forward goes only through ES modules + a bundler, exactly as written down in CLAUDE.md.

What this threatens:
- **Security — practically nothing.** The known three.js CVEs (CVE-2020-28496, CVE-2022-0177) concern the parsing of untrusted input (colors/loaders) and were closed BEFORE r149. Our game does not load external content at all (everything is inline, there are no model loaders at runtime) — there is no attack surface.
- **Browser compatibility — the risk is low, but non-zero.** WebGL2 is not going anywhere, r149 works in all current browsers. The risk is elsewhere: if a future browser release breaks something (this has happened with WebGL contexts on iOS), the fix will only come out in fresh three.js versions — nobody will backport it to r149.
- **The ecosystem is driving away.** New examples, plugins, features (the WebGPU renderer, RenderPipeline instead of EffectComposer, TSL shaders) — all of it only for fresh module-based versions.

Do we need to upgrade BEFORE release: **no**. The upgrade gives the player nothing, but it does give risks: in r152+ the color management changed (outputEncoding→outputColorSpace, sRGBEncoding→SRGBColorSpace, useLegacyLights) — that will certainly shift the picture you approved (the softbox, the caramel palette, the «super-white» sky, the whole history of the v4 materials). Every pixel would have to be re-accepted. Doing this inside the release window is shooting yourself in the foot.

The cost of the upgrade after release: moderate, **1–2 sessions**. esbuild is already installed in the project (the Rapier bundle is built with it), build.py already knows how to inline bundles — only the way three is built changes, plus pinpoint API edits, plus a mandatory visual A/B with screenshots from three angles and your acceptance.

## 2. Rapier — mature and very much alive, we got lucky

- The core **v0.34.0 came out on 4 July 2026**; on 12 July rapier.js was merged into the main monorepo — the JS wrapper is now a first-class citizen of the project.
- Dimforge devoted the whole of 2025 **specifically to performance in the browser/WASM** (a new BVH with rebalancing, SIMD traversals, fewer JS allocations) — that is, the engine's direction of development coincides with our usage scenario. The 2026 plans: robotics and GPU physics (Nexus) — we don't need them, but they show that the project is alive and funded.
- Our npm version **0.19.3 is the latest published one** (November 2025), vendored into src/vendor/rapier.js — the build is reproducible and depends on nobody.
- The known weaknesses (CCD is not all-powerful on small shapes, issues #286/#302; auto-sleep is slow on round bodies) — all of them are already closed by our anti-tunnel complex and the global sleep scheme; the test suite confirms it. The monorepo's new feature — automatic decomposition of concave shapes (convex decomposition, PR #361) — may in the future replace our hand-made capsule chains for the torus/knot, but there is no need to touch it without a reason.
- Safety margin: 141 bodies — ~1 ms per step (6% of the frame budget). The engine holds thousands.

## 3. Portability of the «one HTML + Playgama Bridge» architecture

The good news: the Bridge you chose IS the portability layer. **Playgama Bridge v2.0.0 (10 July 2026, commits — yesterday) officially supports 28 platforms**, including poki, crazy_games, telegram, playdeck, vk, yandex, discord, tiktok, youtube, msn, samsung, facebook. One adapter (78-ads is already written, with a fallback) — the whole channel.

- **Portals (Playgama/Poki/CrazyGames):** the «index.html + bridge.js + config» package — a standard zip upload. On size we pass everything with room to spare (see above). The only unverified thing is the live QA checklist of each platform (Poki wants its own loading/gameplay events, CrazyGames — its own SDK for ads; the Bridge abstracts this away, but a smoke test on each platform is mandatory).
- **Telegram Mini Apps:** the «single file» architecture HELPS here — all that is needed is static HTTPS hosting with compression. WebGL2 and WASM work in the Telegram WebView, there is a fullscreen mode for games. The «10 seconds to load» limit is not a problem with our ~1 MB. file:// does not work there — but that is a deploy edit, not a code one.
- **Stores via Capacitor (not Cordova — it is dying):** the same bundle goes into www/, WebGL works in WKWebView (the precedent is Vampire Survivors). What really has to change: a third ad mode in 78-ads (the Capacitor AdMob plugin instead of the Bridge), icons/splash/privacy, a test on a mid-range live Android. Note: since May 2026 Google Play requires a closed test from new personal accounts (12 testers / 14 days) — build it into the schedule.
- **Offline:** already works by double-click (file:// → the ad stub). A PWA manifest — optional, half a day.

Where «one file» gets in the way (the limits of applicability): (a) environments with a CSP ban on inline scripts — cured by trivially moving the script out into an adjacent file, a build.py edit; (b) asset growth: base64 inlining adds +33% of weight — if the content passes ~5–10 MB (textures, many models, music), it is time for regular files + a bundler (it is logical to combine this with moving three to modules); (c) granular caching/updates — irrelevant at 1 MB.

## 4. Alternatives — honestly

- **Godot 4 web:** the web export is 30–50 MB (the best optimized case — 35 MB), on iOS Safari there are still fresh crashes (the audio crash #107390 in 4.4.1/4.5, the crashes of no-threads builds #88321), threads require COOP/COEP headers, which we do not control on someone else's portals. The ADR-001 conclusion has not only not gone stale — there is more evidence for it.
- **Unity 6 Web:** the mobile browser runtime has genuinely been improved, but the builds are 15–50 MB against our 1 MB, and this is a full rewrite of everything for zero gameplay benefit. The acceptable bar of the 2026 web is 10–15 MB of initial load; Unity barely fits there, we are 10 times smaller.
- **PlayCanvas:** a good portal engine (~1.3 MB), but a cloud editor and a full rewrite of the rendering — it gives nothing that we do not already have.
- **Babylon.js:** the same class as three.js, heavier at the core; the gain from migrating is ~0.

For a casual game aimed at portals there are **no** reasons to migrate: the prototype works, the physics is stable, the weight is best in class, and all the approved design work (materials, light, palette — three acceptance iterations) only moves together with the stack.

## Plan of changes (keep-with-changes)

1. **Now (before release): change nothing in the stack.** The versions are pinned and vendored (three r149, rapier 0.19.3, Bridge v2.0.0). Hosting for Telegram/the portals — only with gzip/brotli.
2. **The release window:** a smoke test on developer.playgama.com (live rewarded), then one platform at a time — a run of the Poki/CrazyGames checklists through the Bridge configs.
3. **After release (1–2 sessions, planned tech debt):** three r149 → the current one: ES modules + esbuild (already in the project), the r152+ color-management edits, a visual A/B from three azimuths, your acceptance of the picture. The trigger not to postpone this indefinitely: any browser regression or a need for new features is a signal to do it immediately.
4. **Rapier:** sit on 0.19.3; watch the monorepo (0.20+); any upgrade — only with an A/B run of the physics behavior (the tuning is calibrated down to bit-for-bit rest).
5. **Toward the stores (when you decide):** a Capacitor wrapper + a third mode in 78-ads (AdMob) + the packaging harness + a test on a live mid-range Android; take into account the Google Play requirement of a closed test.
6. **If the content grows beyond 5–10 MB:** move away from inlining to regular files + a bundler (combine with item 3).

Sources: [three.js releases](https://github.com/mrdoob/three.js/releases), [removal of the UMD builds, PR #25435](https://github.com/mrdoob/three.js/pull/25435), [CVE-2020-28496](https://www.acunetix.com/vulnerabilities/web/three-js-uncontrolled-resource-consumption-vulnerability-cve-2020-28496/), [CVE-2022-0177](https://github.com/advisories/GHSA-7vvq-7r29-5vg3), [Dimforge: 2025 results and 2026 plans](https://dimforge.com/blog/2026/01/09/the-year-2025-in-dimforge/), [dimforge/rapier releases](https://github.com/dimforge/rapier/releases), [Poki requirements](https://sdk.poki.com/requirements), [CrazyGames technical requirements](https://docs.crazygames.com/requirements/technical/), [Playgama Bridge (GitHub)](https://github.com/Playgama/bridge), [Playgama Bridge docs](https://wiki.playgama.com/playgama/bridge-sdk/getting-started), [Telegram Mini Apps](https://core.telegram.org/bots/webapps), [Capacitor: Games](https://capacitorjs.com/docs/guides/games), [Godot iOS Safari audio crash #107390](https://github.com/godotengine/godot/issues/107390), [Godot no-threads crashes #88321](https://github.com/godotengine/godot/issues/88321), [Unity Web runtime updates](https://unity.com/blog/engine-platform/web-runtime-updates-enhance-browser-experience), [Godot vs Unity for web (2026)](https://app.cinevva.com/guides/godot-vs-unity-web-games)

## Portability (summary)

The «one HTML (~1.0 MB gzip) + Playgama Bridge» architecture ports to the whole target channel without a rebuild: the Playgama/Poki/CrazyGames portals — we pass the weight limits several times over (8/50 MB), Bridge v2.0.0 officially supports 28 platforms including poki, crazy_games, telegram; Telegram Mini Apps — all that is needed is static HTTPS hosting with compression (the 10-second load limit is no threat at 1 MB), and being single-file is a plus here; the stores — a Capacitor wrapper around the same bundle (WebGL works in WKWebView, the Vampire Survivors precedent), only the ad mode in the 78-ads adapter changes + the packaging harness; offline already works with file://. Being single-file gets in the way only in three cases: a CSP ban on inline scripts (cured by moving the script out into a separate file — a build.py edit), asset growth beyond ~5–10 MB (base64 adds +33% of weight — then a move to a bundler and external files) and granular caching (irrelevant at 1 MB).

## Risks

- three.js r149 is frozen: a future browser regression will be left without an upstream fix; mitigation — the planned move to modules after release (esbuild is already in the project, 1-2 sessions)
- Upgrading three to the current version will shift the approved picture (r152+ color management: outputColorSpace, useLegacyLights) — a visual A/B and re-acceptance by the owner will be required
- The rapier3d-compat npm releases lag behind the core (0.19.3 — November 2025, the core 0.34.0 — July 2026); after the merge into the monorepo the packaging of the package may change — our version is vendored, nothing threatens the current build, but a physics upgrade should only be done with an A/B of the behavior
- The live QA checklists of Poki/CrazyGames (their SDK events, review) have not been verified — we rely on the Playgama Bridge adapters; a smoke test on each platform before submission is mandatory
- Telegram Mini Apps: file:// does not work, HTTPS hosting with compression is needed (a 10 s load limit) — a deploy task, not a code one
- WebView performance on weak Android devices (Capacitor/Telegram) has not been measured — a mandatory test on a real mid-range device before the stores; since May 2026 Google Play requires a closed test of 12 testers/14 days for new personal accounts
- Environments with a CSP ban on inline scripts will require moving the script out into a separate file (a trivial build.py edit)
