# "Mixer": what is needed for launch and how to live on

Compiled 2026-07-29 on build **v1-test-160** from a run over the whole repository
(six independent slices + a critic, every finding with links to files).
A document for the owner: no jargon, every item is "what is wrong, what it threatens,
how much work".

Effort estimate: **hours** — one session, **days** — 2-5 sessions, **weeks** — a separate
project.

---

## 0. In short

The game is **playable and stable**: the suite of 234 checks is green; physics, progression,
the collection, the ad stub, saves — all work. It is **not ready for publication** for
three reasons, and all three lie outside gameplay: payment is broken, the debug
console is open in play, and there are no materials for the platform's store page.

None of this takes weeks. Realistically: **1-2 weeks until submission to the portal**,
half of that not code but texts, store-page images and one smoke test on the live
platform.

---

## 1. BLOCKERS — publishing is impossible without these

### 1.1. The purchase buttons do not work at all ⛔ hours

The player opens "Get More", sees **$4.99 / $9.99 / $19.99**, presses "Upgrade" — and
**nothing happens**: no purchase, no credit, no error message.

The cause has been found and verified with a live click: the button passes the tier number
as a **number** (`5`), while the bundle set is looked up by a **string** name (`'bundle5'`). The function
does not find the item, silently returns a refusal, and nobody reads that refusal.

- `src/app/90-input.js:271` — `const tier = +btn.dataset.tier`
- `src/app/00-config.js:176-178` — `id: 'bundle5' / 'bundle3' / 'bundle2'`
- Check: a click on the button — the state does not change; `buyBundle('bundle5')` with a string — works.

⚠️ **Why the tests did not catch this:** the suite calls the function directly with a string and is
therefore always green. Nobody presses the button. Both the code and the test must be fixed.

⚠️ **Separately:** even after the button is fixed, **there are no payments in the game** — this is handing out
the goods without payment. A real payment is made through the platform, and that is separate work
(see 1.2).

### 1.2. Real money must NOT be connected yet ⛔ days

The entire protection of the economy rests on the device clock and on local storage. While the
currency is soft (spent only inside the game) this is tolerable. As soon as payment with
real money appears, the same mechanism becomes a hole: winding the clock back
extends a purchased booster, and a storage reset is confirmed by nothing on the server.

**Rule: do not enable payments until there is server time.** This was already
recorded earlier as a launch condition and remains in force.

### 1.3. The debug console is open in the production build ⛔ hours

On the main screen below the collection there is a **visible "Developer panel" button**. Behind it
is the match radius slider (it makes the game easier and inflates the stars) and **"Reset progress"
without confirmation** — it zeroes all progress, including what was bought, and immediately writes
zeros into the platform's cloud. It cannot be rolled back on any device.

On top of that, the full service interface is open in the built file: grant currency, grant
the $19.99 bundle for free, roll the level back, move the timestamp on which
the protection against winding the clock rests.

- `src/shell.html:1355` — the button; `src/app/90-input.js:361` — reset without confirmation
- `src/app/99-main.js:536` — the service interface; all of this is present in the built `index.html`

⚠️ For the platform's review a visible "Developer panel" button together with the tab title
"Mixer — **Prototype**" reads as an unfinished build.

⚠️ It must be removed carefully: the service interface is needed by the tests. The right solution is
not to delete it but to hide it behind a build flag (test/production).

### 1.4. The ad stub hands out rewards for free ⛔ hours

If the platform does not support videos or the SDK failed to load, the game shows
**its own** screen with the text "(rewarded video will play here)", waits 3 seconds and
**hands out the reward**. Ad shakes per level are not limited, which means this is
an endless handout of free bonuses and zero income — while the player is convinced
he is watching an ad.

Showing a fake ad screen is a standard ground for rejection at review.
The stub must remain only for local development.

- `src/app/78-ads.js:229` and `:146-158`, markup `src/shell.html:1148`

### 1.5. The store page for the platform does not exist ⛔ days

The project has **not a single** file of an icon, cover, preview or screenshot. There is no
description of the game, no genre, tags, age rating. The tab title is "Mixer —
Prototype", the page language is declared as Russian while the interface is fully English.

