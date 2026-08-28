# Architecture and code review, August 2026 (BLENDO v2)

Method: 15 finder agents swept the code by slices, then every finding was adversarially
verified against the live code by an independent agent whose job was to REFUTE it.
33 findings harvested → 33 unique after dedupe → **31 confirmed, 2 dropped** → 29 entries
(two entries carry two confirmed findings each, because they share one cause).

Ordering is strictly **by what it costs the player or the owner**, not by module.
Where a finding survived only in part, the entry says which half fell off under verification.
Where the answer is «do not fix», the entry says so.

The 2 dropped: «double payout of the early bank after a reload» (refuted — level
generation zeroes both the score and the bank, `40-items.js:823/:838`) and «duplicated
boilerplate when model modules are regenerated» (refuted — the concatenation order makes
`39-sport.js` the winner, and the canon already prescribes the cleanup).

---

## 1. A failed cloud read looks like «a new player», and the next save overwrites the cloud

- **Breaks.** When the game cannot read the cloud save (a network failure at Playgama/Yandex), it does not tell that apart from «this person is here for the first time» — and the very first autosave writes empty progress over the cloud.
- **Where.** `src/app/77-save.js:139` (returns without marking «we did not read»), the write is `77-save.js:131`.
- **Cost.** On a new device, or after site data is cleared during a cloud outage, the player silently loses everything: wallet, level, stars, collection, opened types. Purchases (`naf`) survive — restorePurchases brings them back every start.
- **Fix.** Set the mark only on a SUCCESSFUL read and forbid writing to the cloud until it is set. Minimum insurance available today: never write a save whose every field is at its default (0 coins, level 1, 0 stars).
- **Size.** Small (one flag + one check in 77-save.js). The difficulty is elsewhere: the vendored bridge SDK swallows the read error itself and returns an empty value, so telling «the cloud said empty» from «the cloud did not answer» needs a separate check. Plus one test mock to rewrite.
- **Honestly.** Partial: the mechanism is fully confirmed, but the original claim pointed at the wrong branch — what really breaks is the «SDK returned empty» path, not «SDK threw».

## 2. The stuck-item rescuer is blind to five paths out of seven — a level can become unwinnable

- **Breaks.** There is an emergency mechanism: if an item is stuck in its disappearance animation, after 1.2 s it is removed by force. But the timestamp the mechanism looks for is stamped by only two paths out of seven — the bomb, the surprise, the mixer and the final grind do not stamp it.
- **Where.** stamped only at `src/app/80-gameplay.js:149` and `:565`; unstamped — `:397`, `:415`, `:571`, `:876`, `:1215`, `:1243`. The rescuer's check is `src/app/99-main.js:635`.
- **Cost.** One lost «tail» and the item stays alive forever: it cannot be tapped, it has no physics body, a shake will not move it. The level becomes unwinnable: its coins, stars and progress are lost, and the only way out is reloading the page.
- **Fix.** Stamp next to the animation flag in all nine places — best as a one-line helper `markAnimating(it)`.
- **Size.** One line per site, or a two-line helper. No effect on balance. Safe by measurement: every unstamped tail lasts 150–880 ms against the rescuer's 1200 ms threshold, so false positives are impossible.

## 3. Two different ways to fall out of the leaderboard permanently, both silent and unrecoverable

These are **two distinct causes** leading into one dead end: the server answers «denied», the client swallows it and never retries (`src/app/82-lb.js:350` — no recovery branch). Hence one entry, two fixes.

**Door A — the signing key lives only in the browser while the player id travels to the cloud.**
- **Where.** `src/app/82-lb.js:55-67` (the key is written locally only), `src/app/77-save.js:100/241` (the id taken is the oldest from the cloud).
- **Cost.** The player sits down at a second device — their leaderboard row freezes at the old result forever and is still shown as current. On the win screen, instead of a rank, there is a bare «Leaderboard» with no arrow, neighbours do not load, spending stops moving the rank. All silently.
- **Fix.** Carry the key in the save alongside the id (whichever id wins, its key wins). One field, two merge branches, one branch at the seam.
- **Timing matters.** The fix is **not retroactive**: already-locked players heal only after the ORIGINAL device runs the new version once. Anyone without the old device stays frozen forever. The later this is fixed, the more people cannot be brought back.

**Door B — the server deleted the row by retention while the browser still believes it is registered.**
- **Where.** `src/app/82-lb.js:335` (no key attached on submit), the «registered» mark is set at `82-lb.js:77` and cleared nowhere; the server answers `nokey` — `server/leaderboard/src/index.js:154`; retention is 180 days — `index.js:35`.
- **Cost.** A player returning after half a year in the same browser never gets into the table again: every submit is rejected, no rank, no message. Not before February 2027.
- **Fix.** On a `nokey` answer — clear the mark and retry (a mirror of the branch that already exists at `82-lb.js:200`). Simpler still: always attach the key — the server ignores it when the row exists, and the code comment claiming otherwise is stale.
- **Size (both).** Client only, no server or schema change. Half a day with verification.

## 4. The win screen stays on top of the new level after returning from the background

- **Breaks.** Backgrounding the tab on the «level complete» screen, then opening the menu and pressing «Play», starts the new level UNDERNEATH the old win screen, which nobody dismissed.
- **Where.** `src/app/90-input.js:509` — no overlay hiding before level generation; only the «Again» button clears them (`90-input.js:348`).
- **Cost.** The player sees a stale «complete» caption over a level that is already pouring and already grinding below. The only way out is «Next», which discards that level, generates a new one and may show one extra interstitial. The same applies to the lose screen.
- **Fix.** Hide `winOverlay` and `loseOverlay` before level generation in this one branch.
- **Size.** Two lines.
- **A fork for the owner.** Should this path also fire the «new item / story / ad» chain the way «Again» does? Not decided here — by default it does not.

## 5. The coin counter shows more than can be spent, and the button refuses without explaining

- **Breaks.** Spending mid-level and then losing points on misses creates a «debt». The debt is hidden (the number is clamped to zero), so the wallet chip shows more than is actually available.
- **Where.** `src/app/77-save.js:322` (the clamp), the debt branch is `77-save.js:410`; display at `85-hud.js:1260` and `:2180`.
- **Cost.** The wallet is inflated by the debt — dozens of units after a few misses (a miss costs 10). The «Boost»/«Open type» button looks affordable and refuses, and the number displayed immediately drops to the honest one. No money burns: it pays off the debt. No double charge — the player really did overspend and really did get the goods.
- **Fix.** Let the screen and the buttons see the unclamped number; keep the clamp for storage and the leaderboard only.
- **Size.** One helper and three call sites inside the wallet section of 77-save.js. Needs a new test for «banked early → spent → score dropped → won» — there is none today.
- **Honestly.** Partial: confirmed by reproduction on the real functions, but the case is narrow — it needs a mid-level purchase AND a score drop before the win.

## 6. Breaking ice pays a flat 3 points, ignoring the type's upgrade

- **Breaks.** The type multiplier is not applied to a broken ice block — the code asks for the multiplier by the internal key instead of the type name and always gets 1.
- **Where.** `src/app/80-gameplay.js:387`.
- **Cost.** Always 3 points on screen instead of 3×multiplier — 1–2 points short per break at ordinary upgrade levels (up to ~7 at the cap, which is itself nearly unreachable). Ice starts at level 11, 1–2 breaks per level. The level is never lost because of it: frozen items are excluded from the star thresholds.
- **Fix.** Replace `it.key` with `it.frozenType` — the field exists for exactly this.
- **Size.** One word. Tests untouched.
- **Honestly.** Partial: the mechanism is exact, but the cost is 10× smaller than originally claimed — recomputed into displayed points, not internal units. The canon, incidentally, describes this very trap («the key is not the type name»).

## 7. Tapping ice during the final grind is penalised, and the hint asks for the impossible

- **Breaks.** In the finale, while everything is being ground down, taps must not be penalised — but a tap on an ice block still takes the penalty and shows the hint «Frozen! Collect N more pairs», which can no longer be collected in the finale.
- **Where.** `src/app/80-gameplay.js:1000` (no finale check, unlike its neighbours `:983`, `:989`, `:1036`), the hint at `:1002`.
- **Cost.** One tap in the grind window costs 20–30 displayed points — 10–15 pairs by leaderboard reckoning, inside a window the canon declared free. Plus an instruction that physically cannot be followed.
- **Fix.** Do not penalise in the finale (shudder only), and either hide or rewrite the hint there.
- **Size.** Two lines in one branch, no constants or balance numbers touched.