There is nothing to fill the submission form with. This is not code — these are materials, but without them the
application is not submitted.

### 1.6. The rights to the music are confirmed by nothing ⛔ hours

The background track `music.mp3` (4.4 MB, downloaded by every player) is a byte-for-byte copy of
`Audio/2-music/original-master-267kbps.mp3` (called `Audio/stray vibe.mp3` until 2026-09-01-l),
and **nowhere in the project is there an author, a licence, or a link to
where it was taken from**. The platform requires the rights to audio to be confirmed as a separate item.

The models, judging by the file names and the structure, are from the free Kenney sets (their licence
for the sky panoramas is already lying in the repository), but the sets have no licence files —
they are worth putting in. Separately it is worth confirming the `Brick` set, it stands out from the general
pattern.

⚠️ Replacing the track is cheap. Dealing with a claim after launch is expensive.

### 1.7. The first error kills the session dead ⛔ hours

The error interceptor is installed globally and forever. Any unhandled error — our own
or one from someone else's ad script — closes the whole screen with a "Failed to start 3D" panel
with technical text and the advice "open the file in a browser", although the player is **already** in
a browser. There are no buttons on the screen, the panel cannot be dismissed, level progress is lost.

- `src/shell.html:1367` — the interceptor; `src/shell.html:1359` — the panel without buttons

What is needed: a fatal screen only at the startup stage; in play — a clear message with
a "Reload" button, and sending an event to telemetry (right now this screen does not
send anything, that is, the most expensive category of churn is invisible).

### 1.8. ✅ PARTIALLY CLOSED 2026-07-29 — the production ad branch has been executed

It used to be: "the live ad branch has never once been executed". INTEGRATION ran it on
live Pages under the **real Poki adapter** (the platform is set right in the address:
`?dev=1&platform_id=poki`, no config substitution is needed). The full video cycle:
opening in 0.4 s → the game went into a silent pause and went quiet → a real ad
break of ~11 s → the reward → unfreezing, the sound came back. 12.5 s in total, the pause
state clean.

That is, the pause, the muting, the single resolution point and the rule "the reward strictly upon the fact
of watching it through" have for the first time been checked against a live platform adapter and not against our
mock.

⚠️ **WHAT THIS DOES NOT CLOSE — and that is more important than what it closes:**
- only **Poki** starts up this way; on the other platforms the native SDKs do not load
  outside their own domain and everything falls into the stub. "We checked all the platforms" is untrue;
- **the smoke test on developer.playgama.com is still mandatory.** The reward arrived without
  a visible video, and from here a real display cannot be told apart from the platform's fallback
  "no ad was found — hand out the reward anyway". The economic question "are we not
  giving the reward away for nothing" is closed only by eyes on the portal.
---

## 2. WORTH FIXING — not blocking, but noticeable