## 8. Releasing the mouse over a HUD button leaves the camera spinning under an unreleased button

- **Breaks.** Dragging the camera and releasing the mouse button somewhere other than the play field (over «Shake», «Hint», the zoom, or outside the window) means the game never learns about the release — the next mouse move snaps the bowl around.
- **Where.** `src/app/90-input.js:169` and `:174` (drag end is listened for on the canvas only), no pointer capture at `90-input.js:101`.
- **Cost.** Desktop mouse only — touch is unaffected. It heals itself on the next click on the field, but a snap under the cursor right before an intended tap costs a full mistake: −10 points, a broken streak, a dropped pickup radius.
- **Fix.** Capture the pointer when the drag starts (the technique is already used at `85-hud.js:2835`). Cheaper: return early from the move handler when no button is held.
- **Size.** One line + a test for «pressed on the field, released over a button» (the current test releases inside the field and is blind to this).

## 9. The 60 fps limiter delivers 45 fps on a 90 Hz phone

- **Breaks.** The frame limiter was written for two cases: 120 Hz and 60 Hz. On intermediate displays (90 Hz on many Android phones) it drops every other frame and yields 45 instead of 60; on 144 Hz — 48.
- **Where.** `src/app/99-main.js:573`.
- **Cost.** On a 90 Hz phone, calm play renders noticeably less smoothly than on an ordinary 60 Hz one: camera drag, zoom, effects, the eyes. Score, levels and timers are unaffected — physics is averaged.
- **Fix.** Drop a frame not by a fixed millisecond threshold but by the measured display rate: only when the display is at least twice the target.
- **Size.** One line plus a rolling average of the rate. The obstacle: two tests are nailed to the current number 14 — the wording of those checks has to be agreed with the owner.
- **Honestly.** Partial: the arithmetic is fully confirmed, but the original claim «this is what causes the stutter as the bowl settles» is wrong — in those stutters the frame already costs more than the threshold and the limiter does not engage. This is about the smoothness of calm play.

## 10. Idle time after an ad is compensated twice — the counter shows an impossible number

- **Breaks.** While an ad plays, the game adds time to the idle timer twice: once during the ad, once when the pause is lifted.
- **Where.** `src/app/78-ads.js:223`, `:364`, `:373` + `src/app/99-main.js:466`.
- **Cost.** **The player loses nothing — this is a gift.** After a 30-second ad for a hint, the counter under the eyes shows ~45 against a maximum of 15, and the grind punishment does not switch on for that time. It corrects itself on the next tap. Same on every interstitial: the new level opens with an inflated counter.
- **Fix.** Keep exactly one compensator — the pause lift; make the three updates during the ad conditional on the pause not having come from an ad.
- **Size.** Three one-line checks. Fixing one of the three is pointless — in production it will leak through another.

## 11. Rewarded ads do not tell the platform what they were shown for

- **Breaks.** Rewarded ad impressions carry no placement name — every live site (hint, shake, ×2 on the win screen) collapses into one bucket in the platform's reports.
- **Where.** `src/app/78-ads.js:892`; none of the callers passes a name: `80-gameplay.js:1149`, `:1343`, `90-input.js:359`, `:368`.
- **Cost.** Zero for the player. The owner's cost: revenue and eCPM cannot be split by placement, so «does the ×2 on the win screen earn its slot?» cannot be answered. Own telemetry is not a substitute — it counts impressions, not money. Additionally: a dead slot `magnet` (from a removed button) is declared in the config and the live `hint` is not.
- **Fix.** Pass the name at four sites, add `hint` to `playgama-bridge-config.json`, add one test that a real click carries the name.
- **Size.** Four arguments, one config line, one test. No gameplay or economy paths touched.
- **Honestly.** Partial: the mechanism is exact, but three slots collapse, not four — «continue» is unreachable per the canon.

## 12. The hourly cron reads the whole player table twice per run

- **Breaks.** The hourly leaderboard rebuild walks every row twice, and the daily cleanup does a full scan without an index.
- **Where.** `server/leaderboard/src/index.js:306`, `:308`, `:321`; the schedule at `:344-345`.
- **Cost.** Nothing yet. If the Cloudflare D1 daily read limit is exhausted, the table returns an empty list and score submission starts failing until the limit resets. The game itself does not suffer — the table is deliberately «decoration that never blocks play».
- **Fix.** Bound the ladder walk (`LIMIT 20000`) — rank estimation already returns a bucket boundary, not an exact rank. Or drop the snapshot frequency to every 3–6 hours.
- **Size.** The edit is small, the verification is not: there has already been an off-by-one at a bucket boundary, caught only on a large database. It needs a 50 000-row seed rerun.
- **Honestly.** Partial: the budget WAS computed in advance (`docs/LEADERBOARD-OWN.md:95`, «~2.9M rows»), so «nobody counted» is wrong. The open gap is narrow: the estimate counted ACTIVE players while rows are kept 180 days, so the real table can be several times the active audience.

## 13. The ice crust is never released — memory leaks for the whole session

- **Breaks.** When an item is removed, only its main material is released; the ice crust around it stays in memory forever. The crust is disposed correctly only when the ice was broken — unbroken ones are eaten by every level's finale.
- **Where.** `src/app/40-items.js:443-448`; the correct pattern is right next door at `40-items.js:647`.
- **Cost.** Every unbroken block leaves its own copy of the geometry: from 9 KB to 1.1 MB (the football), ~150 KB on average, in both RAM and VRAM, until the session ends. Screen, score and levels are unaffected — this is accumulation that degrades a long session on a weak phone.
- **Fix.** Dispose the crust in item removal the same way ice breaking already does.
- **Size.** Four lines. Safe: every item's crust is its own copy, neighbours of the same type will not darken.

## 14. Hovering a collection card during a pause blanks it

- **Breaks.** The background «self-repair» of the spinning model claims the single canvas for itself once per frame, without checking that someone already holds it.
- **Where.** `src/app/85-hud.js:1093` (and the same problem in the copy at `:1180`).
- **Cost.** Open the menu during the seven-second charge and hover a collection card — the card goes completely empty until the mouse leaves. Worse on touch: tapping the same card again will not bring it back; only another card or closing the menu helps. Cosmetic; score and levels unaffected.
- **Fix.** Claim the canvas only when nobody holds it.
- **Size.** One line, no new state.

## 15. Pausing in the middle of the bowl break eats the whole celebration

- **Breaks.** Two timers in the bowl-break scene do not know how to wait for a pause.
- **Where.** `src/app/80-gameplay.js:523` and `:574`; the correct pattern is in the same file at `:593`. Also `:501`.
- **Cost.** Pausing inside a ~1.8 s window means the player hears the victory and surprise sounds behind the menu while seeing nothing, and after the pause the entire celebration — the flight to the centre, the burst, the treasure popping out — is gone: the pile simply disappears. Score and the win itself are correct.
- **Fix.** Wrap both bodies in the pause wait exactly as at `:593`.
- **Size.** Two one-line wrappers.
- **Honestly.** Partial: originally claimed as a loss of points — no points are lost, only the spectacle.

## 16. Resetting progress preserves the old level

- **Breaks.** On a progress reset the write to disk happens before the level number is zeroed — the old level comes back after a reload.
- **Where.** `src/app/77-save.js:505` (the zeroing sits after the write at `:502`).
- **Cost.** Does not touch players — the reset button lives in the debug panel, which does not open in production. The owner's cost: after a reset you continue from the old level with an empty wallet, and it does not heal itself.
- **Fix.** Move the level zeroing above the write.
- **Size.** One line.
- **Honestly.** Partial: the second half of the claim («the second device will pick up the old level») is not cured by this fix and is not caused by line order — it follows from the owner's own decision to take the maximum level on merge. Not proposed for change.

## 17. The bomb counts as a «live item» in the infinite-radius rule

- **Breaks.** The «stop punishing misses near the end of the level» mechanism counts the bomb as an ordinary item, although it pairs with nothing.
- **Where.** `src/app/60-access.js:81` — the only place in the code where the bomb is not excluded; it is excluded in all seven other counters.
- **Cost.** On a level with a bomb the relief switches on at 7 pairable items instead of 8 — one extra pair played at the strict radius, or one extra shake. The level is not lost, and no on-screen number changes.
- **Fix.** Add the exclusion and extend the comment (it currently mentions only stones and the treasure).
- **Size.** One line. The test follows by itself — it reads the same function.