| What | Why | Effort |
|---|---|---|
| **No loading screen** | On a slow network, 12 seconds of a black screen without a single sign of life. Measurement: 4G — 3.8 s, slow 3G — 12.1 s | hours |
| **The weight has grown threefold against its own budget** | An 8.4 MB file, 2.0 MB over the network + 4.4 MB of music = ~6.5 MB for the first session. Our own tech review set a target of ~1 MB and the Poki limit of 8 MB — already tight | days |
| **We do not send the platform the "player started/finished playing" signals** | How the platform places its own ads and counts engagement depends on them. Only "the game is ready" is sent | hours |
| **A Russian string in the English interface** | The toast "No pairs available — shake!" (in Russian in the source) is seen by exactly the newcomer, the neighbouring toast is already translated (`src/app/80-gameplay.js:561`) | hours |
| **No tutorial** | Nowhere does the player learn the rules: tapping identical items, the shake, the mixer threat, turbo. There are concessions for the newcomer (no penalties on level 1), but no explanation | days |
| **No reason to come back tomorrow** | No dailies, no streaks, no leaderboard. The collection pulls passively. Bridge can do daily rewards and achievements — we do not use it | days |
| **There is no leaderboard** | The place formula exists, sending to the platform does not. This is the only social hook that does not require our own server on the portals | days |
| **Telemetry is switched off** | 17 types of events are collected, they lie in the tab's memory and die with it. A receiver is needed (a Cloudflare worker) — otherwise the launch will go blind, and the data of the launch window is unrecoverable | days |
| **There is no privacy policy** | Today there is no violation (nothing is sent), but switching telemetry on is one line, and at that same moment the session identifier and error stacks will fly out. The platform asks about data collection and requests a link | hours |
| **The player has nowhere to write** | No contact, no "About the game", no credits. The version number is visible only through the debug panel, which has to be removed — that is, the player will not be able to name the version on which it broke | hours |
| **Orientation is not handled** | In phone landscape (852×393) the items panel considers the screen a "desktop" and takes up the bottom third | hours |
| **The portal package is not built automatically** | In `release/` there is an archive for testers — three files, **without** both Bridge files. The real package is assembled by hand from four files, and this is a typical place where the config gets forgotten | hours |
| **Endless turbo does not let the level finish** | Measurement: the refill outpaces the removal, the score grew to 274,000 in 3 minutes and did not stop. For a leaderboard this is a farm | hours |
| **Two difficulty increases on one level** | On the 16th, size spread and non-matchable stones turn on at the same time. There are no measurements of this level specifically | hours |
| **The stars measure the level number, not skill** | On early levels 3★ is a gift, on 15+ a normal game gives 1.2-2.0. Normalisation is an open question | days |

---

## 3. New models and content

### How it is arranged now

93 item types: animals, fruit and vegetables, cars, bricks, the pirate set. The models
are not loaded during play — they are **baked into the build as numbers**: a `.glb` is run through
a script and turned into a code module. That is why the game works offline as a single file,
but that is also why **any new item requires a rebuild and a new release**.

The path is always the same: put the `.glb` in → run `tools/glb2module.py` (the texture
atlas must lie next to it) → add a line to the types table. I do this, by hand it
cannot be done.

### What is worth knowing about adding

- **Progression opens types in list order**, one per level starting from
  nine. 93 types = roughly 84 levels of content. After that no new items
  appear — this is the natural boundary of the current content.
- **Weight.** The models are more than half of the build (4.7 MB out of 8.4). Every new set
  adds both geometry and an atlas. Before the next large batch of models it is worth
  settling the weight question (see section 4), otherwise we will hit the portals' limits.
- **The model simplification script is optional, not mandatory.** The threshold is currently 3200
  triangles, and it has already spoiled the cars once; they are assembled from the originals.
- **Flat models have been deleted**, the rest are sorted by type — put new ones in the same way.

### What I would add first

Not new packs of items, but **variety within a level**: right now on a late
level there are 48 types, groups drop to 3-4 items, and the game turns into a monotonous
search. More types amplify this problem rather than solve it. First it is worth deciding
what to occupy the player with after level 20, and only then pouring in more models.

---

## 4. How to update the game after launch

### What currently requires a full release

**Everything.** Prices, balance, texts, models, rules — baked into a single file. Any
edit = rebuild + re-upload to the portal + waiting until the platform picks it up.

This is normal for launch, but bad for tuning: picking a price or a difficulty
by iterations that take several days each is impossible.

### What can be done, in increasing order of complexity

1. **A settings file next to the game** (hours). Move prices, balance, texts into
   `config.json`, which lies next to `index.html` and is read at startup. Then
   editing a price is replacing one small file, without rebuilding the game. The game
   must survive its absence (fall back to the baked-in values).
2. **A remote config** (days). The same file, but at our own address. It allows prices
   and balance to be changed **without the platform being involved at all** and an unsuccessful decision to be rolled back in
   minutes. The baked-in SDK, by the way, can itself read a remote config.
3. **Split the build into parts** (weeks). Right now everything is in one file for the sake of offline.
   If the models and the physics engine are moved out into separate files, a content update
   will stop dragging a re-upload of everything with it. This also cures the weight: the player downloads
   only what has changed. Our own tech review prescribed this transition after 5-10 MB —
   the threshold has already been crossed.

### Save compatibility