## 18. The same type progress bar is drawn by two different formulas

- **Breaks.** On the win screen the bar counts from the start of the type's current level; on the collection card, from zero. Below 100 matches the formulas agree; above, they diverge.
- **Where.** `src/app/85-hud.js:2004` (the card) against `:2575-2578` (the win screen).
- **Cost.** After 100 matches on a type, the win-screen bar can be up to ~50 percentage points «emptier» than the same type's bar one screen away. No number is wrong anywhere: the card's caption («150/300») matches its own bar.
- **Fix.** **This is a fork, not a bug.** The bars answer different captions, and which reading is right is the owner's call. If one formula is wanted, it is one line at `85-hud.js:2004`.
- **Size.** One line, blocked on the owner's answer. Tests break in neither direction.
- **Honestly.** Partial: the divergence is real, but the canon did NOT settle it either way — the reference cited for it is about something else (a card animation).

## 19. The collection grid drops from 4 cards per row to 3 at 800 px

- **Breaks.** The mobile size ladder is cut off at 799 px and the desktop one starts at 800 — at the seam the number of cards per row goes down, not up.
- **Where.** `src/shell.html:3411` (the desktop rule), the mobile ladder's ceiling at `:3038-3039`.
- **Cost.** Between 800 and 1079 px (iPad Pro 11 portrait, a small desktop window) the collection shows 3 cards per row instead of 4: bigger cards, nothing hidden, one extra row of scrolling.
- **Fix.** **A fork.** The cheapest monotonic option is 4 columns in the desktop rule, making the ladder read 2/3/4/4/4/5. The alternative is raising the mobile ladder's ceiling above the phone range.
- **Size.** One number in one style rule + a line in the canon.
- **Honestly.** Partial: this is not an oversight — the 799 ceiling was set deliberately, per the owner's own wording «in the mobile version», and the comment beside it names the desktop ladder. The seam is simply written down nowhere.

## 20. Two telemetry events are never recorded — one shared cause

**One cause, two lost events**, hence one entry. Code that runs at load time reads a variable that does not exist yet; the error is silently swallowed by an empty catch.

- **Where.** `src/app/10-stage.js:51/65` — the `perf_low` event (weak device); `src/app/77-save.js:447` — the `stars_migrate` event (stars moved into the wallet).
- **Cost.** Zero for the player in both cases: picture quality on a weak phone still drops, stars are still credited and saved. The owner's cost is two events missing from analytics. And the stars migration «sticks» after the first run, so the event will not appear later either.
- **Fix.** Move both lines to where the variable already exists (or defer them by a tick). The canon already states this as a law — it is simply broken twice.
- **Size.** Two or three lines. The tests cannot catch this structurally: they call the same functions later, when the variable is alive.

## 21. Seven assertions in the suite have an «or empty» loophole

- **Breaks.** Seven assertions are written so that they pass if the measuring probe returned nothing. Today all five probes return live data on every run — the loophole is loaded but does not fire.
- **Where.** `test.js:7752` and six more identical lines.
- **Cost.** Zero today. Prophylaxis: if a rename or a timeout under load kills a probe in the future, the check prints «PASS». The disappearance would not be entirely silent — a neighbouring probe prints its own result.
- **Fix.** Add five one-line positive controls in the form already used in the file; drop the dead half of the condition in one line.
- **Size.** Six lines, zero risk — every flag is currently «live», the suite stays green.
- **Honestly.** Partial: the structure is confirmed verbatim, but «the hole is active» is not — it is latent.

## 22. One page in the tests talks to the live leaderboard server

- **Breaks.** The network stub is not installed on every page the tests create — one of them reads the production server.
- **Where.** `test.js:9403` (the page is created bypassing the stub at `test.js:127-132`).
- **Cost.** Zero. Four reads per run, read-only, nothing submitted — and per the owner's own decision, reading from local stands is harmless. The claimed consequence (a repeat of last year's console failure) did not hold: that page does not listen to the console.
- **Fix.** One line after `test.js:9403`, or wrap the context creation the way page creation is wrapped — which would pull in four more pages.
- **Size.** One line, or a five-line wrapper. Game code untouched.

## 23. The sabotage tool `lb-entry-break.js` half-misses the code

- **Breaks.** The tool that deliberately breaks the leaderboard entry point to prove the tests catch it looks for lines that no longer exist: 5 of its 8 anchors are stale, including the one it uses to check itself. On a healthy build it exits with an error.
- **Where.** `tools/lb-entry-break.js:103` and four more anchors; the targets moved to `85-hud.js:213`, `:311`, `00-config.js:1664/1670`, `shell.html:2558/2567`.
- **Cost.** Zero for the game and the tests. It is a development tool and nothing in the repo references it. Three sabotages of eight still work, and the tool prints «WENT STALE» itself.
- **Fix.** Either rebind the five lines or — if nobody needs the tool — add a dated «anchors went stale» line to its header so the next person does not lose an hour.
- **Size.** Five string replacements + one self-check rewritten; or one comment line.

## 24. In the pickup radius config, the old numbers are still marked «canonical»

- **Breaks.** The paragraph with the July numbers (0.9 / 0.75 / 1.1) carries no «superseded» mark, although the game has run on the owner's numbers 0.45 / 0.375 / 0.8 since 11 August.
- **Where.** `src/app/00-config.js:1106`; the live numbers are at `:309`, `:649`, `:673`.
- **Cost.** Zero for the player. The owner's cost is bounded by one edit cycle: if someone believes the paragraph and restores the old numbers, `test.js:2355` goes red immediately and names both the decision date and the right values in its message.
- **Fix.** One tombstone line exactly where the stale text is.
- **Size.** One comment, no code, no rebuild.
- **Honestly.** Partial: the text is genuinely misleading, but a silent regression is impossible — a test guards it.

## 25. `build.py` verifies nothing after the build

- **Breaks.** The build script concatenates the files and checks neither their count, nor their order, nor the result.
- **Where.** `build.py:18`.
- **Cost.** Zero today: all 27 files have unique two-digit prefixes, the concatenation order matches the numeric one, and a broken build fails the mandatory suite run instantly. A blank screen for players would need a badly named new file AND a skipped mandatory run at the same time.
- **Fix.** Optional — two lines of assertion (prefixes unique, order matches; the insertion marker occurs exactly once). Not worth its own task.
- **Size.** Two lines, build output unchanged, ~10 minutes.

## 26. The depth tint rebuilds and sorts a list every frame

- **Breaks.** The effect that darkens lower items builds a fresh list of every live item each frame and sorts it — including while the pile is asleep and nothing moves.
- **Where.** `src/app/10-stage.js:664`.
- **Cost.** **Practically zero — measured: ~10 microseconds per frame at 180 items, 0.06% of the frame budget.** Not one dropped frame, not one on-screen error.
- **Fix.** **Do not fix this as «an optimisation».** Only if someone is editing that file anyway — recompute the list every 500 ms, as the neighbouring camera scan already does.
- **Size.** Five lines, no effect on balance or tests.
- **Honestly.** Partial: the mechanism is confirmed, the claimed performance impact is not.

## 27. Two dead variables and one stale sentence in the performance instrumentation

- **Breaks.** The frame profiler computes two values that go nowhere, and a comment references a function that does not exist.
- **Where.** `src/app/99-main.js:981`; the sentence is in `src/app/50-physics.js`.
- **Cost.** Zero. Developer instrumentation.
- **Fix.** Delete the two variables and the stale sentence.
- **Size.** Minutes.
- **Honestly.** Partial: the second half of the claim — «the most expensive part is hidden inside the HUD line» — is refuted: the expensive part (accessibility on a hard level) was separately measured and fixed, and after the fix a hard level equals an easy one in time. The claim quoted numbers from BEFORE the fix.

## 28. The suite does not print its verdict line when a run is cut short

- **Breaks.** If a run crashes, the summary line «SUITE:» is not printed.
- **Where.** `test.js:15238`.
- **Cost.** Zero. The cause of the abort is already at the end of the log with an exact line number, and every red result is printed as it happens and is not lost.
- **Fix.** **Do not fix.** The wrapper requires re-indenting 15 200 lines, which would bury any parallel edit in that file and conflict with every direction working in it. Not worth one summary line. And it would not survive a hard kill (`kill -9`) anyway, which is the most common case.