It is done correctly and that is worth preserving: counters only grow, on a divergence of
copies the larger one is taken, what has been spent is not returned. An old save will survive a new version.
**The only weak spot** — the level number is stored separately and does not travel to
the cloud: a player who changes device will start from the first level, while keeping
the collection.

### How to roll out and roll back

- There is a version marker in the build (`v1-test-160`) and it gets into telemetry — after
  the receiver is switched on it will be possible to see who is on which version, and to catch a spike of
  errors after a release.
- A tag and an archive on GitHub are already being made; a rollback = re-upload the previous archive.
- **A/B without a remote config is impossible** — one more argument for item 2.

---

## 5. Order of actions

**Step 1 — close the code blockers (2-3 sessions):** fix the purchase button and cover it
with a test; hide the debug panel and the service interface behind a build flag; remove
the fake ad from production mode; fix the fatal screen; fix the video
watchdog; rename the title and the page language.

**Step 2 — run the ads on a test bench (1 session):** assign the platform through the config
and execute the production branch for the first time — before submission, not after.

**Step 3 — store-page materials (on the owner):** icon, cover, screenshots,
description, genre, age rating, music licence. Without this the application is not
submitted, and this is the only step where you are needed, not me.

**Step 4 — telemetry (1-2 sessions):** raise the receiver and switch sending on.
Launching blind is not allowed: the data of the first days cannot be recovered.

**Step 4.5 — update the platform SDK before uploading.** ⚠️ We are two patch versions
behind (we have 2.0.0, npm has 2.0.2). The public set of functions is identical, the risk is
low — but the patches are worth taking before publication, not after.
⚠️ Check the version of this SDK **in npm**: the releases page and the changelog
lag behind, and we have already made a mistake on that once.

**Step 5 — submission and a smoke test on the live platform.**

**Step 6, already after launch:** remote config, tutorial, a reason to come back tomorrow,
the leaderboard.

---

## 6. Open questions for the owner

1. **Prices** $4.99 / $9.99 / $19.99 — are they final? The middle tier is currently not
   singled out in any way, usually it is made "the good deal".
2. **The "No more AD" $1.99 subscription** conflicts with the bundles, which also give
   a period without ads. Do we keep both?
3. **The platform for the leaderboard** — Playgama, Yandex, both?
4. **What does the player do after level 20?** — whether to add models
   or change the rules depends on the answer.
5. **Should "Reset progress" be removed entirely** or hidden together with the debug tools?

---

# PART II. The week before launch and the move to apps

An addition dated 2026-07-29 at the owner's request. Assembled from a run over the repository
and **verification of external facts by search** (store rules change, memory
is no good here). For every disputable item it is marked what has been verified and what has not.