## 29. The emergency top-up ceiling is too small only in a synthetic scenario

- **Breaks.** The cap on simultaneous emergency top-ups (90) is theoretically too small for very deep levels.
- **Where.** `src/app/50-physics.js:120`; the test is pinned at level 41 (`test.js:3430`).
- **Cost.** Practically zero. It needs one «unpaired» item of every type at once — but items always pour in pairs and matches preserve parity, so 67 unpaired cannot be assembled in real play. Even if hit: a few extra items appear at the rim during an already-won finale.
- **Fix.** Optional — raise the ceiling to ~130, or move the test check to level 88. Under no circumstances «trim» the type ladder — that route was measured and is 4× worse.
- **Size.** One constant, or one number in a test.
- **Honestly.** Partial: the arithmetic is right, the scenario is synthetic.

---

## (a) Repeating mistakes — worth writing down as rules

1. **Code that runs at load time reads a variable from a «later» file, and the error is eaten by an empty catch.** Finding 20 (two cases). The law is already in the canon — it is simply broken twice. Rule: a catch that logs nothing hides exactly these errors; either do not leave empty catches, or do not run such code at load time.
2. **The data that identifies a player drifts apart: one part travels to the cloud, the other stays in the browser.** Finding 3, door A. Rule: everything that identifies a player (id, signing key) must travel together and merge by one rule.
3. **A server refusal is handled as «oh well»: no retry, no message.** Findings 1, 3 (both doors), 5. Rule: every «no» from the server needs either a recovery branch or a sign visible to the player. A silent refusal is a refusal nobody will ever find.
4. **A new path copies someone else's «tail» but not its bookkeeping marks.** Findings 2 (the timestamp), 15 (the pause wait), 11 (the ad slot name). Rule: if a tail in a file has a mandatory mark, make one shared helper instead of repeating it by hand in nine places.
5. **Two decisions taken separately compensate for the same time twice.** Findings 10 (idle timer + ad pause), 9 (the frame limiter designed for exactly two display rates). Rule: any time compensation must have exactly one owner, named in a comment.
6. **Superseded numbers and stale anchors are left without a tombstone where people look at them.** Findings 24, 23, 27. The canon already states this rule («the tombstone goes in the OLD place, not only in the new one») — it is systematically not followed.
7. **An assertion with an «or empty» loophole, and a negative claim without a positive control.** Finding 21. The canon states this twice; the suite breaks it seven times.

## (b) Verified healthy — the next session need not re-check these

- **There is NO double payout of the early bank after a reload.** Refuted: level generation zeroes both the score and the bank (`40-items.js:823` and `:838`), and the run score does not survive a reload — after a reload a new, actually played run is paid.
- **The live pickup radius numbers are pinned by a test** (`test.js:2355`) — the July values cannot be restored unnoticed.
- **The concatenation order is safe**: 27 files in `src/app`, all prefixes two-digit and unique, alphabetical order matches numeric.
- **The five measuring probes in the tests return live data in 5 runs out of 5** — the «or empty» loopholes are latent, not active.
- **The ice bug cannot cost a star**: frozen items are excluded from the threshold calculation (`99-main.js:262`).
- **Purchases are never lost**, even on total progress loss — restorePurchases returns them every start.
- **Touch camera drag is unaffected** by finding 8 — pointer capture happens there by itself.
- **The leaderboard never blocks play** (`server/leaderboard/src/index.js:184-186`) — every leaderboard finding costs a rank, never gameplay.
- **The bomb and the ice block are correctly excluded from every other counter** — `60-access.js:81` is the only omission.
- **The expensive part of «accessibility» on a hard level is already fixed and measured**: after the fix a hard level's p95 is 34.9–35.6 ms, the same as an easy one. Frame timings for draw, particles and the HUD are collected, and the frame «head» is derived from total work time.
- **The depth tint is measured** — ~10 µs per frame; it is not a source of drops.
- **The leaderboard cron budget was computed in advance** (`docs/LEADERBOARD-OWN.md:88-95`) — do not re-check it wholesale; the only gap is the 180-day retention against an estimate made «by active players».
- **Duplicated boilerplate when model modules are regenerated** — a false alarm: the canon describes this trap three times and prescribes the cleanup, and the concatenation order makes `39-sport.js` the winner, not the file named in the claim.