⚠️ **Correction to Part I.** Step 4 ("raise the telemetry receiver and switch sending
on") must NOT be done on the PORTAL build: Playgama names built-in
analytics as a separate ground for rejection, and some partner platforms block
any external requests. Our own telemetry stays switched off for the portals and
is switched on only in our own build (site/app).

---

## 7. The week day by day (30 July — 5 August)

Split into "me" and "you". My estimates are about the code; the timelines of someone else's review I do not
control.

### Thu 30.07
- **YOU:** register on `developer.playgama.com` (Sign Up → confirm the
  email). Do not upload anything. Send me a screenshot of the dashboard — I want to see
  the real form fields, not guess at them.
- **YOU:** settle the music question. `music.mp3` is built from `Audio/2-music/background-music.mp3`
  (the 267 kbps master sits beside it as `original-master-267kbps.mp3`),
  there is no author and no licence anywhere. Options: remember the source and send the link /
  allow replacing it with a free track with a confirmed licence / release
  without music. **This is a blocker, without an answer we cannot go further.**
- **ME:** fixing the purchase button (the mismatch between the number and the string name of the tier) and
  covering it with a test that presses exactly the button.
- **ME:** hiding the debug panel and the service interface behind a build flag.

### Fri 31.07
- **ME:** removing the fake ad from production mode; fixing the video watchdog
  (right now it goes out on the very first event — if the platform goes silent after the video
  is opened, the game will stay paused forever).
- **ME:** the tab title without the word "Prototype", the page language, an "About the game" screen
  with the version and a contact (right now the version is visible only through the debug tools).
- **YOU:** answer the five questions from the end of Part I (prices, subscription,
  leaderboard, what happens after level 20, the fate of "Reset progress").

### Sat 1.08 — Sun 2.08
- **ME:** a run of the production ad branch on a test bench. The baked-in SDK can force
  the platform to be assigned through the config (right now it is empty) — that is, the code that
  brings in money will be executed for the first time **before** submission, not after.
- **ME:** building the portal package with a single command (right now it is four files by hand,
  and this is a typical place where the config gets forgotten).
- **YOU:** the store-page materials. According to the Playgama form these are mandatory: title (2-4 words,
  it must match the title inside the game), description, "how to play", icon and
  screenshots. I will generate the icon from a single 1024×1024 PNG if you send the source.

### Mon 3.08
- **ME:** the privacy policy — the text and a page at a permanent address; the link
  both in the platform dashboard and inside the game.
- **ME:** the final run, the build, the tag, the package.
- **YOU:** submission to Playgama.

### Tue 4.08 — Wed 5.08
- The platform's review: **1-5 business days**, I do not control it. The honest
  wording is "we submit on 3 August", not "on 5 August the game is in the catalogue".
- **ME:** while we wait — the newcomer tutorial and a reason to come back tomorrow (both holes
  are named in Part I).

---

## 8. iOS / iPad / Mac apps

### ⛔ The main thing: the premise about graphics is wrong

You wrote "hooking up the device's graphics — we can clearly win here". I checked,
and that is not so:

- **The browser already renders through Metal.** Since Safari 15 WebKit drives WebGL over Metal.
  That is the device's native graphics, there is no software emulation.
- **WKWebView is the very same engine**, the same process, the same WebGL path as
  Safari has. A simple wrapper gives **zero** in rendering.
- **The wrapper can even be slower:** in WKWebView frames are locked to 60 Hz, while
  Safari in recent versions can lift the cap. This is not critical for us (we aim at 60),
  but it cannot be written down as a "win". There are documented cases of "WKWebView
  slower than Safari", the opposite ones were not found.
- **WebGPU is already on by default** in Safari 26 (since 15.09.2025), coverage ~84%.
  That is, it is available in the ordinary browser too — this is also not an argument for an app.
  ⚠️ Whether WebGPU works inside WKWebView is **not confirmed**, no verified
  data was found.

**What an app really gives:** a distribution channel (the App Store as a storefront),
the absence of browser chrome, local assets instead of a 6.5 MB download, the absence
of tab throttling, payments through Apple. This is about income and convenience, **not about fps**.

⚠️ **Full-screen mode can be had for free right now:** a web manifest with
`display:standalone` — a site from the home screen opens without the Safari toolbar, with
an icon and in the task switcher. Hours of work instead of weeks.

### What to wrap it with

**Capacitor** — my recommendation. Our `index.html` is put into the `www/` folder as is,
the build stays the same, there are ready-made plugins for ads and purchases, the project is alive.
Bare WKWebView on Swift is cheaper in dependencies, but everything that Capacitor gives
ready-made (ads, purchases, safe areas) will have to be written by hand — and
it will not be you who maintains it.

**Mac — for free.** A separate build is not needed: the app is automatically
available on Macs with Apple silicon, it is switched on with a checkbox in the dashboard. A separate
Catalyst build is not needed.

### ⚠️ The risk I consider the main one

In June 2026 Apple tightened rule 4.3(b): they do not accept apps that are
"indistinguishable from what is already widely available", and they **may take down an already
published one** if it is not updated and does not gather an audience. A casual
"find the pair" puzzle is an oversaturated genre. The application must be submitted not as "yet
another match-3", but with a clear distinction: 3D physics in a mixer, a collection of 93
models, the eyes character.

The second risk is rule 4.2 ("not a repackaged website"). Our position is strong
(the game is baked into the bundle, works offline, ~84 levels of content), but the norm is a judgement call.
It is reduced by the fact that we **never load the game over the network as the main screen** and
add 2-3 native traits: Game Center instead of our own leaderboard,
haptic feedback, saving to iCloud.

---

## 9. Updates without a rebuild: what is allowed and what is not

This is your key question, and its answer has two parts.

**DATA — allowed.** The permission lies not in the review rules (there item 2.5.2
forbids downloading code at all), but in the developer licence agreement: there is
a clause about interpreted code that **does not change the purpose of the app**,
does not create a store of someone else's code and does not bypass signing. On this clause tools
like CodePush and Expo have been working for ten years. So prices, balance, texts, difficulty
curves, level descriptions and **item packs as data** can be shipped remotely
without review.
⚠️ Sources quote this clause under different item numbers. Before
building a product on it, open the current agreement in the developer dashboard and
make sure the wording is there.

**LOGIC — not allowed.** In early 2026 Apple blocked updates of several
apps precisely because they generated and executed code that changed behaviour
at runtime. We are not going to build a "download a new gameplay module" system.

⚠️ **Rule 4.7, which everyone cites as "Apple allowed HTML5 games",
does not suit us.** It is written for platforms that distribute SOMEONE ELSE'S mini-games, and it
requires an index of all games with links, a mechanism for content complaints and for blocking
users, and above all — it **forbids exposing native APIs** to that code,
that is, ads and purchases from the web layer will not be able to work. For one game of our own
this is a bad bet.

### What this means for the architecture

The order of work is the same as in Part I §4, and it serves both channels:
1. move prices, balance and texts into a file next to the game (hours);
2. put this file at our own address — then editing a price requires neither a rebuild,
   nor a review, nor the platform's participation, and a rollback takes minutes (days);
3. move the model packs out of the build into separate files (weeks) — this also cures the weight.

The differences between the web and the app are isolated by a single adapter layer. We already
have a working sample: `78-ads.js` substitutes the stub for the platform's ads. Purchases and
storage are substituted in the same way. Everything else is one codebase.

---

## 10. Where to set up ads and payments

| | Web portals | App |
|---|---|---|
| Ads | through the platform, no ad account of our own is needed | our own network (AdMob or an equivalent) + a tracking request + a "report this ad" button |
| Payments | the platform's payment rail | **In-App Purchase only**, our own mechanism is forbidden |
| Account | free | **$99 a year** |
| Review | 1-5 days | up to a week, with a risk of rejection |

**Our products in the app:** three bundles $4.99/$9.99/$19.99 — consumable
purchases; "No more AD" $1.99 — an auto-renewable subscription. They are set up in the Apple
dashboard. The in-game purchase handle is already written correctly (it takes the tier name),
only what is hooked up to it has to be changed.

⚠️ **The Playgama payment rail must not be used in the app** — that is a direct
violation of the purchases rule.

⚠️ **The platform's share is stated in the Playgama documentation with two incompatible
figures.** Until there is a written answer, count with the worse one, otherwise the bundle economics
are calculated twice as optimistically as reality. This is a question worth asking by
email right after registration.

⚠️ **Our income is ad-based, and users opting out of tracking cuts it
heavily** — and we do not have a single forecast that takes opt-outs into account. This is not a reason not
to do it, this is a reason not to build a plan on invented numbers.

---

## 11. What it costs and what I do not know

**Money:** an Apple account $99/year. Everything else is time. The telemetry receiver on
Cloudflare on the free plan.

**An honest fork before spending.** The portals accept the same file: no Apple
review, no $99, no rewriting payments and ads — there it is weeks until the first income.
The App Store is a separate project of weeks with a risk of rejection under 4.3(b).
My advice: **the portals first, the app as a second step**, when it is clear
that the game holds an audience.

**What I have not checked and will not invent:**
- whether WebGPU works in WKWebView;
- the exact item number of the licence agreement about interpreted code;
- Playgama's real share;
- taxes and getting money out of the App Store outside the USA — that is for an accountant, not for me;
- **not a single measurement from a real iPhone.** All the performance figures were taken with
  a headless browser with a software renderer. The first thing to do during the week is to open
  the game on your phone and take real frame numbers — before any decisions about platforms.
