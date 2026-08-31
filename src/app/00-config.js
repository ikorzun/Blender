// ===== 00-config: all gameplay and geometry constants =====

// The mixer glass: tall, slightly widening towards the top; the mass fills ~85%,
// there is headroom above, and above the rim the physics continues as a CYLINDER
// of the rim radius — items cannot leave the glass even during a shake
const FUNNEL = { R0: 2.4, R1: 4.1, H: 9.2 }; // ×1.15 to the radii (the owner's spec: "the blender is bigger")
const SLOPE = (FUNNEL.R1 - FUNNEL.R0) / FUNNEL.H;
// ⛔⛔ THE BONUS LEVEL ("THE SHOWCASE") WAS CUT OUT OF THE PRODUCTION BUILD ON
// 2026-08-18 BY THE OWNER'S WORD: "remove the bonus level from the game, keep it
// in a separate build. Remove all mentions and code of the bonus level from the
// production build too".
// ⚠️ THIS IS NOT A CANCELLATION OF THE FEATURE, IT IS A RELOCATION: all the code is
// intact in the branch `claude/bonus-standalone` (head 870ab5c) and in the separate
// build `bonus.html`. To bring it back into production — merge that branch; nothing
// has to be written from scratch.
// ⚠️ WHAT STOOD HERE: ~30 `BONUS_*` constants (period, round time, refill,
// drain, box geometry, packing lattice, ceiling on the number of kinds, camera frame,
// bottom padding) and the flags `bonusNow`/`bonusArmed` with `isBonusLevel`/`bonusByPeriod`/
// `armBonus`. None of them exist in the production build any more — this is checked
// by the guard "SHIPMENT WITHOUT THE BONUS LEVEL" (test.js): it reads the BUILD and
// searches BY FORM — any call `*bonus*(` and any `BONUS_*` constant.
// ⛔ IT CHECKS CODE, NOT PROSE: the word "showcase" is also carried by the live
// multipliers panel, and "bonus" by the fire, the treasure and the reward for an ad.
// The comments were cleaned out by hand, there is no guarantee about them.
// ⛔ DO NOT CONFUSE WITH FOREIGN ONES: `SURPRISE_BONUS`, `SURPRISE_LEVEL_BONUS`,
// `STAR_LEVEL_BONUS`, `FIRE_BONUS_MULT` — different mechanics, they stay.
const FLOOR_REST = 1.15; // items lie above the blade zone (the blades are right at the bottom, visible through the glass)
const PAIRS = 90;            // CEILING: the mass fills the glass ~85%
// LEVEL SIZE PROGRESSION (testers' feedback via the owner 2026-08-05:
// "for an easy level the number of objects has to be reduced, make a
// progression across levels"). A measurement BEFORE the fix showed there was no
// progression at all: levels 1-3 used the shortened table 64/71/78 pairs, and from
// level 4 on it was straight to the ceiling of 90 pairs (182 items) and then a
// plateau up to level 40.
// Now: start at 40 pairs (80 items), +5 pairs per level, ceiling 90 pairs
// (180) at level 11. The first level is 38% easier than before.
const PAIRS_START = 40, PAIRS_STEP = 5;
function pairsForLevel(lv){
  const n = (typeof lv === 'number' && lv > 0) ? lv : 1;
  return Math.min(PAIRS, PAIRS_START + (n - 1) * PAIRS_STEP);
}
// ⚠️ 22 -> 26 (the owner's word 2026-08-30: «obyekty chut-chut tyazhelee, chtoby bystree
// padali»). Mass does not change fall speed in the solver — gravity is THE weight knob; +18%
// shortens a fall by ~8.5% and firms the whole feel. The toss got its own x1.5 in performShake
// in the same word. MAX_FALL (the anti-tunnel terminal cap) is deliberately untouched.
const G = 26;
// DENOMINATION ×10 (the owner's decision 2026-07-24 — «divide, denominate everything»): we
// put score/10 into the wallet, the Boost/unlock prices are in the same small units. If the
// scope is ever adjusted — the fix must land BEFORE the se record is finalized.
// ⚠️ MOVED TO THE TOP OF THE BALANCE BLOCK 2026-08-23-d so the constants below can be written
// in the PLAYER'S units. It used to live a hundred lines lower, which is exactly why the
// balance table of 2026-07-22 was never re-based behind it.
const SCORE_DENOM = 10;
// ⛔⛔⛔ **ONE UNIT FOR THE WHOLE BALANCE: `PT` IS ONE POINT AS THE PLAYER SEES IT** (the
// owner's word 2026-08-23-d, verbatim: «stop thinking about the denomination, it has already
// happened and we count points on the basis of it»).
// ⚠️⚠️ EVERY SCORE NUMBER BELOW IS NOW WRITTEN IN HIS UNITS AND MULTIPLIED BY `PT` ONCE. Read
// `10 * PT` as «ten points», not as a hundred of something. Before this, the numbers in this
// file were RAW and the screen divided them by ten, so the owner's «a miss costs 10» rendered
// as «−1» for a month and both sides quoted different numbers at each other in good faith.
// ⛔ DO NOT WRITE A BARE NUMBER INTO A SCORE CONSTANT AGAIN. If a value is not `n * PT`, it is
// either not a score or it is a bug.
const PT = SCORE_DENOM;
const MATCH_SCORE = 1 * PT;  // a group of N pays MATCH_SCORE·N·(N−1) → a pair = 2 points
// NEW BALANCE TABLE (the owner's spec 2026-07-22, via the dispatcher):
// a miss got more expensive 7 -> 10; level 1 — NO score penalties at all;
// levels 1..SCORE_CLAMP_LEVELS — the score is clamped at zero from below (the grind −20
// stays, but it does not push a beginner into the negative); the fish gets more expensive with level.
// The single point of application is scorePenalty (80-gameplay).
// ⛔⛔ 10 → 100 (the owner's word 2026-08-23-v: «the cost of a mistake is STILL −1 and not
// −10»). ⚠️⚠️ THIS IS NOT A TENFOLD TIGHTENING INVENTED HERE — IT IS A RE-BASING INTO THE
// UNITS HE ACTUALLY SEES, and the root cause is a date order in this very file: the balance
// table above is his spec of 2026-07-22 («a miss got more expensive 7 → 10»), while the ×10
// DENOMINATION (SCORE_DENOM, «divide, denominate everything») arrived on 2026-07-24 and
// nobody re-based the penalties behind it. Every number on screen is `floor(score/10)`, so a
// raw 10 has been popping up as «−1» ever since — his spec said ten and the player saw one.
// ⚠️ THE PRICE, IN THE UNITS OF THE SCREEN, NAMED BECAUSE IT IS A REAL BALANCE MOVE: a pair
// pays 10·2·1 = 20 raw = 2 shown, so a miss now costs FIVE PAIRS where it used to cost half of
// one. Combined with 2026-08-23-a — where a tap on a pairless item became a full mistake —
// searching the pile by poking is now genuinely expensive.
// ⚠️ TWO CONSUMERS RIDE ALONG AND NEITHER WAS NAMED BY HIM: `penalizeDouble` (the early tap on
// an ice block) is 2×, so it becomes 20 shown; and the paid ×5 booster multiplies penalties
// too (his own decision 2026-07-28), so one miss under it reads −50.
// ⛔⛔ THE PARAGRAPH THAT USED TO STAND HERE WAS STALE AND CONTRADICTED ITS OWN NEIGHBOUR
// TWENTY LINES BELOW — cleared 2026-08-24. It said «MIXER_PENALTY was NOT re-based, the
// grinder still takes 20 raw = 2 shown», while `MIXER_PENALTY = 20 * PT` (i.e. 20 SHOWN) sits
// right there with a tombstone of its own re-basing. It was written in the hour between the
// two edits of 2026-08-23-d and outlived its truth by a day.
// ⚠️ THE LESSON IS THE PROJECT'S OWN, EARNED AGAIN: when you edit a number, grep the file BY
// THE WORD and not only by the symbol — one's own text next door is the first reviewer.
const MISS_PENALTY = 10 * PT;   // ten points, as he sees them (2026-08-23-v/d) — THE FIRST one
// ⛔⛔ SINCE 2026-08-24 THE PRICE OF A MISTAKE IS A LADDER, NOT A CONSTANT (the owner's word:
// «make each successive mistake cost +1 more. The first −10, the second −11 and so on»).
// `MISS_PENALTY` stopped being «the price of a miss» and became «the price of the FIRST miss»;
// everything that wants the price must go through `missPenaltyFor()`.
// ⚠️⚠️ THE LADDER RESETS PER LEVEL, AND THAT IS NOT A CHOICE OF MINE — IT IS WHERE THE COUNTER
// LIVES: `stats` (with the counter in it) is REBUILT by `genLevel` (40-items), so the ordinal
// starts from one on every level by construction. Should he ever want it to run across a whole
// session, the counter has to move out of `stats` first — it is not a number to tweak here.
// ⛔ AND SINCE 2026-08-24-b THAT IS NO LONGER THE ONLY RESET — a merge zeroes it too, see below.
// ⚠️ THE FUNCTION IS PURE AND TAKES THE ORDINAL — it does NOT read `stats` itself. That is what
// lets a guard call the very function production calls, on any ordinal, without a live game;
// a guard recomputing `base + step*(n−1)` on its own side would be checking its own arithmetic.
// ⚠️ THE ORDINAL IS 1-BASED and both call sites increment FIRST, so they pass the ordinal of the
// miss being charged: first miss → n=1 → 10.
// ⛔ THE COUNTER USED TO BE `stats.misses` AND IS NOW `stats.missRun` (2026-08-24-b) — see below.
// ⛔ THE GRINDER DOES NOT CLIMB: `MIXER_PENALTY` is not a mistake, he named the mistake only.
//    ⛔⛔ AND THE CONSEQUENCE THAT STOOD HERE — «the grinder is 20, so from the ELEVENTH miss a
//    mistake costs more than letting the mixer eat a pair» — DIED THE SAME DAY IT WAS WRITTEN:
//    the ceiling of 2026-08-24-b is 15, so a single mistake never overtakes the grinder again.
//    The ICE TAP still can, at 2× the rung — up to 30.
const MISS_PENALTY_STEP = 1 * PT;   // +1 point for each further mistake of the same level
// ⛔⛔ THE LADDER HAS A CEILING AND IT WRAPS (the owner's word 2026-08-24-b: «the maximum cost
// of a mistake per round reaches −15 and then resets to −10»). Six rungs — 10, 11, 12, 13,
// 14, 15 — and the mistake AFTER a 15 costs 10 again, climbing anew. The cycle length is
// DERIVED from the three constants, not written as a literal: change the ceiling or the step
// and the wrap moves by itself.
const MISS_PENALTY_MAX = 15 * PT;   // the top rung, as he sees it
// ⛔⛔ AND THE LADDER IS NO LONGER DRIVEN BY `stats.misses` (2026-08-24-b): «the cost of a
// mistake also resets to the base if the player has collected at least one pair». The ordinal
// is now `stats.missRun` — a RUN of mistakes since the last successful merge — incremented in
// the same two places as `misses` and zeroed at the head of `doMatch`. `stats.misses` keeps its
// old meaning untouched: the turbo rules read it as a delta and a merge must NOT launder those.
function missPenaltyFor(n){
  const rungs = Math.round((MISS_PENALTY_MAX - MISS_PENALTY) / MISS_PENALTY_STEP) + 1;
  return MISS_PENALTY + MISS_PENALTY_STEP * (Math.max(0, (n | 0) - 1) % rungs);
}
// ⛔⛔ THE COLOUR OF A MISTAKE IS ONE VALUE SINCE 2026-08-25, AND THAT IS WHAT HIS WORD
// REQUIRES: «if the player misses, at that moment the total score must redden (THE SAME
// COLOUR AS THE MISS)». It used to be written as the literal `#e5484d` at three pop sites;
// «the same colour» stated over four copies is a promise, not a fact.
// ⚠️ THE FOURTH COPY IS UNAVOIDABLE AND IT LIVES IN CSS (`#score.miss { fill:#e5484d }` in
// shell.html) — a stylesheet cannot read a JS const. It is TIED BY A GUARD instead: the suite
// reads the computed fill of the reddened score and `__game.missColor()` and asserts they are
// the same string, so a divergence goes red instead of going unnoticed.
const MISS_COLOR = '#e5484d';
// how long the score stays red after a mistake — long enough to be seen, short enough not to
// still be burning when the next tap lands
const SCORE_MISS_MS = 520;
const SCORE_NO_PENALTY_LEVELS = 1; // levels <= N: score penalties are off
const SCORE_CLAMP_LEVELS = 5;      // levels <= N: the score does not go below zero
const MIXER_PERIOD = 2.0;    // seconds between "ground up" pairs (PUNISHMENT)
const FINALE_GRIND_MS = 220; // ms between leftovers in the FINALE (was 500; the owner's
// word 2026-08-05 "the blender must grind the leftovers faster")
// ⛔⛔ 2 → 20 POINTS PER PAIR (the owner's word 2026-08-23-d: «the mixer eats 20 points per
// pair»). ⚠️ THE LITERAL DID NOT MOVE — ITS UNIT DID: it used to be 20 RAW, i.e. 2 points on
// screen, and the owner's number has always been twenty. This is the same re-basing that
// MISS_PENALTY got, on the constant right beside it.
// ⚠️ THE ORDER IS RESTORED BY IT: letting the grinder eat a pair (−20) is now twice as bad as
// a mistake (−10), which is how it read before the denomination silently halved one of them.
const MIXER_PENALTY = 20 * PT;   // score penalty per pair
const SURPRISE_BONUS = 15 * PT;  // the golden fish from the bottom: +15 points + 0.5×level
// ⚠️ HALF A POINT PER LEVEL, AND IT IS WRITTEN AS SUCH RATHER THAN ROUNDED: the sum is
// rounded once, where it is applied, so the half-points accumulate honestly across levels.
const SURPRISE_LEVEL_BONUS = 0.5 * PT;
// ===== ACCUMULATION BY TYPE (the owner's spec 2026-07-22, via the dispatcher:
// "if you combined [many] objects, then their multiplier by default
// increases... with respect to each object"). The thresholds are approved as the series
// ×2+100: 100/300/700/1500/3100/6300... = 100·(2^n−1) — the first tier
// happens in the first session (~level 7). The score multiplier of a type = 1 + 0.25×tier.
// The counters live in the save (77-save, Save.ac), the application — doMatch and the pair-score.
// ===== SINGLE BALANCE (the owner's finalization 2026-07-24: "score=stars=balance=
// leaderboard"; CANCELS the "rating delta" model of 2026-07-23). The reward for a win
// = the ACCUMULATED game score ÷10 into the wallet (bankLevelScore, 77-save), once per
// level — it cannot be farmed (the game is linear, there is no replay). The wallet is se/ss (+tu top-up),
// the rating stars[lv] is separate (quality, not spent).
// ⚠️ STAR_AWARD/STAR_LEVEL_BONUS — ARE LEFT ONLY for the grandfather migration
// of old saves (starAward in 77-save seeds the starting balance from the rating);
// they NO LONGER compute the reward for a win (the awardStarsForWin function was removed).
const STAR_AWARD = [0, 100, 250, 500]; // migration: for 1★ / 2★ / 3★
const STAR_LEVEL_BONUS = 10;           // migration: + STAR_LEVEL_BONUS × level number
// BOOST — buying an accumulation tier of an item for stars (the owner's decision
// 2026-07-23 "yes"). The price doubles with every purchased tier: the exponent
// itself brakes the buy-out without needing a separate cap.
// ⚠️ TABLE №2 IS APPROVED (the dispatcher by the owner's delegation 2026-07-24)
// for the new earn of ~700 denominated/level: BASE 2000 (was 1500 — that was for the dead
// rating income). The ladder 2000/4000/8000/16000/32000, the first boost ~2.9
// levels, a full max of a type (0-4) = 62 000 (~88 levels). The "Boost 11k" mockup is
// illustrative, not a price. The price comes from boostTier (purchased), NOT accTier — that is fix.
const BOOST_PRICE_BASE = 2000, BOOST_PRICE_MULT = 2;
// ⚠️ CAP ON PURCHASED TIERS (code review fix 2026-07-24): the max boost of ANY
// type = BOOST_TIER_CAP purchased = 2000·(2^5−1) = 62 000, UNIVERSALLY.
// ⚠️ Previously this number was justified by "the Mega pack anchor" — there are NO packs
// ANY MORE (2026-07-27), the anchor is re-anchored to the ladder itself: 62 000 = a full buy-out
// of one type, ~88 levels of play at an income of ~700/level. Without it an unlocked, never-played type (accCountTier=0) could
// be boosted by 9 tiers = ~1 022 000 (16× the anchor), because the shared
// cap accTier=9 did not limit PURCHASES for a type with no earned tiers.
// A played favourite is "topped up" more cheaply (earned tiers are free), but
// the purchase ceiling is the same. Boost is available only for an UNLOCKED type (the gate is in
// boostPrice/buyBoost).
const BOOST_TIER_CAP = 5;
// ⚠️ STARS FOR ADS WERE REMOVED (the owner's word 2026-07-27, following the packs):
// stars are given ONLY by the game; the paid thing is a temporary bundle multiplier that
// multiplies what the game earns. Ads for stars would contradict the model.
// The constants REWARD_STARS_PER_AD/REWARD_DAILY_CAP no longer exist (they were never
// implemented either — there were no calls).
// ⚠️ THE REWARDED PLACEMENTS FOR SHAKE AND HINT ARE ALIVE AND UNTOUCHED: they give
// a RESOURCE, not stars; the bundle's no-Ad window still does not suppress them.
// ⚠️ IAP STAR PACKS WERE REMOVED (the owner's word 2026-07-27: "we have no notion
// of a star pack"). A direct purchase of stars does not exist and is not planned —
// the only paid star mechanic is the TEMPORARY MULTIPLIER of a bundle
// (STAR_BUNDLES below): it multiplies what the player EARNS BY PLAYING.
// The constant STAR_PACKS is not "asleep", it no longer exists — do not bring it back without
// the owner's word. For the history of the calculations see docs/STARS-STORE-ECONOMY.md (§packs is marked
// CANCELLED).

// ===== SINGLE BALANCE (the owner's finalization of the model 2026-07-24: "the score and
// the stars are one and the same, everything earned within a game level is
// the balance; it is spent on unlocking things, on boost, and it affects the leaderboard").
// BALANCE = the accumulated game score (denominated) − spending. Inside there are
// two monotonic counters se/ss (anti-dupe), balance = se−ss is shown
// in the chip, in the menu and in the leaderboard.
// UNLOCK A TYPE IN THE COLLECTION AHEAD OF TIME — LEVEL-SCALED (matrix #9, approved by the dispatcher
// 2026-07-27, docs/STARS-STORE-ECONOMY.md §v3). Price = BASE + PER_LEVEL·level:
// L1=1000 ... L50=10800. Linear to match the linear income (~700/level) → it keeps a dent of
// ~29% of the bank at any level, "hard but achievable". SAFETY against a spike is
// structural (the spawn gate), not the price; the owner may move BASE/PER_LEVEL
// to taste. ⚠️ TRIPWIRE: if we introduce an early spawn of a purchased type — move the price
// to a distance-based one, base(L)+150·(d−1) (see §v3).
const TYPE_UNLOCK_BASE = 800;
const TYPE_UNLOCK_PER_LEVEL = 200;

const ACC_MULT_STEP = 0.25;  // +25% to a type's score per tier (approved)
const ACC_TIER_CAP = 9;      // ceiling of tiers (×3.25; the 9th threshold = 51 100 — practically unreachable, the cap keeps the formula under control)

// Difficulty progression across levels. Empirical: deadlocks depend on the NUMBER OF TYPES
// (fewer types = more copies = more matches on the surface), the radius
// affects it weakly (bot measurement: 4-9 shakes at any radius 2.5-3.2).
// ⚠️⚠️ 3, NOT 9 (the owner's word 2026-08-11: "on the first level I want only
// 3 first things, each new level +1 thing"). The rule is the same —
// `LEVEL_TYPES_MIN + (level − 1)`, only the start changed.
// ⛔ THIS IS A DIFFICULTY LEVER, NOT COSMETICS: the number of types is the MAIN regulator
// (bot measurement: deadlocks depend on it, the radius affects it weakly). The first levels
// will become noticeably easier, the whole pool opens 6 levels later (117 instead of 111).
// ⚠️ The showcase panel requires at least VIT_MAX=3 slots — exactly that many exist on level 1,
// with nothing to spare. If it drops lower, the panel's height will shift, and the toast anchor
// reads its rect.
const LEVEL_TYPES_MIN = 3;                          // types on level 1 (+1 per level, ceiling TYPES.length)
// idle time before the mixer switches on — by DIFFICULTY (the owner's spec 2026-07),
// the ramp across levels was removed: the difficulty progression is carried by the number of types.
// ⚡ 2026-07-27 (the owner's spec after a playtest, a RETUNE of the previous ÷3): Easy 15,
// Hard 10. The grind bail-out gives 15 seconds to think on Easy and 10 s on Hard. (It was
// 30/10 before the ÷3, then 10/3.3; 3.3 on Hard turned out to be too nerve-racking.)
const MIXER_IDLE_EASY = 15, MIXER_IDLE_HARD = 10;
// FREE SHAKES — FLAT 3 ON ANY LEVEL (the owner's final decision
// 2026-07-27-v: "8 free ones is a lot, we do sell them for ads;
// let it stay 3 everywhere, and every next one only for watching an ad").
// ⚠️ THE LADDER 3+⌊lv/10⌋ WAS INTRODUCED AND IMMEDIATELY CANCELLED (v149→v150): a META measurement
// showed under-supply from ~level 15 (7-11 dry episodes against 5), but
// the owner closes the gap NOT with a free supply, but with ads — this is his
// monetization decision, not a balance oversight. The deficit is intentional.
const SHAKES_BASE = 3;
// ⚡ 2026-07-30, THE OWNER'S SPEC "raise the shakes" — THE LADDER IS BACK.
// ⚠️ THIS IS A REVERSAL OF HIS OWN DECISION OF 07-27 (flat 3, "we sell them for ads"),
// made deliberately and after I named him the price: every free
// shake is one unwatched video. Do not "fix it back" without a new word.
// THE NUMBERS COME FROM MEASUREMENT, NOT OUT OF THIN AIR: a META measurement showed a need for 7-11 dry
// episodes from ~level 15 against 5 available, and the diagnostician of 2026-07-30 measured
// the consequence — 28-48% of the level's time the player is without agency, and 45-55% of the level's
// score is lost by a non-paying player to grinds. The ladder closes about HALF
// of the gap: the rest is still behind ads, the monetization is not zeroed out.
// Step /6 and cap 8: lv.1-5 → 3, lv.12 → 5, lv.24 → 7, lv.30+ → 8.
// ⚠️ THE NUMBER WAS PICKED FROM A MEASUREMENT OF THE NEED, BUT THE LADDER ITSELF WAS NOT
// CHECKED BY THE BOT — if the owner wants precision, an A/B with the patient bot on
// levels 15/20/40 is needed, as we did for the shake economy before.
// SURFACE-LEVEL HINT (testers' request via the owner 2026-08-03:
// "she definitely did not pick objects deep inside the bowl, only as a last resort"):
// a group counts as "the top layer" if ALL its items are no deeper than this
// distance from the top of the pile; the top ones compete as before (size,
// proximity), the deep ones form a separate lower echelon (the last resort).
const HINT_SURFACE_DEPTH = 1.6;
const SHAKES_STEP = 6, SHAKES_CAP = 8;
function freeShakesFor(lv){
  const n = (typeof lv === 'number' && lv > 0) ? lv : 1;
  return Math.min(SHAKES_CAP, SHAKES_BASE + Math.floor(n / SHAKES_STEP));
}
// ⚠️ AD SHAKES — NO LIMIT (the owner's spec 2026-07-28: "every next
// one only for watching an ad"; it was 2 per level). As many videos as
// you watched — that many shakes. The cap was lifted deliberately: shakes are sold
// through ads, and limiting impressions = limiting revenue.
// ⚠️ A CONSEQUENCE THAT HAD TO BE CLOSED SEPARATELY (99-main): the deadlock bail-out
// used to wait for adShakes===0 — with an unlimited supply that condition NEVER happens,
// and a player who does NOT watch ads would hang forever (no grind, no defeat).
// Therefore a deadlock is now computed from OWN resources (free + purchased),
// and an ad does not count as agency for the bail-out: it is always available, but
// it requires the player's consent.
const AD_SHAKES_PER_LEVEL = Infinity;
// Starting downward speed of the topped-up items (0 = the previous free
// fall). The live knob is CFG.dropV0, the reasoning for the choice is there too.
const DROP_V0 = 8;
// ===== ENTRY INTO TURBO WAS REPLAYED (the owner's spec 2026-07-28) =====
// It was: the entry was marked by LIGHTNING between items. Now: the lightning is HIDDEN, and at
// the moment turbo starts the whole pile IS TOSSED UP, "as if it were a shake at the start".
// ⚠️ THE LIGHTNING IS NOT CUT OUT, IT IS SWITCHED OFF BY A FLAG (a direct requirement "hide it for now,
// don't cut it out of the code"): boltFX, the branching, the material pool and the boltProbe hook
// are alive; TURBO_BOLTS=true brings them back instantly, without rebuilding the logic.
const TURBO_BOLTS = false;
// The toss at the entry into turbo — the same impulse as a shake (performShake),
// WITHOUT spending charges: this is a visual-physical accent, not a free
// shake resource. Charges/caps are not touched at all.
const TURBO_SHAKE = true;
// COMBO BOOST of the radius (the owner's spec 2026-07): a group of 3+ in one tap OR
// a second merge within the chain window -> the radius goes up to COMBO_RADIUS for
// COMBO_MS; every match during the fever EXTENDS the window (otherwise the fever dies out
// in the middle of a chain and is annoying)
// ⚠️⚠️ CEILING 1.1 → 0.8 (the owner's spec 2026-08-11: "when matching, increase
// AT MOST UP TO 0.8"). This is the FOURTH consecutive nerf of one number: 3.5 by centres →
// 2.0 → 1.5 → 1.1 → 0.8, and all four for the same reason — "too easy".
// ⛔ The invariant "the ceiling is ONE EVERYWHERE, including the Power chain" (spec 2026-07-21) is
// untouched: the chain still runs into the same value instead of getting its own.
// ⛔ And the endgame ∞ (<=8 alive) is still NOT limited by the ceiling — it stands
// before all the branches in updateMatchRadius, it is anti-frustration, not a boost.
const COMBO_RADIUS = 0.8, COMBO_MS = 4000, COMBO_CHAIN_MS = 1500, COMBO_SCORE_MULT = 2; // GAP CEILING 0.8 EVERYWHERE, including the Power chain
// ===== THE TEMPO PACKAGE (the owner's spec 2026-07-31: "there is not enough drive, especially
// if items are easy to combine and are close" -> "let's try tempo, but
// show it not through a bar, but through the mixer's eyes"). Three parts:
// 1) THE SERIES WINDOW LEAKS AND SHRINKS with its length (instead of the flat COMBO_MS=4000
//    — that one stays as a history constant, the window is computed by seriesWindowMs);
// 2) THE MULTIPLIER LADDER ×2 -> ×3 (from the SERIES_X3_AT-th match) -> ×4 (in turbo) —
//    instead of a flat ×2: easy matches become retention fuel;
// 3) the display — through the EYES (the Interface zone, the API __game.series()) + sound: the pitch
//    of the "bloop" rises with the series, and near the edge of the window there is an anxious tick (SERIES_TICK_FROM).
// ⚠️ DO NOT INTRODUCE A BAR — a direct ban by the owner ("not through a bar").
// ⚠️ THE BASE = THE PREVIOUS 4000 DELIBERATELY (the first iteration of 3000 dropped TWO foreign
// guards calibrated for the old window — the run came out patchy): entering a series is
// as soft as before, the COMPRESSION comes with the length — tempo is demanded where
// the drive is, and early pairs are not penalized.
const SERIES_WIN_BASE = 4000; // the window after the 1st match of a series, ms
const SERIES_WIN_STEP = 150;  // −ms for every following match of the series
const SERIES_WIN_MIN  = 1800; // the floor of the window — a tempo that is demanding but attainable
const SERIES_X3_AT    = 6;    // from this match of the series the score is ×3
const SERIES_MULT_X3  = 3;
const SERIES_MULT_CHAIN = 4;  // in turbo (chainUntil) — the top of the ladder
const SERIES_TICK_FROM  = 800; // ms before the end of the window from which the alarm ticks
const ANIM_RESCUE_MS = 1200; // the rescuer of stuck removals (99-main): the match
                             // animation lives ~0.16s + a 150ms timer — anything
                             // that is animating longer than that is stuck and gets finished off
function seriesWindowMs(len){
  return Math.max(SERIES_WIN_MIN, SERIES_WIN_BASE - SERIES_WIN_STEP * Math.max(0, len));
}
// the radius ramps up as a LADDER (the owner's tuning: "an instant 3.5 is too
// easy"): every match of a series adds +1 tier out of COMBO_STEPS, a miss knocks off
// COMBO_MISS_DROP tiers (down to zero = the series is out)
const COMBO_STEPS = 5, COMBO_MISS_DROP = 2; // 5 tiers: slower growth (nerf −20%)
// ⛔ CHAIN_RING_ENABLED was cut out by the cleanup of 2026-08-12: the flag stayed WITHOUT THE FEATURE —
// the charge-disc code had long been deleted, and "the code is alive" in the comment was untrue.
// The owner's "we'll bring it back later" still refers to the feature; bringing it back means going through git history.
// CHAIN REACTION (the owner's spec 2026-07): a series of CHAIN_COMBO_AT matches
// -> for CHAIN_MS the radius covers the whole bowl and a pair is dropped in from above every CHAIN_DROP_MS;
// it goes out by timer OR after CHAIN_MISSES misses
// ===== v1 META (docs/DESIGN-ROADMAP.md, with protection adjustments) =====
const COIN_BASE = 20;        // coins for a win
const COIN_PER_SCORE = 50 * PT;  // +1 coin for every 50 points (combos are profitable)
const PRICE_SHAKE = 25;      // a shake for coins — ONLY after the rewarded cap
// HINT FOR AN AD (the owner's spec 2026-07-28, a lime "Ad" badge on the button):
// charges ran out → the button offers a video → +1 charge. The cap is PER LEVEL, like
// the shake's (level.adHints), NOT daily: a daily one requires server time
// (the INTEGRATION zone) — we do not drag that dependency in here.
const AD_HINTS_PER_LEVEL = 2;
// SCORE BOOSTER FOR MONEY (the "More Stars" screen, the owner's spec 2026-07-28).
// The mapping and the prices are APPROVED by the owner: short = burst, long = tempo.
// ⚠️ THE OWNER'S DECISION: the booster works ON EVERYTHING — the multiplier goes into the wallet,
// into the RANK (the boosted score is banked into se as is) and into the level's star rating.
// We are NOT building separate accounting (scoreBase) — the owner saw that x3/x5 give
// guaranteed 3★ and chose that deliberately. ⚠️ The field tu (fix A: what is purchased
// does not raise the rank) is KEPT in the save, but it HAS NO ACTIVE SOURCES
// since 2026-07-27: the packs were removed, and the booster, by the "works on everything" decision, goes
// through se. The field holds grandfather saves and the future — do not delete it.
// ⚠️ BUNDLES (the owner's mockups 783:95 / 785:112, 2026-07-28) — CANCEL the bare
// ladder $1.99/$3.99/$19.99: a tier carries a multiplier window + consumables + a window without
// ads. The multiplier↔time mapping is the same as before (short = strong).
const DAY_MS = 24 * 60 * 60 * 1000;
const STAR_BUNDLES = [
  { id: 'bundle5', usd: 4.90,  mult: 5, ms: 30 * 60 * 1000, shakes: 10, hints: 15, noAdMs: 1 * DAY_MS },
  { id: 'bundle3', usd: 9.90,  mult: 3, ms: 60 * 60 * 1000, shakes: 15, hints: 20, noAdMs: 3 * DAY_MS },
  { id: 'bundle2', usd: 19.90, mult: 2, ms: DAY_MS,         shakes: 50, hints: 30, noAdMs: 30 * DAY_MS },
];
// Clock slack: a time change/DST/drift must not kill a paid booster,
// but a rollback further back than the slack is treated as an attempt to extend it manually.
// ⚠️ THE CLOCK SLACK WAS REMOVED ENTIRELY — it was a HOLE, not a protection. A rollback EXACTLY
// within its bounds did not reach the re-anchoring, and the windows are stored with an ABSOLUTE
// stamp, so the remainder did not decrease but GREW. An adversarial run measurement: a 5-minute rollback
// every 5 minutes of play, 4 real hours — x5 is alive, the remainder is still the same 30.00 minutes,
// 0 burned → $4.99 bought an eternal x5 and an eternal ad-free account.
// ⚠️ A separate "amnesty" for honest DST/NTP is NOT NEEDED: the re-anchoring (boostNow)
// preserves the remainder AS OF THE LAST HONEST MEASUREMENT, that is, a rollback by itself
// neither takes anything from the player nor gives anything. Any threshold here =
// a free zone for a rollback, which is why there is no threshold at all.
const PRICE_SCOPE = 15;      // "Scope": highlight all available pairs for 5 s
// The star thresholds were raised (the owner's balance table 2026-07-22, "start at
// 1.5/2.1, calibrate it with the bot"): the pair-score now accounts for the accumulation
// multipliers (finalizeFill) — otherwise upgraded types would give 2★/3★
// automatically. Bot calibration 2026-07-22 (profiles: pairs without combos ~1.0,
// combos without series, series-based) — for the final values see the report in WORKSTREAMS.
const STAR2_K = 1.5, STAR3_K = 2.1; // thresholds for 2★/3★ relative to the pair-score
// ⛔ PAIRS_EARLY WAS CANCELLED by the pairsForLevel progression (2026-08-05): three
// "shortened" levels were the only size variation, after them came a
// plateau. The table is kept in history so that it is not reinvented from scratch.
// const PAIRS_EARLY = [64, 71, 78];
const CONTINUE_DROP = 10;    // Continue after a defeat: drop in extra items
// ⚠️⚠️ 1.7 → 1.3 BY THE OWNER'S DECISION 2026-08-11 (the complaint "on an iPhone 17 the
// framerate drops during the pour-in" + his own choice out of four options: "slow down the
// pour-in itself", the named corridor being 1.2-1.3).
// ⛔ THIS IS A PARTIAL CANCELLATION OF HIS OWN PREVIOUS SPEC "+30%", GIVEN TWICE. Do not read it
// as an oversight and do not silently restore 1.7: the reason is performance on a live device,
// not taste, and it is measured.
// MEASUREMENT (GPU via metal, CPU ×4, 390×780, lv.20 = 183 items, 4 layouts per
// arm): solver p95 18.9 → 12.8 (−32%), worst frame 31.9 → 28.5.
// ⚠️ THE FILL WAS VERIFIED SEPARATELY, AND THAT IS MANDATORY: the fall phase is limited by
// REAL time (`intro.t`), so slower physics catches the settling at a
// different stage, and the trim cuts at a lull — a different number of pairs would have gone through silently.
// 183 alive in all four layouts of each arm, the top of the pile 7.5-8.1 against
// 7.7-8.4 in the baseline (the red-line norm is 7.5-9.0), no extra rescues or wall protrusions.
// ⚠️ 1.2 WAS TRIED WITH THE SAME MEASUREMENT: solver 13.3, frame max 28.6 — indistinguishable
// from 1.3. 1.3 was taken as the smaller departure from the owner's previous spec.
// ⚠️⚠️ THE INTRO SPEED IS ONE KNOB FOR EVERYTHING (the owner's word 2026-08-15: "the sluggishness
// is the speed of the pour-in animation and of the turn around the bowl, let's try
// speeding everything up"). ⛔ THIS IS NOT A ROLLBACK OF THE PERFORMANCE DECISION, IT IS THE REMOVAL OF ITS CAUSE: the previous
// 1.3 was set for the sake of the frame on a weak device, and a measurement FROM HIS OWN PHONE
// (a screenshot, lv.3, DPR 1.5) gave 60 FPS, a worst frame of 17-19 ms and physics of 1-2 ms —
// there is headroom to spare, and the "sluggishness" turned out to be the ANIMATION SPEED, not the load.
// `INTRO_SPEED` multiplies ALL three parts at once: the fall speed of the items, the length
// of the pour-in phase and the camera fly-around. 1.0 is production; the knob `?intro=N` (0.4..3)
// exists so the owner can compare tempos right on his phone, without a build.
let INTRO_SPEED = 1.0;
try {
  const _i = new URLSearchParams(location.search).get('intro');
  if (_i != null){ const n = +_i; if (n >= 0.4 && n <= 3) INTRO_SPEED = n; }
} catch (e) {}
// physics during the intro; at INTRO_SPEED=1 this is 2.0 (was 1.3 before the speed-up)
const INTRO_TIME_SCALE = 2.0 * INTRO_SPEED;
// the length of the POUR-IN phase — in seconds, divided by the speed
const INTRO_DROP_MIN = 0.55 / INTRO_SPEED;   // early exit if the pile has settled
const INTRO_DROP_MAX = 1.0  / INTRO_SPEED;   // a hard limit of the phase
// ⚠️⚠️ THE FLY-AROUND WAS DECOUPLED FROM THE SPEED KNOB (the owner's word 2026-08-15: "I like the
// pour-in speed, but the fly-around needs to be restored, otherwise it is too fast"). Compressing it
// to 0.65 s was MY own addition to his "speed everything up" — he looked at it and separated
// one from the other: the pouring is fast, the camera turn is as before.
// ⛔ THE VALUE 1.0 IS HIS OLD SPEC ("a fly-around in 1 second"), not my
// pick; change it only by his word. `INTRO_SPEED` NO LONGER affects the fly-around —
// otherwise speeding up the pour-in would drag the camera along with it again.
// ⚠️ A separate knob `?orbit=N` (0.3..3 s) — to compare the fly-around on a phone
// without touching the pouring tempo.
let INTRO_ORBIT_S = 1.0;
try {
  const _o = new URLSearchParams(location.search).get('orbit');
  if (_o != null){ const n = +_o; if (n >= 0.3 && n <= 3) INTRO_ORBIT_S = n; }
} catch (e) {}
// Spread of item sizes. ⚠️⚠️ REVISED 2026-08-15 AFTER THE OWNER'S LIVE PLAY
// (verbatim: "let's make the spread start from level 20 and with a smaller
// percentage. And the minimum item size even by the last level must not
// be smaller than 70% of the item size on level 1. I played and because of the size
// collecting items becomes uncomfortable"). ⛔ CANCELS the previous numbers of the spec
// of 2026-07-21 (start from the 16th, step 4%/level, ceiling ±50%).
// WHAT EXACTLY CHANGED AND WHY EACH NUMBER:
//   • start at the 20th instead of the 16th — the first 19 levels the items are EXACTLY identical;
//   • step 2%/level instead of 4% — it accumulates twice as slowly;
//   • CEILING ±30% instead of ±50% — this is exactly his "not less than 70%": the spread is
//     symmetric (1 ± spread), so a ceiling of 0.30 gives a minimum of 0.70 and a
//     maximum of 1.30 of the base size. ⛔ A ceiling ABOVE 0.30 violates a direct
//     requirement of the owner — change it only by his word.
// The result by level: 1-19 identical, 20 ±10%, 25 ±20%, 30 and beyond ±30%.
const SIZE_UNIFORM_LEVELS = 19;
const SIZE_SPREAD_MIN = 0.10, SIZE_SPREAD_STEP = 0.02, SIZE_SPREAD_MAX = 0.30;
const MAGNET_ENABLED = false; // the metal detector is hidden (the owner: "the help is unclear in practice"); the code is alive
const SCOPE_ENABLED = false;  // the "Scope" is hidden (the owner's spec 2026-07-19); the code is alive
// COINS ARE HIDDEN (the owner's spec 2026-07-21: "the reward for a level is stars;
// don't delete the coins, hide them"): the 🪙 chip, "×2 for an ad" and the purchasable shake
// are hidden, the crediting into the save (ce/cs) IS ALIVE — if the feature returns, the balance is in place
const COINS_ENABLED = false;
// THE LEVEL TIME IS HIDDEN FROM THE HUD (the owner's spec 2026-07-22: "let's hide the level
// time, show it only on the completion screen"): the timer in the stack
// is hidden, but it keeps living on the win/lose screens (Time: in
// winStats/loseStats). To bring it back into the HUD — true.
const LEVEL_TIME_IN_HUD = false;
// interstitial — once per INTER_EVERY_LEVELS COMPLETED levels. We count wins:
// a defeat/replay of a level does not move the progression.
// ⚠️ HISTORY OF THE SPEC (both from the owner, DO NOT confuse them):
//   2026-07-23 — "an interstitial every 5th level" → it was 5.
//   2026-07-30 — "once every 3 levels" → it became 3. IN FORCE.
// The reason for the densification: I showed the owner that buying "no ads forever"
// for $4.90 disables almost nothing — there are no banners in the game at all, and an interstitial
// once every 5 levels is one video per half hour of play. The product was empty. The owner chose
// to raise the density. ⚠️ THERE WAS NO DECISION ABOUT A BANNER — do not introduce one on my own
// initiative, it was asked and not answered. This is OUR REQUEST, the platform is entitled to
// skip it (Poki/CrazyGames self-pace interstitials) — see
// docs/AD-CADENCE-PER-PLATFORM.md. The previous INTER_MIN_WINS/INTER_GAP_MS
// (the "every 2 wins / once per 3 minutes" frequency) are replaced by this cadence.
// The platform curtain (78-ads). The numbers come from ANALYZING THE SDK v2.0.0 CODE and from measurements,
// not by eye: FADE — the loader's own fade-out after progress 100
// (setTimeout 1400 in the bundle, we take it with a margin); SELF — how long to wait when
// the curtain is removed by the SDK itself (its `.finally` +700, then the 1400 fade = 2100);
// GRACE — a pause before the safety net, if the game is ready but GAME_READY could not be sent
// (we give initialize a chance to resolve); MAX — a hard limit so that the game
// NEVER waits for the curtain forever (measurement: on the live platform it goes away by ~4 s).
// Pressing the silent pause under an ad (78-ads): pauseGame refuses during the
// intro, and the video arrives exactly on top of it. The step is small and cheap — it is
// an empty call with a guard; a limiter is not needed, the attempts are stopped by adBlockOff
// (and in an emergency — by the 60-second interstitial watchdog).
const AD_PAUSE_RETRY_MS = 120;

const CURTAIN_FADE_MS  = 1500;
const CURTAIN_SELF_MS  = 2400;
const CURTAIN_GRACE_MS = 1200;
// ⚠️ 12000, NOT 8000: at 8000 the limit OUTRAN the safety net (measured on a live
// stand: the promise at 8.8 s against removal at 9.4 s) and the promise resolved above a
// hanging curtain. The limit must be deliberately LATER than the regular path
// (readiness ~2 s + a pause of 1.2 + a fade of 1.5), otherwise it is not a safety net
// but a competitor.
const CURTAIN_MAX_MS   = 12000;


const INTER_EVERY_LEVELS = 3;

// ===== "TYPE CHARGE" (the owner's spec 2026-07-31 "an object bomb") =====
// "if the player has collected a boost, any object may drop for him (next to the hint
// button), and clicking it blows up all objects of that type in the bowl".
// THE OWNER'S DECISIONS on my two questions: this is a RESCUE (accAdd accumulates, the museum
// grows, the mixer gets angry) and the FREQUENCY is 1/level. The drop happens when the Power
// chain ignites; the type is random among the alive ones with >= CHARGE_MIN_COPIES copies (measurement: the median
// number of copies is 14 on early levels, 6 on level 25 — below the threshold it would be "an explosion of a single item").
// ⚠️ THE SCORE USES THE GROUP CAP AND NO ×2 OF THE SERIES: the formula 10·N·(N−1) at N=16 would give
// +25% of a level's income in one click — the stars and the rank would drift. N is capped by
// MATCH_MAX_N (at most 560 raw ≈ +7-9%), the combo multiplier is NOT applied:
// the charge is itself a reward for a series, and a reward must not be multiplied by a reward.
// ⚠️ DO NOT CALL IT A "bomb" either in code or in the UI — it clashes with the black ball.
const CHARGE_MIN_COPIES = 6;
// ⚡ THE OWNER'S AMENDMENT (the same date, on top of the first spec): "the object must live
// no more than 7 seconds and dissolve slowly. That way it will be important for the player to activate
// it right away rather than leave it for later". THE CONSEQUENCE FOR THE CODE: the charge became
// PURELY RUNTIME (variables in 80-gameplay) — storing it in the save, merging and
// "agency for the deadlock" died together with "leave it for later"; do NOT bring back
// the save field oc, it lived less than an hour and was removed by exactly this amendment.
const CHARGE_TTL_MS = 10000; // 10s — the owner's word 2026-08-04 ("disappears within 10 seconds", HUD node 829:1242); it was 7000

// ===== ENTRY INTO TURBO GETS MORE EXPENSIVE WITH LEVELS (the owner's spec 2026-07-31:
// "increase the number of things needed to enter this mode… carefully, as
// levels are completed"). The ladder: the base CHAIN_COMBO_AT=10 up to lv.7, then
// +1 every CHAIN_AT_STEP levels, cap CHAIN_AT_CAP: lv.8→11, 16→12, 24→13,
// 32+→14. ⚠️ THE NUMBERS ARE THE DISPATCHER'S FIRST ITERATION ("carefully" = slow
// growth with a cap; late levels accumulate a series harder anyway — the groups are smaller,
// see the measurement in the group cap section: an average of 3.28 on lv.1 → 2.19 on lv.20).
// Tune by playtest; consumers MUST call chainComboAt(), NOT the constant.
// ⛔⛔ THE THRESHOLD IS A FLAT 16 ON EVERY LEVEL (the owner's word 2026-08-23-a: «the
// items boost switches on only after 16 pairs»; asked and answered — «a flat 16
// everywhere»). ⛔ IT CANCELS THE LADDER of 2026-07-31 («make the entry to this mode more
// expensive… carefully»): the growth by level, the step of 8 and the cap of 14 no longer
// decide anything. Level 1 became 60% more expensive, level 32 — 14%.
// ⚠️ «16 PAIRS» MEANS 16 IN AN UNBROKEN SERIES, not 16 per level. The counter is
// `comboCount`, which a mistake and a lapsed tempo window already reset — and that is the
// only reading under which his own next sentence («any mistake cancels the boost») is
// about the same counter. `stats.matches`, the per-level total, never resets and was
// therefore not the subject.
// ⚠️⚠️ THE COST WAS NAMED TO HIM AND HE PAID IT KNOWINGLY: entering turbo is the unit
// that credits the bowl shatter and the bomb, so a rarer entry makes both rarer. He chose
// to compensate rather than accept it — see BOWL_SHATTER_N and BOMB_SERIES_REWARD, both
// lowered in the same batch by his word. Do not read those two numbers as independent
// tuning: they are the counterweight to this one, and moving this back to 10 without
// moving them back would make the finale trivial.
// ⚠️ THE STEP AND THE CAP ARE KEPT DEAD ON PURPOSE — restoring the ladder is one line
// (return the Math.min expression below), and the owner has already switched this knob
// twice. They decide nothing today; do not read them as live.
const CHAIN_AT_STEP = 8, CHAIN_AT_CAP = 14;
function chainComboAt(){
  return CHAIN_COMBO_AT;
  // the ladder, until 2026-08-23-a:
  //   const lv = (typeof levelNum === 'number') ? levelNum : 1;
  //   return Math.min(CHAIN_AT_CAP, CHAIN_COMBO_AT + Math.max(0, Math.floor(lv / CHAIN_AT_STEP)));
}

// LEADERBOARD: the id of the board the owner created in the Playgama dashboard. EMPTY =
// sending is switched off entirely. This is OUR switch, and it is also the substitute for the check
// "the token is in the config": reading `saas.publicToken` from JS is IMPOSSIBLE (Bridge has
// no public access to config values — verified). Therefore the id and the token
// are entered SIMULTANEOUSLY: the id here, the token into playgama-bridge-config.json. While it is
// empty — the three preconditions in 78-ads are not met and we silently do not send.
// ⚠️ SENDING TO THE LEADERBOARD IS SWITCHED OFF DELIBERATELY (the owner's decision 2026-07-29:
// "for now we won't be finishing this functionality as part of my experiment").
// THE CODE IS NEITHER BROKEN NOR DELETED — empty here means "do not send", it is a regular
// switch, made by INTEGRATION for exactly this case.
// ⚠️ WHY WE DID NOT LEAVE IT ON "let it accumulate": the platform's server stores the
// MAXIMUM of all time (verified twice on two platforms), and the owner's approved
// model is the current state, which is able to fall. Accumulating now
// means filling the table with peak values under foreign semantics, and there is nothing to clean
// it with: the SDK has no deletion. When the decision is made, the first thing we would have
// to do is recreate the board — that is, throw away everything collected anyway.
// TO SWITCH IT BACK ON = write the board id here ('Blendo' for the owner) AND make sure
// that playgama-bridge-config.json holds the same id and the public token.
// Everything else is ready and covered by asserts: three preconditions, the guest gate,
// parsing of the response body. The contract — docs/SAAS-LEADERBOARDS-CONTRACT.md.
// SWITCHED ON (the dispatcher's task 2026-08-07). An empty string = the switch.
// ⚠️ The id was verified NOT against the dashboard (there is no access), but by a LIVE RUN: writing
// to the board 'Blendo' with this token went through (201) and came back on read — see
// docs/SAAS-LEADERBOARDS-CONTRACT.md. The match with the config below is verified.
const LEADERBOARD_ID = 'Blendo';
// Turbo top-up drop (the owner's spec 2026-07-21: "in turbo the things must fall
// 20% faster and their quantity must be 30% larger"): the interval 500 -> 417
// (tempo ×1.2), the volume per tick 2 -> 2.6 (the fraction accumulates in the chainCarry accumulator)
// ⚡ THE OWNER'S SPEC 2026-07-31: "speed up the falling of things in turbo mode, let
// them all fit into 3 seconds, but keep the number of things as it is".
// Implementation: the drop WINDOW CHAIN_DROP_WINDOW_MS=3000 from the start of the chain, the tick
// compressed 417→125 ms. The arithmetic of the quantity: it was 10000/417≈24 ticks × 2.6,
// it became 3000/125=24 ticks × 2.6 — THE SUM IS THE SAME, it pours out three times faster and
// manages to land within 3 s (a fall from the spawn at MAX_FALL takes <1 s).
// The fullness limits (141 alive / top>H-1 / <=8 in the air) are untouched — they cut ticks
// before as well, now they cut them more densely, and the number will never exceed the old one.
// ⛔ CHAIN_DROP_MS 125 → 80 (the owner's word 2026-08-23-a: «by the way, speed up their
// pouring»). The tick is the ONLY knob touched: the window stays 3000 and the per-tick
// volume stays 3.0, so the batch is not made smaller — it is delivered denser.
// ⛔⛔ THE FALL SPEED WAS DELIBERATELY **NOT** TOUCHED, and that is the canon's ⛔ ground:
// «WE TRIED 12 — THERE IS NO GAIN… do not turn this knob» about DROP_V0, with bans on
// MAX_FALL and on lowering the spawn beside it. Two days earlier he complained about
// exactly this pour «feeling like dropped frames», and DROP_V0 = 8 was the measured cure —
// making things fall faster again would walk straight back into that complaint.
// ⚠️ THE WINDOW WAS NOT SHORTENED EITHER, though it looks like the obvious «faster». The
// pour is gated by PHYSICAL state (the pile below the rim, the items in the air), not by
// the tick count, so a shorter window would have cut the delivered QUANTITY — the opposite
// of what he asked. Measured before the edit: 22 items actually landed out of a
// theoretical 60.
const CHAIN_COMBO_AT = 16, CHAIN_MS = 10000, CHAIN_DROP_MS = 80, CHAIN_DROP_N = 3.0;  // ⛔ 10 → 16, the owner's word 2026-08-23-a
// ⚠️ CHAIN_DROP_N 2.6→3.0 (the owner's word 2026-08-01 "finish off the top-up drop"):
// a 3-second window fits 20 ticks (a prime of 600 ms on a grid of 125), not
// 24 from a naive division — 2.6×20=52 violated the spec "keep the quantity as it is"
// (~60 on the old grid). 3.0×20=60 — the sum is restored (review v212).
const CHAIN_DROP_WINDOW_MS = 3000;
// ⚠️ TURBO'S TOLERANCE FOR MISSES — BY DIFFICULTY (the owner's complaint 2026-07-28:
// "2 mistakes in turbo on easy completely stop the falling of things, on
// hard there are no attempts at all — 1 mistake is critical"). It was FLAT 2 for both
// difficulties, and on Hard, where part of the pairs is hidden by the inaccessibility veil, a miss
// happens through no fault of the player — turbo went out almost immediately. Easy 4 / Hard 3.
// ⚡ THE OWNER'S SPEC 2026-07-31 (as a reminder, verbatim): "if the player misses 1 time
// in turbo mode, then the mode stops". IT CANCELS the previous
// 4/3 by difficulty — now EXACTLY ONE miss on both difficulties. The function is
// kept (consumers call it, not the constant) — bringing back the leniency = two
// numbers here, but only by the owner's word.
const CHAIN_MISSES_EASY = 1, CHAIN_MISSES_HARD = 1;
function chainMissesLimit(){ return CFG.hard ? CHAIN_MISSES_HARD : CHAIN_MISSES_EASY; }
// AMBIENT CRACKLE IN TURBO (the owner's spec 2026-07-28 "more small lightning bolts").
// It was: one discharge every 200-360 ms. It became: 2 discharges every 130-240 ms, each
// denser in itself (an arc + forks, see boltFX in 70-fx) and SHORTER — arcs across
// the whole bowl read as "a couple of thick bolts", not as an electrified pile.
const BOLT_TICK_MS = 130, BOLT_TICK_JIT = 110, BOLT_PER_TICK = 2, BOLT_MAX_D = 4.2;

// The match radius is DYNAMIC (by the owner's requirement): it starts at
// CFG.baseRadius and shrinks a little as items are removed — the pile settles into a narrowing
// glass, the playable surface gets smaller. The factor = radiusAt(top of the pile) /
// radiusAt(top of the pile at the start of the level); the floor is MATCH_R_MIN.
// ⚠️⚠️ THE FLOOR MOVED WITH THE BASE, PRESERVING THE FRACTION, NOT THE NUMBER (2026-08-11). The previous pair
// 0.9 / 0.75 is a compression corridor of 5/6 of the base; with the new base of 0.45 the old number
// 0.75 would stand ABOVE the base, the formula would degenerate into `r = base`, and the dynamic
// compression would quietly disappear entirely. The owner did not name a floor — so we preserve
// the FORM of the existing mechanic instead of keeping a number that has lost its meaning.
const MATCH_R_MIN = 0.375; // the floor of the radius compression: the same 5/6 fraction of the base as before (0.75 at a base of 0.9)

// ⚠️⚠️⚠️ THE RADIUS PENALTY FOR A MISS — THE OWNER'S SPEC 2026-08-11, VERBATIM:
// "right now it is too easy to poke at all objects and they will combine, it needs to be
// made a bit harder, by some 15 percent. Probably, on a mistake the parameter should be
// dropped hard for some time, down to 0.3 say, but after a few
// seconds returned to 0.4-0.5, and increased on matches up to 0.8 at most".
// ⚠️ THE UNITS WERE VERIFIED, NOT GUESSED (the project has recorded the lesson "the owner's formula
// arrives in HIS units"): the `#radiusRange` slider in the developer panel —
// min 0.3, max 2.2, STEP 0.05, start 0.9 (shell.html), writes straight into
// `CFG.baseRadius`, and the "Gap:" label next to it shows the live `CFG.matchRadius`.
// All four of the owner's numbers are multiples of the 0.05 step, and 0.3 is EXACTLY the left stop of the
// slider. So the numbers are named in the code's units (true gap), and they must be read
// literally. There is no second scale — percentages, fractions, multipliers — in the game at all.
// ⚠️ "BY SOME 15 PERCENT" and his own numbers DISAGREE, and this was said to the owner
// out loud: 0.45 against 0.9 is not −15%, it is a halving. The NUMBERS were taken (they are concrete and
// in the right units), and "make it a bit harder" was read as the intent. The cost
// of a mistake is one line: restore 0.9/0.75/1.1 and remove the three constants below.
// ⚠️ THE PRODUCTION BASE IS A NAMED CONSTANT, not a literal in the CFG object.
// The reason is not beauty: `CFG.baseRadius` MUTATES (the panel slider, suite sections
// force a deadlock via -9), and after their experiments the guards need to restore the
// PRODUCTION value. Previously they restored a LITERAL — and there are four of them in the file
// with the number 0.9 plus two with 0.35, that is, copies lagging two editing epochs behind.
// Now they restore it from here, and on the next edit of the base they will move by themselves.
const BASE_RADIUS_DEFAULT = 0.45;
// ⚠️⚠️ THE SECOND, SOFT ENDGAME STEP (the owner's word 2026-08-11: "at the end of a
// level increase the radius so the player can combine items, if there are fewer than
// 10 of them and there are few or no shakes left. Otherwise it is too hard").
// ⛔ THE HARD STEP "<=8 alive -> ∞" IS UNTOUCHED: it is unconditional and load-bearing
// (anti-frustration, the canon of 2026-07). Here a SECOND condition was added on top of it —
// exactly what the owner named: fewer than ten items AND nothing to sort it out with.
// ⚠️ "Shakes" are the OWN ones the player holds: the free ones on the level plus the purchased ones.
// Ad ones do NOT count: they are unlimited, and the condition "few" would NEVER
// trigger with them — the rule would be dead while looking alive.
// ⚠️ 16 IS A NUMBER FROM MEASUREMENT, not from the spec (the owner's word 2026-08-13:
// "we raise it", the number delegated to the dispatcher). Cull slices down to N alive, lv.5/20
// with 2 layouts each, production radius 0.45: at 30 alive there are 5-11 available pairs, at
// 20 — 1-4, at 15 — exactly ~1, at 12 zeros appear, at 10 even a shake
// does not help (0-1 after it). The zone "there is almost nothing to look for" starts at ~15,
// and the threshold 16 covers it (activation from 15 and below). The previous 10 treated only one
// tail. The full measurement is in CLAUDE.md, the section about the soft endgame threshold.
const ENDGAME_SOFT_ALIVE = 16;   // it was 10 ("fewer than 10 of them"), raised by measurement
const ENDGAME_SOFT_SHAKES = 1;   // "there are few or no shakes left"
const MATCH_R_MISS = 0.30;      // where the radius falls to at the moment of a miss
const MATCH_R_MISS_MS = 3000;   // "after a few seconds" — over this long it crawls back to the base

// WEIGHT DURING A SHAKE (the owner's spec 2026-07-21, "option 1"): a discrete
// response multiplier BY MODEL PACK (tex in TYPES) — metal cars
// move lazily, light fruits bounce; animals/steak/surprise use the base.
// It is applied ONLY to the random loosening of a shake, to the toss and to the mixer's
// vibration; the ATTRACTION of pairs (pullK) is NOT touched — it is functional
// (the convergence of the last pairs and the shake economy), and the intro settling is not touched.
// brick/pirate — PHYSICS's choice by material density (the owner delegated it
// 2026-07-23): brick 0.72 — masonry blocks, almost stone; pirate 0.85 —
// heavy wood/metal/stone (barrel/cannon/ball/chest/tower), one light
// palm pulls it up. The scale: brick .72 < car .75 < pirate .85 < animal 1.0 < food 1.15.
// ⛔ The `rock` key was REMOVED along with the rocks (the owner's word 2026-08-17 "the models are bad,
// they are not needed, delete them from the game completely") — it no longer has a carrier.
const SHAKE_RESP = { car: 0.75, animal: 1.0, food: 1.15, brick: 0.72, pirate: 0.85 };

// MATCH EFFECTS, "ITEM 5" (the owner's spec 2026-07-21): variety
// BY RULE — a pair/triple dissolves into dust as before, a group of
// BURST_MIN_N or more POPS with its pack's effect (food — juice, car — sparks and
// small parts, animal — little stars; without a pack — dust) + a physical WAVE
// makes the neighbours flinch (blastWave in 50-physics). The wave is COSMETICS, not
// loosening: the peak BURST_WAVE_V is small (a shake gives ~9), it decays quadratically.
const BURST_MIN_N = 4, BURST_WAVE_R = 2.4, BURST_WAVE_V = 0.9;

// ===== MATCH AND GRIND EFFECTS — THE OWNER'S CHOICE 2026-08-01 =====
// The owner's spec: "the effects of combining items and of grinding still need work.
// Right now many of them have small particles, the behaviour is understandable but boring". A stand
// with nine options was shown, and the choice was: COLLAPSE (without a frozen frame), a SAW CUT
// into halves, fire as TONGUES ALONG THE SILHOUETTE, strength ×1.7.
// ⛔ THE HIT-STOP WAS REJECTED by the owner — do not bring it back: it was the only one that touched
// not the picture but the FEEL of the input (the frame froze for 50 ms).
// ⚠️ "FEWER PARTICLES, BIGGER CHUNKS" IS A PRINCIPLE OF TASTE, NOT OF BUDGET (an amendment from
// PHYSICS's performance study v1-test-219): on a GPU particles cost 0.7-1.5 ms, while
// 87-98% of the frame is eaten by the solver. We save on bodies, not on dust.
// ⚠️⚠️ EFFECT CHUNKS ARE ANIMATION, DO NOT GIVE THEM RAPIER BODIES (the rule was accepted
// with the package). The phrase "the chunks have physics" reads as an invitation to make them
// bodies — but the cost lives precisely in the dynamic pile. Physicality is IMITATED:
// the sparks' bounce off the walls is computed analytically from radiusAt(y), without colliders.
const COLLAPSE_MS = 150;      // over this long the group flies together into the tap point
const COLLAPSE_SQUASH = 0.35; // how much it squashes along the way
// ⛔⛔ THE CAMERA KICK ON A MATCH IS SWITCHED OFF (the owner's word 2026-08-11: "when
// items are combined the bowl shakes, remove this shake effect for now").
// ⚠️ "FOR NOW" — hence a flag, not a deletion of the code: the metal-detector trick, bringing it back
// costs one word `true`. The numbers below are preserved, they are the previous strength.
// ⛔ EXACTLY TWO PLACES ARE SUPPRESSED — both in `doMatch`: the instant kick for a group >2 and
// the kick on the pop that grows with the group size. ALL OTHER shakes (shake,
// bomb, grind, finale, bowl shatter) are DIFFERENT events, the owner did not name them.
const MATCH_CAM_SHAKE = false;
const COLLAPSE_SHAKE = 0.13;  // the camera kick on the pop (the hit-stop had 0.22)
// ⚡ THE IMPACT AT THE COLLAPSE POINT (the testers' task 2026-08-06: "more drive when
// combining, more effects"). Previously the pop point had ONE carrier —
// dust or a pack effect. Now an impact of three layers goes on top: the RING
// of the shock wave, the CORE FLASH and the ARROWS. It is shared by all packs and, more importantly,
// it is given to PAIRS — until now they had nothing but dust.
// ⚠️ THE IMPACT SIZE GROWS WITH THE GROUP (0 for a pair -> 1 for a group at the cap MATCH_MAX_N):
// "more drive" must be more noticeable where the player collected more.
const IMPACT_MS = 260;        // the life of the ring
// ⚠️ 1.25 -> 0.75 (−40%, the owner 2026-08-30: «umenshi raskhodyashchiesya ot sovmeshcheniya
// programmnye koltsa na 40%… inache mnogo effektov»). The cause is additive: the sprite hit
// flashes of the same day landed ON TOP of the programmatic ring, and two full-size bursts at
// one point read as noise. R_K is untouched — the ring still grows with the group, from a
// smaller base.
const IMPACT_R0 = 0.75;       // the ring radius for a pair
const IMPACT_R_K = 1.5;       // how many times wider the ring is for a group at the cap
const IMPACT_FLASH_MS = 140;  // the core flash — shorter than the ring, this is an "impact", not a glow
const IMPACT_FLASH_SIZE = 1.9;
const IMPACT_ARROW_N = 26;    // arrows for a pair (for a group at the cap — twice as many)
const IMPACT_ARROW_V = 7.0;   // the initial speed of an arrow
const IMPACT_ARROW_SIZE = 0.13; // BIGGER than the dust (0.028-0.115) — these are "impact sparks"
const IMPACT_ORDER = 12;      // the render order of the impact layer (it has no depth test)
// 🔵 THE RING: WIDER, MORE TRANSPARENT, WITH A SHAPE THAT DEPENDS ON THE ITEM (the owner's word
// 2026-08-06 after live play: "I like the ring, but make it wider and increase the
// transparency; try a different width and shape for different objects").
// ⚠️ THE WIDTH IS THE RIM, NOT THE RADIUS: the numbers below are the INNER radius when the
// outer one is 1.0, so SMALLER = WIDER. The ring's radius lives in IMPACT_R0/R_K.
// ⚠️ THE WIDTH GOES TOGETHER WITH SATURATION, NOT WITH WHITE — otherwise a wide pale
// ring will drown in the light pile (my own lesson of 2026-08-06, it cost a ×10 measurement).
// ⚠️ 0.55 -> 0.28 (halved, the same word of 2026-08-30 «prozrachnost na 50»). THE SECOND
// HALVING OF THIS NUMBER: 1.0 -> 0.55 was his «increase the transparency» of an earlier round,
// and the reason is the same both times — on a light pile a saturated ring reads even when
// faint, so opacity is the cheapest knob that does not touch the ring's shape or its family.
const IMPACT_ALPHA = 0.28;    // the opacity peak (1.0 -> 0.55 -> 0.28, twice by his word)
const IMPACT_W_ROUND = 0.60;  // an even ring — for round items
const IMPACT_W_POLY  = 0.48;  // a polygonal rim — for angular ones (the widest)
const IMPACT_W_OVAL  = 0.68;  // an oval — for elongated ones (narrower, otherwise the oval reads as a blob)
const IMPACT_POLY_SEG = 7;    // faces of the polygonal rim
const IMPACT_OVAL_K = 1.42;   // how much wider the oval is along the long axis
const IMPACT_ELONG_AT = 1.45; // from which ratio of dimensions an item counts as "elongated"
// 🔥 A FIRE FLARE WHEN A BURNING ITEM IS COMBINED (the owner's word 2026-08-06:
// "when a burning object is combined, on the combining make a visual
// flare of fire"). The layer is ADDITIONAL: the impact, the ring and the dust stay.
// ⚠️ The palette and the character are the same as the flame on the item (fireSilhouetteFX):
// yellow -> deep orange, an almost white highlight, tongues. Otherwise the flare
// would read as a DIFFERENT effect rather than as "that same fire burst out".
// ⚠️ The fire RISES rather than flying apart radially (that is what distinguishes it from
// the impact lying next to it in the same frame): the plume rises with acceleration,
// the embers fly ballistically and fall.
// ⚠️⚠️ THE FLARE OPENS UP SIDEWAYS, NOT AS A COLUMN — THIS IS A REQUIREMENT OF THE CAMERA ANGLE.
// The camera looks INTO THE BOWL FROM ABOVE, and vertical movement on screen is compressed
// by perspective: the first version rose as a narrow plume and in the frame read as
// a tight lump at the tap point (a red diagnostic showed the effect was
// rendering — what was invisible was exactly the RISE). The same law that made
// the impact ring a billboard instead of lying in the bowl's plane.
const FIREB_PLUME_N = 84;     // tongues in the plume
const FIREB_PLUME_UP = 3.0;   // the rise stayed, but it is no longer the main thing
const FIREB_PLUME_ACC = 4.0;  // the LIFTING force (dust and arrows fall downwards)
const FIREB_PLUME_SPREAD = 3.4; // THE MAIN THING: the fire opens up sideways
const FIREB_PLUME_SIZE = 0.58; // big: these are tongues, not dust
const FIREB_PLUME_LIFE = 0.62;
const FIREB_EMBER_N = 30;     // embers — sparks that fly and fall
const FIREB_EMBER_V = 5.6;
const FIREB_EMBER_SIZE = 0.12;
const FIREB_EMBER_LIFE = 0.9;
const FIREB_RING_SEG = 18;    // faces of the TORN ring of a burning match
// The densities ALREADY CONTAIN the chosen strength ×1.7 — there is no separate multiplier in production
// (the strength knob lived only in the stand and was deleted together with it).
// ⚙️ THE OWNER'S FIX 2026-08-02, verbatim: "after fruits are combined some
// drops appear from them and right now it looks bad because: they are not in the
// blender's plane, they are large. Replace these drops with small splashes".
// ⛔ THE DROPS "ON THE SCREEN GLASS" WERE REMOVED ENTIRELY — that is exactly the "not in the blender's
// plane": a screen-space DOM layer above the scene read as alien. The trick itself is
// workable (that is how casual games do juiciness), but NOT IN THIS game, where everything
// lives inside the bowl. Do not bring it back without the owner's direct word.
// ⛔ AND THE "FAT DROP" 0.86 IS CANCELLED — it was my reading of the spec "fewer
// particles, bigger chunks", and on fruit the reading turned out to be wrong: for juice
// a large size reads not as juiciness but as a defect.
const JUICE_N = 78;           // small splashes (it was 54; DENSER by the testers' task)
// ⛔ DO NOT TOUCH JUICE_SIZE: the testers' "bigger" refers to the volley as a whole, and the juice
// the owner asked for SMALL on 2026-08-02 ("large drops look bad").
// We grow the density by number and leave the size at 0.075.
const JUICE_SIZE = 0.075;     // the crumb size class, not a "drop"
const JUICE_SPREAD = 4.6;     // a fan: the splashes fly SIDEWAYS, not as a column
const JUICE_LIFE = 0.5;       // they die out fast — a spray, not a flight of drops
const SPARK_N = 52;           // sparks with a ricochet (it was 37; denser by the testers' task)
const SPARK_BOUNCE = 0.72;    // the speed lost on a bounce off the bowl wall
const SPARK_BOUNCE_MAX = 2;   // how many times a spark is allowed to bounce
const SHARD_BURST_N = 21;     // shards per burst of a hard pack (it was 15, before that 7)
const SAW_LIFE = 0.75;        // how long the halves of the saw cut live
const SAW_TILT = 0.18;        // the tilt of the cutting plane from the vertical
const FIRE_PUFF = 0.26;       // how much the flame silhouette is inflated (a fraction of the model)
const FIRE_FADE_MS = 450;     // the fade-out when extinguishing
// A BURNING ITEM — THE MECHANIC (the owner's spec 2026-08-01: "DO IT, only
// 1 item per 30 seconds may catch fire"). An item catches fire by itself, burns for
// a few seconds and goes out; collecting a group of the burning type is a bonus (the crediting
// is up to the DISPATCHER, the joint is burningName in 70-fx).
const FIRE_EVERY_MS = 30000;  // ⚠️ THE OWNER'S NUMBER, do not tune without his word
const FIRE_BURN_MS = 6000;    // how long it burns if it is not collected
// ⚠️ WE CHOOSE FROM THE TOP ONES, NOT FROM ANY ACCESSIBLE ONES. isAccessible on the easy
// difficulty lets EVERYTHING through (overlaps are not checked there) — that is, by
// fairness a buried item can be tapped, but THE FLAME ON IT IS NOT VISIBLE, and
// the player simply does not learn about the bonus. The top slice decides visibility, the accessibility
// gate decides fairness on Hard. Both are needed.
const FIRE_TOP_N = 12;        // out of how many top accessible ones we choose
const FIRE_BONUS_MULT = 2;    // the bonus for collecting a group of the BURNING type: the group's
                              // score ×2 (the dispatcher's default, approved by
                              // the owner's word "do it" on the recommendation
                              // "collect a group of a burning one — a bonus")


// ===== THE BOWL SHATTER (the owner's idea 2026-08-01, PROTOTYPE v2; his decisions:
// a new bowl every level; rocks/bomb are carried away without score; slow-mo YES).
// Every entry into turbo = a crack; N cracks => the bowl shatters, all items
// are counted AS COMBINED (an accAdd rescue, score by groups of types
// WITHOUT the series multipliers — otherwise it stacks with turbo; the paid booster multiplies),
// an instant win. Rocks/bomb/surprise: the surprise is collected with a bonus,
// the rocks and the bomb are carried away without score (the owner's decision №2).
// the boost unit: 'series' — PRODUCTION (the owner's word 2026-08-02 after playing,
// verbatim: "It should shatter if the player constantly builds series,
// for example 5-7 series per level... beating the mixer by cracking the bowl should
// be not so easy and achievable"). The formalization of "a built series": EVERY
// BOWL_SERIES_LEN UNINTERRUPTED matches of a chain = 1 credit (a break of the chain before the credited
// length — the episode does not count). In practice the credit is ~1 per episode: at
// chainAt(lv)>=10 the entry into turbo "spends" the series (comboCount=0), so the player's cycle
// = ramp up to 6 (a credit) -> turbo at 10 -> start over. 5-7 credits ~
// 50-70 hot matches per level out of 36-98 available (GRAPHICS's measurement) —
// "achievable, but not simple".
// The history of the units (all cancelled by his own word after measurements/play): 'combo'
// (the ignition — it counted stops), "a match in a series" (= simply a match, the window
// is extended by every one), 'peak' (the chain record — N=10 on the first levels
// was reached too quickly, "too easy to achieve"). 'combo'/'chain'
// are kept as stand modes.
// SIMPLIFICATION (the owner's word 2026-08-03 verbatim: "only 3 turbo modes
// in a row (30 matches) without mistakes break the bowl. Everything else is too
// simple. And yes, the bomb does not affect this"): the unit = ENTRY INTO TURBO, the streak
// counter is broken by ANY miss (empty space, a rock — bowlStreakReset in
// penalize/penalizeDouble). The bomb does not register a miss (detonateBomb) —
// "does not affect" holds by construction. A pause does NOT break the streak: it does not
// let you reach turbo anyway, and the owner did not ask to break already earned turbo credits
// with a breather. 'series' (4 uninterrupted = a credit, L=4 by
// calibration) — into history: "too simple".
const BOWL_CRACK_ON = 'chain';
// L=4 BY GRAPHICS'S CALIBRATION (2026-08-03, the dispatcher's decision by criteria
// announced in advance — L=5 gave a collapse "10% of misses = never"):
// at 10% misses the shatter happens in ~33% of levels, at 15% it is not zero, at 0% — at
// 80-87% of the level. It was decoupled from SERIES_X3_AT deliberately: that one is about a x3 score,
// this one is about punishing a mistake in the bowl; the equality was a coincidence of the formalization.
// ⚠️ THE LATE SHATTER (80-89% of the level with flawless play) IS INTENDED, not a
// defect: a direct question to the owner "at the end or in the middle" — the answer was "at
// the end" (2026-08-03). The shatter = a climax-finale, its value is in the spectacle
// (GRAPHICS's shards), not in the prize. N=6 is the owner's number, do not touch it without him.
const BOWL_SERIES_LEN = 4;
// N: the middle of the owner's range "5-7 series per level"; more precisely — by GRAPHICS's
// table "N -> % of triggerings", the owner will pick the number.
// N: the owner's word 2026-08-04 verbatim: "the bowl must break only
// after 5 turbos in a row without mistakes, and every 10th level needs +1 turbo — yes,
// it will be hard". Base 5, +1 for every ten levels (lv.1-9: 5, lv.10-19:
// 6, lv.20-29: 7...), he did not set a cap — we do not invent one. The bowlSetN knob is alive.
// ⛔⛔ 5 → 3 (the owner's word 2026-08-23-a, his choice out of three offered: «a flat 16
// everywhere AND fix the bowl»). This is NOT independent tuning — it is the counterweight
// to the turbo threshold going 10 → 16 in the same batch. The unit here is an ENTRY INTO
// TURBO, so a 60% dearer entry would have pushed the shatter out of the game: at 5 credits
// it needed 50 flawless matches on levels 1-9, at a threshold of 16 it would have needed
// 80, against a series window that shrinks to an 1800 ms floor. Three credits × 16 = 48,
// i.e. the finale lands roughly where it landed before this batch.
// ⚠️ IF THE THRESHOLD EVER RETURNS TO 10, THIS MUST RETURN TO 5 — otherwise the shatter
// becomes trivial. The two numbers are one decision.
const BOWL_SHATTER_N = 3;
// "THE CHAIN BREAKS FROM A PAUSE OR FROM A MISTAKE" (the owner's word 2026-08-02) — already
// in production WITHOUT any edits: the progress towards a credit goes by comboCount, and that is reset by
// a pause (the window) and by ANY miss (penalize/penalizeDouble, spec 2026-07-27
// "the mode counter is reset"). The reading of GRAPHICS's fork is (a): what breaks is
// the COUNTER (comboCount, which is also the bowl's progress), while the series window/the x2 multiplier and
// the radius ladder live by his softenings of 07-20/07-27. Reading (b) "a miss
// extinguishes the whole series with the x2 and the window" must NOT be enabled without the owner's direct word —
// that would be a cancellation of his own tuning.       // the starting N (bot calibration + playtest)
const BOWL_SLOWMO_MS = 600;     // the slow-mo of the shatter (the owner's "yes!", №3)
const BOWL_SLOWMO_K = 0.45;     // the time multiplier during the slow-mo
const BOWL_COLLECT_DELAY = 900; // REAL ms from the shatter to the collection wave
// THE SHARDS OF THE SHATTER. ⚠️ 3×10 instead of the prototype's 2×7: "beating the mixer" is the rarest
// event of a game, and 14 pieces for the whole bowl read as stingy. The price is single
// draw calls (the drain measurement is in the delivery), that is, there is nothing to economize on here.
// ⚡ THE BOWL SHATTER — ONE MESH, THE MOVEMENT IN A SHADER (the akella/ExplodingObjects technique,
// the repository was shown by the owner 2026-08-06). The pieces are merged into ONE geometry,
// the membership of a piece is written into the vertices (aCen/axis/vel/spin), and the shatter is driven by
// the vertex shader from a single time uniform. That is why the number of pieces has almost no
// effect on the price: previously 30 pieces = 30 objects, 30 materials, 30 ticks.
// ⚠️ The geometry is BAKED ONCE, at the start of a level (the bowl is unchanging) — the explosion itself
// no longer builds anything.
// ⚠️ THE NUMBER OF VORONOI CENTRES, NOT A GRID. Rows×sectors gave a correct
// lattice — the owner rejected it with the words "in real life glass does not crack like that".
// ⚠️⚠️ TWO CLASSES OF PIECES (the owner's word 2026-08-06 "make large plates
// and a cloud of small stuff around them"): rare PLATES scattered over the whole shell, and
// a dense cloud of CRUMBS around the impact points. The density of the centres falls with the
// distance from the impact — that is exactly how glass breaks: dust right at the impact,
// bigger pieces further away.
const BOWL_PLATE_N = 13;      // large plates
const BOWL_PLATE_MIN_D = 0.17;// the minimum gap between plates (a fraction of the circumference)
const BOWL_FINE_N = 150;      // crumbs in the cloud
const BOWL_IMPACTS = 2;       // impact points around which the crumbs are denser
const BOWL_FINE_R = 0.34;     // the radius of the crumb cloud (a fraction of the circumference)
// ⚠️ THE COLLECTION AFTER THE EXPLOSION — IN THE SAME LANGUAGE AS AN ORDINARY MATCH (the owner's word
// 2026-08-06): the items FLY TOGETHER INTO THE CENTRE and pop as a single event, instead of
// melting away in place. It is longer than a match (150 ms) — they have to fly across the whole bowl.
const BOWL_MERGE_MS = 620;    // how long the pile flies together into the centre
const BOWL_MERGE_AT_Y = 3.4;  // the height of the collection point
const BOWL_FLY_MS = 1400;     // how long the shards fly
const BOWL_FLY_G = 9.5;       // gravity for the shards (cosmetics, not the world physics)
// ⚠️ THE TINT FOLLOWS THE CURVATURE, IT IS NOT A FLAT COLOUR. In the prototype the shards were
// MeshBasicMaterial of a single colour — a flat material has no light, and a piece
// reads as a SILHOUETTE-BLOB rather than as a fragment (the same trouble the canon describes for
// shardFX). We bake the volume into the VERTEX COLOURS by the normal to the key light — the same
// SHARD_LIGHT as for the item shards, otherwise the glass would be lit differently
// from everything else. The range is narrower than for the shards: the bowl has a soft curvature, and
// a wide spread would give stripes.
const BOWL_SHARD_TINT_LO = 0.72, BOWL_SHARD_TINT_HI = 1.26;
// THE GROUP SIZE CAP (the owner's spec 2026-07-27: "put a cap at 8").
// Before this there was NO cap at all: a tap carried away ALL accessible items of the same type within the
// radius. A measurement of the ceiling by accessibility: lv.1 (9 types) up to 16 items,
// lv.10 (18 types) 10, lv.40 (48 types) 3-4 — that is, the cap really works
// only on EARLY levels, on late ones it changes nothing.
// ⚠️ THE WHOLE match is counted, INCLUDING the tapped item (a group of <= 8 items).
// The extras are cut off by DISTANCE: the ones nearest to the tapped item by the
// true gap remain (the same metric as the bomb's) — "it collapsed around the
// finger", the rest wait for the next tap and are legal as orphans.
// ⚠️ THE CONSEQUENCE FOR THE SCORE: the price of a group 10·N·(N−1) is quadratic, so the cap
// cuts the early income (it was 16 -> 2400 points per tap, it became 8 -> 560), while
// the pair-score for the stars (finalizeFill) does NOT depend on the group size — so
// 2★/3★ on early levels become noticeably harder. This is the expected price of
// the owner's decision; on a complaint "the stars are not given" it is the first suspect.
const MATCH_MAX_N = 8;

// THE BLACK BALL-BOMB (the owner's spec 2026-07-22, via the dispatcher: "add
// a black ball to the game, medium size... Clicking it blows up all the things
// nearby within a small radius (no more than 5-7 objects)"): 1 per level,
// spawned in the MIDDLE of the fill column (at the top it would be a free click at
// the start). A tap on an accessible one = an explosion of the NEAREST neighbours: the gap of the enclosing
// spheres <= BOMB_RADIUS, a hard cap BOMB_MAX (the owner: "no more than 5-7").
// It neither gives nor takes score (it is a clearing tool); it does not touch the surprise or other
// bombs; the mixer punishment does NOT eat the bomb (like the surprise),
// the final cleanup does eat it; the explosion breaks the parity of pairs — orphans are legal.
// ⚠️⚠️ WHEN THE BOMB APPEARS AT ALL — THE OWNER'S SPEC 2026-08-12, verbatim:
// "add the bomb from level 5, but every 1-3 levels by default, and also
// if the player scores 3 series".
// ⛔ THIS CANCELS THE PREVIOUS "ONE BOMB ON EVERY LEVEL" (spec 2026-07-22): before
// level five there is now NO bomb AT ALL, after that it comes with a gap.
// ⚠️ "SERIES" IS HIS OWN PRODUCTION UNIT `level.bowlCracks` (a credit for every
// BOWL_SERIES_LEN uninterrupted matches of a chain, "5-7 per level" — his word when
// introducing the bowl shatter). Starting a second "series" counter next to the working one
// is not allowed: a copy diverges from the original at the very first edit.
// ⚠️ THE REWARD FALLS IMMEDIATELY, WITHIN THE SAME LEVEL (the bomb drops from the sky by the same
// path as the turbo top-up), not "on the next one": otherwise the player would not connect it with
// his own series and the reward would stop reading as a reward.
// ⚠️⚠️ THE GOLDEN FISH IS CONDITIONAL (the owner's spec 2026-08-12). Verbatim:
// "start adding it from level 10, if at least one item is upgraded"; to the clarifying
// question — "the existing one, with a condition", that is, we GATE the fish that used to be on every
// level instead of introducing a second one.
// ⛔ THIS CANCELS "one per level, lying at the bottom" (the canon from the very beginning):
// on levels 1-9 there is NO treasure AT ALL, and on 10+ it is absent until the player has
// upgraded something. The price was named to the owner: the early game loses +150 and the "archaeology",
// but the treasure becomes a reward for investing into the collection.
// ⚠️ The owner first called this item a "golden teapot" — there has been no teapot in the game
// since 2026-07-21, and the question was asked before doing anything.
const SURPRISE_FROM_LEVEL = 10;
// ⚠️⚠️ THE 60 FPS FRAME CAP (the performance pass 2026-08-12, knowledge about phones): an iPhone
// Pro (ProMotion) drives requestAnimationFrame at 120 Hz — the game rendered and
// synced TWICE as often as it was designed for (all the balancing and the physics are for 60).
// The gain for the eye is zero (the simulation steps with a fixed step of 1/60), and the price is a double
// render+sync, heating and throttling of the phone, that is "it gets sluggish" LATER from
// overheating. The cap is PURELY presentational: the fixed-step accumulator is untouched, a
// skipped frame accumulates dt, the simulation is bit-for-bit the same.
// ⚠️ 14, not 16.7: rAF at 120 Hz ticks every 8.3 ms — a threshold of 14 skips
// every second tick (8.3 < 14 → skip; 16.6 > 14 → frame), giving exactly 60 without
// beating; a threshold of 16.7 would give 40 fps at 120 Hz (every third).
// At 60 Hz it changes nothing: raw ~16.7 > 14 — not a single frame is skipped.
// The skip threshold = 840/CFG.fpsCap ms (60 → 14). There is no constant DELIBERATELY:
// a copy of the number next to the knob would diverge from it at the first edit.
const BOMB_FROM_LEVEL = 5;
// ⚠️⚠️ THE FROZEN ITEM (the owner's spec 2026-08-13, the full one — answers to 13
// questions from the dispatcher). One item OF A PAIR is frozen into a translucent block:
// it does not match, the thawing is to collect FROZEN_PAIRS_N pairs OF THE SAME TYPE, after
// which the block PULSATES and waits for a TAP; the tap breaks the ice, the item becomes
// ORDINARY and still needs a pair (the owner's word "if it is broken, it
// still needs a pair" — that is why we freeze ONE OF A PAIR, the parity is intact).
// The score for breaking: MATCH_SCORE × 3 ("the item's clean score x3") × the multipliers.
// Appearance: from level 11 (the treasure is from 10 — "spread them over the following levels"),
// randomly every 1-3 levels, 1-2 blocks per level, NOT on the same level as the treasure.
// A tap before it is due — a penalty LIKE A ROCK'S (double). The bomb DOES BREAK the ice (an early
// thaw WITHOUT the ×3 score — a freebie is not paid for, the default was named).
// Pairs from a type charge DO count. The finale eats up the block without a reward.
// ⚠️⚠️ N=3 IS NOT FEASIBLE EVERYWHERE — MEASUREMENT (pairs of one type: lv.10 → 7, lv.20 → 4,
// lv.40 → 2, lv.60 → 1): the type for a block is CHOSEN among those with
// ≥ 2N+2 copies (N free pairs + the block's partner). If there are none — there is no block, the queue
// shifts to the next level.
const FROZEN_FROM_LEVEL = 11;
const FROZEN_GAP_MIN = 1, FROZEN_GAP_MAX = 3;
const FROZEN_MAX_PER_LEVEL = 2;
const FROZEN_PAIRS_N = 3;
const FROZEN_BREAK_MULT = 3;        // earlier — there is no bomb at all
const BOMB_GAP_MIN = 1, BOMB_GAP_MAX = 3;   // "every 1-3 levels"
// ⛔⛔ 3 → 2 (the owner's word 2026-08-23-a) — the same counterweight as at
// BOWL_SHATTER_N, for the same reason: his spec «if the player scores 3 series» was
// written when a series cost 10 matches, and at 16 the bomb would practically have stopped
// arriving. Two entries × 16 = 32 matches, against the 30 his own sentence describes.
const BOMB_SERIES_REWARD = 2;     // was 3: "if the player scores 3 series" (2026-08-12), re-based at the threshold of 16
const BOMB_RADIUS = 5.72, BOMB_MAX = 7, BOMB_WAVE_V = 15.0; // the zone ×2 (2.86→5.72, the owner's spec 2026-07-27-b; history: 2.2→+30%→×2); the cap BOMB_MAX=7 holds the balance ("no more than 5-7") — it is really what decides, the radius now covers almost the whole bottom
// ⚠️ THE ICE BREAKS ONLY FROM A CLOSE EXPLOSION (the owner's choice "2", 2026-08-13):
// a measurement showed that the zone of 5.72 with a bowl ~8 across reached a block from
// ANY point of the pile — 10 blocks out of 10 in 7 explosions, and the condition "collect N pairs"
// was devalued by a single tap on the bomb. 2.86 is the historical zone BEFORE the doubling;
// it is DELIBERATELY its own constant rather than BOMB_RADIUS/2: the owner has changed the bomb's zone and
// may change it again — the ice-breaking radius is no longer tied to it.
const FROZEN_BOMB_RADIUS = 2.86;
// "THE EXPLOSION IS LIKE A SHAKE EFFECT" (the second half of the owner's spec 2026-07-27-b;
// PHYSICS's constants, added by rule 3 — adding one's own is allowed).
// BOMB_JOLT is the amplitude of the jolt given to the WHOLE pile (the second layer of blastWave on top of
// the radial punch): the pile flinches as a whole, as during a shake.
// ⚠️ DELIBERATELY MUCH SMALLER THAN A SHAKE (it has ~9 along XZ and 5.4-11.4 of toss):
// the goal is the FEELING of a shake, not its mechanic. If it were made comparable,
// the bomb would become a free shake and would collapse the economy of the budget of 5.
// ⚠️ IT IS DUPLICATED IN CFG.bombJolt (below) — AN A/B KNOB: the owner's spec
// is ambiguous ("like a shake" = make it similar OR a complaint "indistinguishable"),
// so the effect is switched off in one tap from ⚙️/console without a rebuild
// (the CFG.matcap precedent). The production value is read FROM CFG.
// BOMB_CAM_SHAKE is the camera kick. ⚠️ camShake in 99-main is the DURATION
// of the shaking (decaying by dt, the amplitude = camShake*0.8), not the force of the blow: giving
// the explosion more than a shake (0.42) means "we shake longer than it does" with a four times
// smaller physical jolt — a desynchronization of the channels (review 2026-07-27).
// ⚡ THE STRENGTHENING (the owner's spec 2026-07-27: "the bomb's explosion force needs to be increased"):
// the punch 2.2 -> 5.0, the jolt 2.5 -> 6.0, the camera 0.35 -> 0.45, the vibration [40,80,50].
// The response of the top of the pile grew 0.84 -> 3.3 avg |v| (it was ~12% of the shake's force, it became
// ~50%). ⚠️ WHY THIS DID NOT BREAK "it must not be a free shake":
// a measurement on 3 seeds showed that the available PAIRS do not grow at any force
// (the explosion mixes but does not loosen; a shake on a full pile also gives
// a drop in pairs). The limiter turned out to be not the economy but the walls — and there the gain
// from the force is WITHIN THE NOISE: the worst wallExcess 0.169 (the current force) -> 0.178
// (the strengthened one) with 0.141 without any wave at all, and the rescuer did 1-3 teleports in both
// cases. We did not go beyond 7.0/8.0: there the physics step is 8.9 ms against 6.5.
// BOMB_WAVE_PAD is an ADDITIVE margin of the punch radius over the damage zone
// (the historical behaviour BOMB_RADIUS+1.2; a multiplicative version silently
// REDUCED the radius 6.92 -> 6.86 and changed the semantics for any future tuning of the zone).
// ⚠️ THE EFFECT ×3 (the owner's spec 2026-07-28): the punch 5→15, the jolt 6→18, the camera
// 0.45→0.6 (the camera kick is the DURATION of the shaking, we do not triple it: 1.35 s
// of shaking would read as a bug rather than as power). The victim cap BOMB_MAX=7 and the radius
// are NOT touched — the owner asked for the strength of the EFFECT, not the size of the clearing.
const BOMB_JOLT = 18.0, BOMB_CAM_SHAKE = 0.6, BOMB_WAVE_PAD = 1.2;

// NON-COMBINABLE ROCKS (the owner's spec 2026-07-22, "start the physics"):
// ⛔⛔ THE NON-COMBINABLE ROCKS WERE REMOVED ENTIRELY 2026-08-17 (the owner's word on two
// screenshots: "these are some rocks, the models are bad, they are not needed. Delete them
// from the game completely"). THIS IS A CANCELLATION OF HIS OWN SPEC OF 2026-07-22 — do not read it as
// an oversight. Removed: ROCK_FROM_LEVEL/ROCK_EVERY/ROCK_CAP, ROCK_TYPES,
// rocksForLevel, makeRock, the module 37-rocks.js, DENSITY.rock, SHAKE_RESP.rock,
// the suite section and the hooks rocks()/rockIndex().
// ⚠️ NOT DELETED BUT RENAMED: `penalizeRock` → `penalizeDouble` (80-gameplay).
// It is called by the ICE BLOCK on an early tap — the ice spec says verbatim "a penalty like a rock's",
// and removing the function would have quietly changed the ice mechanic.
// To bring it back — `git revert`, the history is intact.

// ⚠️ THE RADIUS METRIC (2026-07-18, the owner's question): the distance is computed
// as the GAP BETWEEN SURFACES (pairDist: the centres minus both radii), and NOT
// between the centres. With a size spread of up to ±50% the centre metric punished
// large pairs (their centres are far apart even when touching). All the thresholds are in gaps:
// base 0.9, floor 0.75, combo ceiling 2.0. The old "a minimum of 1.8 by centres"
// is equivalent to ~0.75 of a gap for average items.
// ⚠️ METRIC v3 (2026-07-20, the owner's spec "something smarter for
// elongated ones"): a match = the TRUE gap between the physical surfaces
// (GJK Rapier, contactCollider) <= matchRadius. History: the centre metric
// punished large ones (v1), the gap of the ENCLOSING spheres (v2) anisotropically FAVOURED
// elongated ones — a steak lying flat "matched through thin air" (a visible gap of 1.0
// = an enclosing one of −0.46). The intermediate "sphere touch margin" (+0.55,
// MATCH_EDGE_PAD) was removed together with the sphere: the telegraph is a ghost halo of the
// shape itself (reachGhostFX in 80-gameplay). The thresholds are in true gaps, the owner's
// numbers are canonical: base 0.9, floor 0.75, combo ceiling 1.1 (the 3rd nerf,
// 2026-07-21: "even in turbo mode no more than 1.1" — a ceiling for the Power chain too).
// The single point of comparison is pairMatch (60-access).
// TINTING BY THE DEPTH OF THE PILE — step 2 of the matcap package (a replacement for the disabled shadows).
// An item is darker the lower it sits in the bowl. The bottom is ~FLOOR_REST=1.15, the rim is
// 9.2, the top of the pile wanders 4.8-9.0 — that is why full brightness is taken noticeably below
// the rim, otherwise on an incomplete bowl the WHOLE pile would be in half-shade.
// ⚠️ The count goes from the CURRENT TOP OF THE PILE, not from the bottom of the bowl. The first attempt
// was tied to absolute heights (1.4-6.2) and turned out to be invisible: from above
// the player sees the surface of the pile, and the height differences on it are small — the whole
// spread fitted into 13% of brightness. Plus the top of the pile wanders from 4.8 to 9.0,
// and on a full bowl a fixed range would degenerate entirely.
// picked on a scale of 40-80%: at 40% the bottom fell through, at 80% the volume disappeared.
const DEPTH_TINT_RANGE = 3.2; // this far below the top of the pile — the darkest tone
// ⚙️ 0.89 IS THE OWNER'S CHOICE 2026-08-03 (it was 0.65). ⚠️ This turned out to be his
// "the objects a little lighter": he touched neither gain nor contrast, but raised the FLOOR —
// so it was the BOTTOM of the pile that felt too dark, not the picture as a whole, and the overall brightness
// would have been the wrong treatment. The previous "the lower ones are completely dark" is WEAKENED by this,
// not cancelled: the depth tinting is alive, just softer.
const DEPTH_TINT_MIN = 0.89;  // how many times darker the bottom gets. The owner: "the lower ones are completely dark",

// THE BRIGHTNESS AND CONTRAST of models with a native texture (the owner's spec 2026-07-21:
// "everything is very light right now"). The brightness is done by MULTIPLICATION: the additive offset
// that used to be here lifted the dark areas and killed the contrast.
// The contrast is stretched around TEX_PIVOT: below the point it darkens, above it lightens.
const TEX_GAIN = 1.02;      // 1.0 — as is; more — lighter
const TEX_CONTRAST = 1.08;  // the owner's choice on the scale 1.00-1.28 (2026-07-21).
// 1.00 is pale ("everything is very light"), 1.28 is already acid with holes falling into black.
const TEX_PIVOT = 0.34;     // the midpoint around which the contrast rotates

// THE VEIL OF INACCESSIBLE ITEMS IN HARD (the owner's spec 2026-07-23: "reduce the
// saturation completely, they will come out light grey").
// ⚠️ WHY IN THE SHADER AND NOT BY LERPING material.color (as it used to be): for TEXTURED
// models — and that is 114 items out of 130 in a frame — material.color is WHITE, the colour
// is carried by the atlas. Lerping white towards grey simply DARKENED the texture, the tiger stayed
// ginger. They can only be desaturated after the map is sampled, that is, in the fragment.
//   'desat' — desaturation + a lift towards light grey (the owner's choice);
//   'fade'  — the same + TRANSPARENCY (the performance measurement is in WORKSTREAMS, the GRAPHICS block);
//   'tint'  — the historical lerp of material.color (for A/B).
// ⚠️ TRANSPARENCY IS ENABLED (the owner's spec 2026-07-29: "make the inaccessible things
// in hard mode not just grey but transparent like in the museum").
// ⚠️ GRAPHICS IMPLEMENTED THIS MODE AND DELIBERATELY DID NOT ENABLE IT — here are both of their
// reasons and what became of them:
//  1. "Visually it gives nothing: the inaccessible ones are hidden from the camera by the top
//     layer anyway". ⛔ REFUTED BY THE OWNER'S SCREENSHOT: accessibility is computed by rays
//     INTO THE SKY, while the camera looks FROM THE SIDE — in his frame there is a large grey mass
//     in the foreground, not covered by anything. The claim is true for a top-down view and
//     false for the side angles the player uses all the time.
//  2. "The price is paid by EVERYONE and ALWAYS: three puts an item into the transparent
//     queue by the material.transparent flag, not by opacity, and the accessible ones
//     lose the early Z". ✅ THE REASON IS REAL, so the flag is now set
//     ONLY IN HARD (see 40-items): in Easy there is no veil at all — isAccessible
//     returns true for everyone — so there is nothing to pay for. The previous implementation
//     paid even in Easy, now the default mode pays NOTHING.
// ⚠️ THE PRICE IN HARD REMAINS and on a mobile GPU it is higher than measured in headless
//     (on tiled GPUs the discarding of occluded geometry works only for
//     opaque objects) — the measurement is in the journal.
// ⚠️ SWITCHING THE DIFFICULTY TAKES EFFECT FROM THE NEXT LEVEL: applyHard
//     does not rebuild the materials, and changing the flag on the fly is not allowed — that is
//     a shader recompilation for every item.
// ⚠️ THE TRANSPARENCY WAS ROLLED BACK THE SAME DAY, AND HERE IS WHY (measurement + a screenshot):
// a light blue veil ON TOP OF transparency against a light blue sky = the items
// disappear completely. In a frame of lv.20 Hard, out of 181 items only a couple
// remained visible: 123 veiled ones at opacity 0.42 and with a tone close to the sky merged
// with the background, and the bottom of the bowl became visible through them. "Visible but not touchable"
// turned into "not visible at all".
// The owner himself gave the fork: "if the transparency is expensive — we just need a light
// blue matcap". We take it: the tone stays blue, the mode is opaque.
// ⚠️ THE PRICE OF THE TRANSPARENCY WAS NEVER ACTUALLY MEASURED (the headless spread is larger than the difference) —
// that is, the rollback was done not because of performance, but because IT LOOKS WORSE.
// To bring it back: 'fade' — but then the tone must move away from the sky colour, otherwise it will repeat.
const VEIL_MODE = 'desat';
// ⚠️ THE VEIL IS LIGHT BLUE, NOT GREY (the owner's spec 2026-07-29: "we just need a light
// blue matcap on the inaccessible objects, the current grey does not look sexy").
// It works in BOTH veil modes, so the question "whether to keep the transparency"
// is decided by a separate constant and does not change the look.
// ⚠️ DO NOT TAKE THE SKY COLOUR (#cee4fe): the veil would merge with the background, and the inaccessible ones
// would disappear completely instead of "visible but not touchable".
// ⚠️ THE TONE WAS PICKED BY MEASUREMENT, NOT BY EYE (GRAPHICS 2026-07-29). The previous 0x9ec2f0
// was a safety measure of "just don't coincide with the sky" and halved the contrast of the pile
// against the sky: a measurement of the average brightness (lv.20 Hard, the veil forced on everyone) — the background 0.788,
// the pile 0.62, the contrast 0.169 against 0.314 in a scene WITHOUT the veil. That is, the veil
// itself pulled the items into the background — the same disease that killed the transparency, only
// weaker. The current 0x6f9fd8 at lift 0.35 gives a contrast of 0.359 (HIGHER than without
// a veil) and stays clearly blue. Verified on BOTH skies, a contact sheet
// (day/night × three tones) was sent to the owner.
const VEIL_TINT = 0x6f9fd8;
const VEIL_LIGHT = 0.95;    // the target light grey at the shader's output
const VEIL_LIFT = 0.35;     // the fraction of the lift towards it: 0 — honest brightness (dark stays
                            // dark), 1 — a flat light fill.
// ⚠️ LIFT IS THE MAIN LEVER OF READABILITY, STRONGER THAN THE TONE (GRAPHICS's measurement 2026-07-29).
// It alone raised the brightness of the pile from 0.51 to 0.62 with a sky of 0.788 — that is, it
// exactly, and not the hue, "floated" the items into the background and smeared the silhouettes. On one and the same
// tone 0x9ec2f0: lift 0.55 -> contrast 0.169, lift 0.25 -> 0.278.
// ⚠️ The previous comment here claimed "0.30 was picked from screenshots", while the code
// held 0.55 — the comment diverged from the value when the tone was added. Now
// 0.35 is both the number and the justification in agreement; change it only with a new contrast measurement.
// ⚠️ 0.65 is the historical strength FOR THE COLOUR LERP: there 1.0 gave a uniform
// grey fill without any form. Desaturation does not behave that way (brightness and
// shading are intact), and the owner asked to "reduce the saturation COMPLETELY" —
// so in the shader modes the target is 1.0, and in 'tint' the calibrated 0.65 remains.
const VEIL_TARGET = VEIL_MODE === 'tint' ? 0.65 : 1;
const VEIL_ALPHA = 0.42;    // "like in the museum" — exactly the GHOST_ALPHA of the ghost cards (it was 0.2, more transparent than the museum)

// THE BOWL GLASS (the owner's spec 2026-07-21): completely transparent head-on,
// with a soft rim at a tangent. The alpha = fresnel^GLASS_POW * GLASS_EDGE.
// The previous uniform opacity of 0.08 gave a whitish film over the whole area.
const GLASS_EDGE = 0.30;  // the brightness of the rim; 0 — the glass is not visible at all
const GLASS_POW  = 2.6;   // the softness of the transition; more — the rim is narrower and sharper

// ⚠️ THE STATIC DARKENING OF THE TOP OF THE SCREEN (SKY_TOP_DIM/FROM, an interface request
// 2026-07-21 for the contrast of the white HUD) WAS REMOVED by the owner's order 2026-07-22:
// "a gradient at the top/bottom appears only during turbo or the mixer's anger".
// Do NOT bring it back without his word; he was warned that white eyes against a light
// daytime sky give ~1.6:1 (graphics measurement: background 204, the WCAG threshold 3:1).

// THE SKY — A PROCEDURAL GRADIENT INSTEAD OF JPEG PANORAMAS (the owner's spec
// 2026-07-22: "for the mobile web, drop the background picture and solve the
// background with a gradient"). The module 05-sky.js with three base64 panoramas was REMOVED.
// Three anchors for each time of day: zenith / horizon / nadir; between them there is
// LINEAR interpolation by the height of the view direction d.y (1 zenith, 0 horizon, −1 nadir).
// ⚠️ The colours were TAKEN FROM THE PANORAMAS THEMSELVES (an average over a height band) — so that the view on
// a phone would match the previous one and not merely be "similar". Linear interpolation, NOT
// smoothstep: a measurement of the panoramas' profile showed an almost linear course — at e=0.707
// the divergence is 0-4 out of 255, whereas smoothstep would have lifted the horizon into a band.
// ⚠️ The values are RAW sRGB (the sky shader bypasses tone mapping and the sRGB conversion),
// like the FEVER_* next to them (⛔ the neighbouring sample `GRIND_COLOR` was removed 2026-08-20 together with
// the red top — now compare only with FEVER_*). The hour boundaries are the same
// as the panoramas had.
// ⚠️ ONLY DAY AND NIGHT (the owner's spec 2026-07-29: "leave only day and night
// for the background image/gradient"). Morning (#fdedd6/#f8dcbf/#f1bba3, hours 5-11)
// was REMOVED — its hours went to the day. A side benefit: the boundaries are now exactly the same
// as those of isNightSky in 85-hud, and the duplicated hour stopped being a place
// where two functions could diverge.
//
// ⚠️⚠️ THE OWNER'S MULTI-STOP PALETTES (spec 2026-07-31 "try making the night time
// with these parameters", plus the daytime one). They CANCEL the previous three anchors
// (zenith/horizon/nadir), which were taken from the panoramas: day #cee4fe/#cdddfe/
// #bec7fe, night #283667/#2b3865/#1f284f. To bring them back = put them here as three
// stops, nothing else needs editing.
// ⚠️ WE STORE HEXES, NOT float triples, like the neighbouring FEVER_* (⛔ the second such
// neighbour, `GRIND_COLOR`, was removed 2026-08-20):
// the owner gives colours as a CSS string and will be editing those same ones — triples would force
// a manual recalculation and would lie on a typo. This is STILL RAW sRGB:
// the sky shader bypasses tone mapping and the sRGB conversion, no
// convertSRGBToLinear may be applied to them (otherwise the sky goes grey).
// ⚠️ THE STOPS ARE EVEN ALONG THE VIEW HEIGHT: the first = the zenith (d.y=+1), the last =
// the nadir (d.y=−1), linear in between — exactly the way the owner's CSS gradient 180deg
// lays the stops along the height of a block. The number of stops is arbitrary, the ramp is baked by
// buildSkyRamp (10-stage); changing the array length is safe.
// ⚠️⚠️ THE TIME-OF-DAY BOUNDARIES — ONE PLACE FOR TWO CONSUMERS (the owner's spec
// 2026-07-31 verbatim: "day until 20:00, night from 20:00"; he did not touch the morning
// boundary). BOTH read them: skyTimeNow (10-stage — the sky, the fever) and isNightSky
// (85-hud — html.night: the showcase theme, the button colour rule; ⛔ the Shake inversion
// was REMOVED 2026-08-21 — the button became an icon without a backing, the tombstone is in 85-hud).
// ⚠️ PREVIOUSLY THE NUMBER 18 WAS WRITTEN INTO BOTH FUNCTIONS BY HAND and rested on
// the comment "we duplicate it deliberately". The spec moved the boundary, and this is exactly the
// case that makes a duplicate dangerous: editing one function would have given a DAYTIME SKY
// WITH A NIGHT BUTTON THEME from 20 to 22. Now a divergence is impossible.
const SKY_DAY_FROM = 5;      // from this hour — day
const SKY_NIGHT_FROM = 20;   // from this hour — night (it was 18 before 2026-07-31)

// HOW TO LAY THE STOPS OVER THE FRAME: 'screen' — like a CSS gradient 180deg (the top
// of the frame = the first stop, the bottom = the last); 'view' — by the height of the VIEW direction (the zenith =
// the first stop, the nadir = the last, the horizon in the middle).
// ⚠️ 'screen' BY DEFAULT, AND THIS IS A DECISION BY MEASUREMENT, not by taste: the camera
// looks FROM ABOVE INTO THE BOWL, so with 'view' only the tail of the ramp lands on the screen —
// the positions 70.6%..100% (day) and 70.5%..97.8% (night), that is, the first
// ~70% of the owner's stops are NEVER seen. Plus with 'view' the variables
// --sky-top-rgb/--sky-bot-rgb (the tint of the Safari bars) diverge from the real
// edge of the frame, while with 'screen' they coincide by construction.
// ⚠️ THE STARS DO NOT DEPEND ON THE MODE — they are computed from the 3D direction and stay
// tied to the world, that is, they honestly move as the camera turns.
const SKY_MAP = 'screen';

// ⚠️⚠️ A STOP MAY CARRY A POSITION: `'#85dcff 0%'`. This is THE VERY FORM in which
// the owner sends a gradient (a CSS string from his generator) — so that an edit
// reduces to pasting his string rather than to converting into a foreign format. The parsing is
// `parseSkyStops` in 10-stage, one for all consumers.
// ⛔ THE RULE "ALL OR NONE": positions are present on EVERY stop of a palette or on none
// of them (then the layout is even, as it used to be). A mixture means a loud warn and
// an even layout: partial positions are completed in CSS in a tricky way, and
// diverging from the browser on the quiet is worse than refusing.
// ⚠️⚠️ THE SKY FADE — 40% WHITE OVER THE GRADIENT (the owner's word 2026-08-22-g:
// "on the screen put a fade of 40% white over the gradient across the whole area").
// ⛔ IT IS APPLIED NOT AS A LAYER BUT TO THE STOPS THEMSELVES, AND THAT IS LOAD-BEARING. A separate white
//    layer over the sky would give EXACTLY THE SAME pixel (over(white@.4, c) =
//    0.4·white + 0.6·c = mix(c, white, .4)), but it would split the edges apart: the tint of the
//    Safari 26 bars is taken from `--sky-top-rgb`/`--sky-bot-rgb`, and those are computed from
//    the stops. A layer on top — and the variables would start lying about the colour of the frame's edge,
//    that is, the bars recipe, which cost five editions, would break.
// ⚠️ THE SOURCE IS ONE: `SKY_STOPS` holds the owner's PURE palette, and the lightening
//    is applied by the stop parsing (`parseSkyStops` in 10-stage) — once, on
//    both paths (loading and live substitution). The displayed colour = fade(palette).
// ⚠️ THE PAUSE SCREEN IS LIGHTENED BY THE SAME NUMBER FOR FREE: it draws `--sky-grad`,
//    and that string is assembled from the same lightened stops.
const SKY_FADE_WHITE = 0.40;
const SKY_STOPS = {
  // ⚠️⚠️ THE OWNER'S PALETTE 2026-08-20-b (he sent OKLCH + hexes and positions):
  //   0%   oklch(85.21% 0.0971 225.86)  #85DCFF
  //   36%  oklch(89.20% 0.0810 211.54)  #9AEAFA
  //   65%  oklch(92.42% 0.0681 200.00)  #B0F4F8
  //   100% oklch(96.30% 0.0525 186.07)  #CCFFF8
  // ⛔ IT CANCELS the previous daytime palette of 2026-07-31 (7 even stops
  //    '#6e86ff','#4fa1ff','#42b9ff','#56ceff','#7ae0f9','#a3f0f5','#ccfff8' —
  //    periwinkle -> pale turquoise). To bring it back = put them here without positions.
  // ⚠️ WE STORE THE HEXES, AND THE OKLCH IN A COMMENT: the conversions are his, and he edits the same ones;
  //    computing OKLCH at runtime would mean introducing a second truth about the colour.
  // ⚠️ THERE ARE EXACTLY FOUR STOPS, AS HE SENT THEM — do not "simplify" and do not add
  //    intermediate ones: the owner has his own gradient generator, and all his stops
  //    are preserved as they are.
  // ⛔⛔ THE DAYTIME PALETTE WAS CHANGED ONCE MORE (the owner's word 2026-08-22-g, a screenshot
  //    of the stops panel): #869EFF 0% / #81CAFF 36% / #BCFBFF 65% / #CCFFF8 100%.
  //    THE POSITIONS ARE THE SAME, three colours out of four changed — the top moved from light blue into
  //    blue-violet. The previous one (2026-08-20-b) is a tombstone in the paragraph below.
  // ⚠️ TOGETHER WITH IT `SKY_FADE_WHITE` IS IN EFFECT (see below): on the screen the sky
  //    is shown LIGHTENED by 40% white. Here lies the owner's PURE palette —
  //    exactly as he sent it.
  // day: blue-violet -> pale turquoise (4 stops, EXPLICIT POSITIONS)
  // ⛔⛔⛔ THE DAY PALETTE, FIVE STOPS, WRITTEN IN OKLCH (the owner's word 2026-08-23-zh:
  // «update the gradient, bring its values to OKLCH», with his Figma stops panel attached).
  // ⛔ IT CANCELS the four-stop palette of 2026-08-22-g (`#869eff / #81caff / #bcfbff /
  // #ccfff8` at 0/36/65/100), which lived one day. The 0% and 36% positions survived; a fifth
  // stop appeared and the tail turned from cyan-white towards green.
  // ⚠️⚠️ THE HEX BESIDE EACH LINE IS HIS FIGMA VALUE AND IS THE PROVENANCE, NOT A DUPLICATE
  // TRUTH: the OKLCH triple is what the game reads. Every one of the five was verified to
  // round-trip back to exactly that hex, so writing them in OKLCH changed no pixel — the
  // notation moved, the colour did not.
  // ⚠️ A HEX STILL PARSES HERE. The old canon note («the owner pastes CSS strings, triples
  // would force a manual recalculation and would lie on a typo») has not stopped being true —
  // the very message that asked for OKLCH carried a panel full of hexes. Paste a hex and it
  // works; convert it when you have a moment.
  // ⚠️ THE ORDER IS ZENITH → NADIR, as before: the first stop is the top of the view.
  day: ['oklch(68.10% 0.1739 282.99) 0%',    // #8c86ff
        'oklch(78.53% 0.1127 250.91) 36%',   // #81beff
        'oklch(87.10% 0.0678 245.28) 61%',   // #b0daff
        'oklch(92.29% 0.0748 192.82) 81%',   // #aaf6f3
        'oklch(93.36% 0.1083 154.61) 100%'], // #aeffc9
  // night: deep blue -> magenta (12 stops)
  // ⚠️ THE TAIL IS TONED DOWN (the owner's spec 2026-07-31, the second iteration: "the purple
  // colour at the bottom is very aggressive, it is worth dimming it a little"). ONLY the
  // last 4 stops were touched, increasingly towards the bottom. THE OWNER'S VERDICT (the third iteration,
  // by letter): "C" — "quieter and darker", saturation −30% / lightness −16%,
  // the brightness of the bottom −31%. The top of the night and the whole daytime palette are as they were.
  // The original tail before the fix: '#9b3fc7', '#bc3dd1', '#de38d8', '#ff2fdc'.
  // The alternatives shown to the owner, a replacement is one line:
  //   B "darker"        …'#9439c0', '#ae31c2', '#c725c1', '#ea07c4'
  //   A "quieter" (was the recommendation) …'#9841c2', '#b442c7', '#cd41c8', '#e33ec8'
  // ⚠️ DO NOT CHANGE THE NUMBER OF STOPS (the owner's rule) — only their values.
  night: ['#031d83', '#192289', '#27278f', '#332c95', '#3d329b', '#4737a1',
          '#5c3cac', '#7b3ebb', '#943ebe', '#ab3bbd', '#be36b9', '#d826ba'], // the tail = VARIANT C (the owner's verdict; A was '#9841c2','#b442c7','#cd41c8','#e33ec8')
};

// THE COMBO FEVER and THE GRIND — screen-space gradients of the sky (the owner's spec via
// INTERFACE, 2026-07-21-v/d). THE BOTTOM — the soft glow of a combo/chain; THE TOP — red
// on the threat of a grind (mirrored to the bottom, the coordinate 1−sy). The values are RAW sRGB:
// the sky shader bypasses the renderer's tone mapping and sRGB conversion.
// ⚠️ THE FEVER COLOUR DEPENDS ON THE TIME OF DAY (the owner 2026-07-21-d): light blue #8cc7ff
// ONLY in the dark hours, in the light hours — the previous GREEN. The boundaries of the dark are the same as
// the sky gradient's (skyTimeNow: night = 18..5). The choice is in feverColorNow (10-stage), once at
// loading — like the panorama (the interface duplicates the hour with the night class in updateHUD).
// ⚠️ The glow does NOT bleach the panorama: the strength fades upwards and is limited by the ceiling
// FEVER_MAX — the sky stays readable even during a chain reaction (previously at uCombo=1 the whole
// top was flooded into pure white).
const FEVER_NIGHT = [0.55, 0.78, 1.00]; // #8cc7ff — the dark hours (the owner chose light blue for the night)
const FEVER_DAY   = [0.30, 0.87, 0.50]; // green — the light hours (the previous tone)
const FEVER_MAX  = 0.60;  // the ceiling of the combo admixture (the owner: K≈0.55-0.6)
const FEVER_SPAN = 0.75;  // the fraction of the height FROM THE BOTTOM over which the glow lives
// THE STARS v2 (the owner's spec 2026-07-31: "the stars are implemented weakly, their shape
// is cut. I would like to make them vector-based and add a weak twinkling").
// ⚠️ WHAT WAS WRONG — IT WAS COMPUTED, not guessed: a star was drawn ONLY inside
// its own grid cell, and a pixel beyond the face is counted by a different `ip` -> a different position
// -> there is no star there. Any star whose disc crossed a face was cut off BY A PLANE.
// At a radius of 0.24 of a cell and a UNIFORM jitter only 14% stayed intact:
// 85.9% were cut — exactly what the owner saw in the screenshot.
// THE CURE: the jitter was SQUEEZED towards the centre of the cell (STAR_JIT), the offset + the radius < 0.5 —
// a star physically cannot reach a face. We do not poll the neighbouring cells:
// 3×3×3 = 27 samples per pixel, and that is a full-screen pass.
// ⚠️⚠️ THE CELL BUDGET: STAR_JIT/2 + STAR_HALO · STAR_R · STAR_GRID < 0.5.
// ⛔ THIS CONDITION IS NECESSARY BUT NOT SUFFICIENT — that is what burned me: it is
// silent about how the sphere intersects a cell (see STAR_BAND below). THE ONLY
// REAL GUARANTEE IS A BRUTE-FORCE SWEEP: `node tools/star-cells-check.js`. If you touched any
// STAR_* — run it, do not trust the formula.
// Anything sticking out beyond half a cell is cut off by a face. I protected the core right away, and
// the HALO — not, and the first variant gave a sum of 0.97 against a limit of 0.5: around every
// star a light RECTANGLE appeared (caught with a ×8 crop, not by eye in the general
// view). The invariant is computed in 10-stage at loading and shouts into the console.
// The current set: 0.15 + 2.4·0.0038·34 = 0.46.
const STAR_GRID = 34;     // cells per unit of direction (the density of the grid)
const STAR_DENS = 0.9295; // the hash threshold: above it — the cell has a star
                          // (recomputed for STAR_BAND so that the number of stars stays the same)
const STAR_JIT  = 0.26;   // ⚠️ the fraction of a cell allotted to the jitter; more — the cutting comes back
// ⚠️⚠️ THE RADIAL BAND IS THE SECOND HALF OF THE CURE FOR THE CUTS, FOUND BY A REVIEW ON main.
// The first fix squeezed the jitter INSIDE the cell and stopped there — but a sphere can catch a cell
// with a CORNER, and then its angular patch is tiny regardless of the jitter.
// The budget formula did not contain this term and gave a FALSE GUARANTEE.
// MEASUREMENT (a full sweep of 21824 cells, rays from the centre to the exit from the cell):
//   before — core intact 69.6%, core cut 9.3%, no star at all 21.1%,
//          halo touched 31.1%;
//   after — core intact 100%, cut 0%, missing 0%, halo touched 0%.
// A star lives only in a cell that the sphere crosses CLOSE TO THE CENTRE:
// |length(cell centre) − STAR_GRID| < STAR_BAND. The price is that some cells stay empty,
// so the density threshold was lowered, and the number of stars stayed the same (593 against 570).
const STAR_BAND = 0.30;   // ⚠️ the width of the radial band, in cell units
const STAR_R    = 0.0038; // the angular radius of the core, rad (~3 px on a phone)
const STAR_HALO = 2.4;    // ⚠️ the outer radius of the halo AND of the rays, in fractions of STAR_R
// ⚠️ SIZE: MORE SMALL ONES AT THE SAME QUANTITY (the owner's word 2026-08-06:
// "more small stars without changing their current quantity — that will add
// variety"). We change ONLY the size distribution: `STAR_DENS` (how many
// cells have a star) is NOT TOUCHED — the number of stars depends on it.
// Size = mix(MIN, 1.0, pow(hash, BIAS)): BIAS > 1 shifts the sampling towards MIN,
// that is, there are more small ones, while the large ones stay large.
const STAR_SIZE_MIN = 0.34; // the lower bound of the size (it was 0.55 — there was nothing smaller)
const STAR_SIZE_BIAS = 2.1; // >1 — more small ones; 1.0 restores the previous even spread
const STAR_GLOW = 0.22;   // the strength of the soft halo around the core
const STAR_SPARK = 0.55;  // the strength of the four-ray spark (0 — a pure dot)
const STAR_TW_AMP = 0.32; // the amplitude of the twinkling (a fraction of the brightness) — "weak"
const STAR_TW_SPD = 0.55; // the base speed of the twinkling, rad/s — "slowly"
// ⚠️ THE PULSATION OF INDIVIDUAL STARS (the owner's word: "some stars, for example
// 1 in 10, pulsate very gently, smoothly changing their transparency"). This is NOT
// twinkling: the twinkling is on EVERY star and is weak (0.32), while the pulse is on a minority,
// deeper and three times slower, which is why it reads as a separate life rather than as noise.
// ⚠️ Its own phase from the cell hash: without it the sky would pulsate in unison.
// ⚠️ 0.30 is the owner's word 2026-08-11 ("increase the pulse to 3 in 10") AFTER
// watching it live. ⛔ It cancels the previous 0.10, set by his own word
// "very gently"; the guard of the production fraction moves with the number.
// ⚠️ The constant is read by TWO layers — the sky shader and the Play card canvas; there is no copy
// of the value, both will move together, and that is the intent.
// ⚠️ THE HISTORY OF THE NUMBER: 0.10 (1 in 10) → 0.30 (3 in 10) → 0.20 (2 in 10).
// The last edit is the owner's word 2026-08-17 "make the star pulse more frequent,
// every fifth one". ⚠️⚠️ THIS IS A DECREASE, NOT AN INCREASE, AND IT IS DELIBERATE: at the moment of
// the request it stood at 3 in 10, that is, "every fifth" is RARER than the current value. The divergence
// of the word "more frequent" with his own number was said to the owner out loud together with the fact
// (it is now 3/10, we are setting 2/10) — he confirmed the number. Do not "fix" it back
// having decided that it is a typo.
const STAR_PULSE_FRAC = 0.20; // the fraction of stars with a pulse (2 in 10)
const STAR_PULSE_AMP  = 0.55; // the depth: the brightness wanders 1.0 -> 0.45, the star does not go out
const STAR_PULSE_SPD  = 0.42; // rad/s — a period of ~15 s, "very gently"
// ⛔⛔ THE RED TOP DURING THE MIXER'S ANGER WAS REMOVED (the owner's word 2026-08-20: "remove
// the change of the background at the top (the reddening) when the mixer gets angry"). Here stood
// `GRIND_COLOR` [0.95, 0.28, 0.22], `GRIND_MAX` 0.80 (the saturation at the edge),
// `GRIND_SPAN` 0.42 (the fraction of the height FROM THE TOP), `GRIND_LEAD` 10 (how many seconds
// before the grind it started filling in) and the pair `GRIND_FADE_UP/DN` 0.35/0.20.
// ⚠️ THIS CANCELS THE SPEC OF 2026-07-21-d, for which the layer was introduced.
// ⚠️ The grind mechanic is intact — only the background display of the threat was removed.
// ⛔ DO NOT CONFUSE it with the neighbours by root, `FINALE_GRIND_MS` and `FIRE_AFTER_GRIND_MS`:
// the first is alive (the tempo of the final cleanup), the second was removed together with the fire at the eyes.

// ===== DEVELOPMENT MODE (the owner's spec 2026-07-29: close the blockers) =====
// ⚠️ WHY. In the production build the "Developer panel" button was open (a slider that
// makes the game easier, and "Reset progress" without a confirmation, going into the cloud) and
// the whole service interface window.__game — grant currency, grant a bundle for
// $19.99, move the timestamp on which the protection against clock changes rests. For a platform
// review this is an unfinished build, for the economy it is a cheat.
// ⚠️ WHY NOT CUT IT OUT ENTIRELY: THE WHOLE suite rests on this interface (234
// checks). If we cut it out, we would be testing something other than what we ship. So we do not
// delete it but CLOSE it — in production it is simply not in window.
// Development = file:// (that is how the suite goes), localhost (that is how the bridge tests go),
// or an explicit "?dev=1" / a key in storage — this is a loophole FOR THE OWNER, so he can
// open the panel on the live GitHub Pages without rebuilding the game.
// ⚠️ 'mixer_dev' = '0' FORCIBLY SWITCHES IT OFF — otherwise the production behaviour
// cannot be checked by a test: it always goes over file://.
const DEV = (function(){
  try {
    if (localStorage.getItem('mixer_dev') === '0') return false;
    if (localStorage.getItem('mixer_dev') === '1') return true;
    if (/[?&]dev=1/.test(location.search)) return true;
    if (location.protocol === 'file:') return true;
    const h = location.hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '';
  } catch(e){ return false; }
})();
// a class on <html> — with it the CSS shows the entry into debugging (otherwise it is always hidden)
try { if (DEV) document.documentElement.classList.add('dev'); } catch(e){}

// ===== QUALITY BY DEVICE POWER (the owner's spec 2026-07-29: "optimize,
// weak phones matter, but be able to tell that it is a weak phone") =====
// ⚠️ TWO TIERS, NOT FIVE. More tiers = more states in which the game
// looks different, and each one has to be checked. The owner asked to distinguish
// "weak", not to build a quality ladder.
// ⚠️ WE DETERMINE IT BY MEASUREMENT, NOT BY THE PHONE MODEL. The user-agent string is faked,
// and a list of models goes stale in half a year. We measure the MEDIAN of the real frame
// already during play: it does not lie either on a new flagship in power-saving mode,
// or on an old phone with a hot processor.
const PERF_SLOW_FRAME_MS = 30;   // a frame median worse than 30 ms (~33 fps) = weak
const PERF_WINDOW_MS = 2500;     // how many ms of play we accumulate the measurement before deciding
const PERF_MIN_SAMPLES = 20;     // but no fewer than this many frames, otherwise the median is random
// ⚠️ WE DECIDE BY TIME, NOT BY THE NUMBER OF FRAMES. The first version waited for 90 frames —
// and it came out the other way round: the weaker the phone, the LONGER it lives on
// high quality before the decision (at ×8 slowdown 90 frames is 9 seconds of lag). By
// time a weak one is determined in the same 2.5 s as a strong one, just with a smaller
// number of samples — hence the minimum.
const PERF_OUTLIER_MS = 200;     // frames longer than this are discarded: that is a tab switch, not rendering
// ⚠️ WE LOWER ONCE AND DO NOT RAISE BACK. Otherwise the game "breathes" at the boundary:
// lowered -> it got faster -> raised -> it lags again. Flickering quality
// annoys more than steadily medium quality.
const PERF_LOW_DPR = 1.0;        // against 1.5 on touch devices
const PERF_LOW_FX = 0.4;         // the fraction of particles out of the full one (dust 1280 -> 512)

const CFG = {
  fpsCap: 60,          // the frame cap (see FRAME_MIN_MS); 0 = switch it off for a measurement
  perfTier: 'high',   // 'high' | 'low' — set by applyPerfTier (10-stage)
  fxScale: 1,         // a multiplier of the particle count; 70-fx reads it on every effect
  fxSlow: 1,          // a divider of the effects' clock — ONLY for filming/debugging (see stepFX)
  // Difficulty (the owner's spec 2026-07): by default ANY pair matches
  // (overlaps are not checked, there is no veil); Hard enables the mechanic
  // of physical accessibility (the ray fan + the grey veil). ⚙️ + localStorage.
  hard: false,
  radiusOn: true,
  baseRadius: BASE_RADIUS_DEFAULT, // AT REST: the true gap (the owner's word 2026-08-11 "return it to 0.4-0.5"; it was 0.9). The slider in ⚙️ edits the same one
  matchRadius: 2.0, // the current one, recomputed in updateMatchRadius()
  highlight: true,
  sound: true,
  // A PROTOTYPE of "baked light" (an A/B for the owner, 2026-07-20): the items
  // move from MeshStandard+softbox to matcap. The flag is kept so that the
  // comparison is one tap away, and so is the rollback. Details in 10-stage.
  matcap: true,
  // "The explosion is like a shake" (2026-07-27-b): the strength of the jolt given to the WHOLE pile when
  // the bomb explodes. An A/B knob modelled on matcap — the owner's spec is ambiguous
  // ("make it similar" vs the complaint "indistinguishable from a shake"), so the effect
  // is switched off in one tap: __game.cfg.bombJolt = 0 (without a rebuild).
  bombJolt: BOMB_JOLT,
  bombWaveV: BOMB_WAVE_V, // the strength of the PUNCH (the scatter at the epicentre) — the second knob for tuning the explosion's force
  // ⚠️⚠️ THE STARTING SPEED OF THE TOPPED-UP ITEMS (the owner's word 2026-08-21-d:
  // "speed up the animation of the objects being dropped in, there is a feeling of dropped frames").
  // The feeling turned out to be the TRUTH, not an impression — a measurement (GPU metal, CPU ×4,
  // 390×844, lv.20): at rest the worst frame is 34.7 ms, during the turbo top-up it is
  // 64.3 with nine items in the air at once and a physics step of up to 29.1.
  // The lever was chosen so as to strike the CAUSE: the items fly longer -> more of them
  // are in the air at once -> harder for the solver. We give them an initial
  // downward speed, and each one spends half as much time in flight.
  // ⛔ WHY WE DID NOT RAISE MAX_FALL: 16 is the anti-tunnelling limit (v>20
  // punched through compounds, recorded in the physics canon). The starting speed is below
  // the terminal one, that is, the limit is not touched at all.
  // ⛔ AND WHY WE DO NOT SPAWN LOWER: the spawn stands above the bowl's rim (FUNNEL.H + 2),
  // lower means a risk of giving birth to an item INSIDE the pile, and that is an explosive depenetration.
  dropV0: DROP_V0,
};

// ⛔⛔ THE FIRE AT THE EYES WAS REMOVED BY THE OWNER'S WORD 2026-08-20 ("remove the fire at the eyes").
// Here stood `FIRE_DROP_MODE = 'fire'` (the lowering of the construction to make room for the flame crown,
// the decision of 2026-07-22) and `FIRE_AFTER_GRIND_MS = 3000` (it lit up after 3 s of
// CONTINUOUS grinding — an escalation, not a telegraph of an approach).
// They went TOGETHER: the lowering existed precisely to give the crown room.
// ⚠️ THE GRIND ESCALATION IS NOT ORPHANED: it is carried by the ANGRY EYES, the countdown under them and the
// spun-up blades themselves; the fire was a third representation of the same signal.
// ⛔ HERE STOOD "the red sky ladder (`uGrind`)" — it was removed ON THE SAME DAY as the second
// item from the same owner (see the GRIND_* block above). For an hour the file managed
// to contradict itself: one tombstone declared the layer removed, the second called
// it a living carrier. When you edit one — grep the neighbours BY PHRASE, not by symbol.
// ⛔ DO NOT CONFUSE IT WITH THE BURNING ITEM: `FIRE_EVERY_MS` / `FIRE_BURN_MS` /
// `FIRE_TOP_N` / `FIRE_BONUS_MULT` below — that is a DIFFERENT mechanic, and it is alive.

// ═══ THE PRODUCTION ADDRESS OF OUR OWN LEADERBOARD ════════════════════════
// A Cloudflare worker + D1, deployed 2026-08-10 (`server/leaderboard/`),
// a live smoke test 11/11 green. ⚠️ BEFORE THIS LINE THE FEATURE WAS SWITCHED OFF ENTIRELY AND
// SILENTLY: `LB_BASE` (82-lb.js) falls back to an empty string if `LB_URL` is not
// declared, and with an empty address the win-screen inset, the menu entry point and the
// screen itself honestly show nothing. That is, the server worked, the screen was
// laid out, and the player did not see the table at all — exactly the case where "nothing
// is broken" and "nothing works" look the same.
// ⚠️ OUR OWN DOMAIN, NOT `*.workers.dev`, AND THIS IS LOAD-BEARING: the workers.dev
// subdomain is switched off for us (`workers_dev = false` in wrangler.toml), that is,
// such an address would answer with a refusal. The guard in the suite holds both signs — the address is
// set AND it does not lead to workers.dev.
// ⚠️ IT IS OVERRIDDEN FOR DEVELOPMENT without touching this line: `?lb=1` (the stand at
// 127.0.0.1:8788), `?lb=<address>` or `localStorage.mixer_lb_url`.
// ⚠️⚠️ THE PRODUCTION ADDRESS LIVES ONLY ON A FOREIGN HOST. The suite, the soak and the workstreams' previews
// play until a win; a win banks the score, that triggers `onStarsChange` — and without
// the gate EVERY run would write a real row into the PRODUCTION table. The sending
// goes through: the worker's CORS is deliberately open (`ACAO: *`), a guest is fully
// entitled for us (the owner's decision), and `localStorage.clear()` in test sections
// issues a fresh id — that is, a NEW row on every run.
// ⚠️⚠️ THE FIRST VERSION OF THE GATE CHECKED ONLY `file:` — AND LET THINGS THROUGH. The suite raises
// ITS OWN http server and opens the game at `http://127.0.0.1:<port>/index.html`
// (the bridge/platform sections, four of them), and there the protocol is no longer `file:`. Measurement:
// after the "fix" two runs entered THREE rows into the live database (Perch/Teal/
// Magpie, score 100), removed by hand. The sign "locality" must be read by the
// HOST, not by the protocol — otherwise it checks a particular case.
// ⚠️ THE PRICE, NAMED EXPLICITLY: on the owner's preview port (8781) there will be no table
// either. A live check of "game → server" is done with a LINK carrying an explicit address:
// `http://localhost:8781/index.html?lb=https://lb.blendo.monster` — the parameter
// takes priority over the constant. This is a deliberate trade-off: silence on a local stand
// is cured with one link, while a table littered by bots — only by hand in the database.
// ⚠️⚠️ A PURE FUNCTION, NOT THE BODY OF AN IIFE — AND THIS IS LOAD-BEARING FOR THE CHECK. The gate has already
// let through a case nobody remembered twice (first http from the suite's own
// server, then `.local` and the local network). The enumeration can only be checked
// with A TABLE OF HOSTS, and a table cannot be run through `location`: the browser
// will not give an arbitrary name. That is why the decision is extracted into a function, the guard runs the
// list through it, and a separate end-to-end assert proves that the function is ACTUALLY
// connected to `location` (otherwise the table would be checking dead code).
// ⚠️ A WHITELIST IS IMPOSSIBLE: the game has many production hosts (the portals), and they are
// not known in advance. So we enumerate the LOCAL ones — and we must keep the list complete.
function lbHostIsLocal(protocol, hostname) {
  if (protocol === 'file:') return true;
  const h = String(hostname || '').toLowerCase();
  if (h === '') return true;                                  // file:// and anything else without a host
  if (h === 'localhost' || /\.localhost$/.test(h)) return true;
  if (h === '127.0.0.1' || /^127\./.test(h)) return true;     // the whole loopback 127/8
  // ⚠️⚠️ IPv6 ARRIVES IN BRACKETS: `location.hostname` gives `[fe80::1]`, not
  // `fe80::1`. Checking the prefix BEFORE stripping the brackets is pointless — not a single
  // string would match. The previous version closed `::1` only because
  // a literal `[::1]` stood next to it; with `fe80:` that trick no longer worked.
  // ⚠️ And the condition "is this IPv6 at all" (there is a colon) is mandatory: without it
  // `/^f[cd]/` would declare local any host of the form `fd-server.example.com`.
  const h6 = h.replace(/^\[|\]$/g, '');
  if (h6.indexOf(':') >= 0) {
    if (h6 === '::1') return true;                            // loopback
    if (/^fe[89ab]/.test(h6)) return true;                    // fe80::/10 link-local
    if (/^f[cd]/.test(h6)) return true;                       // fc00::/7 ULA
  }
  // ⚠️ BONJOUR `<name>.local` — THAT IS EXACTLY HOW THE PHONE REACHES THE MAC. This is the open
  // item "playtest on a phone": without this line the very first phone run
  // would pour into the production table. The regexp `.localhost` does NOT catch it.
  if (/\.local$/.test(h)) return true;
  // Private networks RFC1918 and link-local — a preview by IP on a home network.
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  return false;
}
// ⚠️⚠️ THE ADDRESS IS ALIVE EVERYWHERE, AND LOCALITY SUPPRESSES ONLY THE SENDING (the owner's
// decision 2026-08-10, his literal choice: "always read, do not send").
// THE REASON FOR THE FIX WAS A LIVE COMPLAINT: on his own stand the owner opened the menu and did not
// find the entry into the table at all, because the previous gate zeroed the ADDRESS, and with an
// empty address the reading is silent too. Meanwhile only the SENDING litters the table;
// reading (`/v1/top`, `/v1/me`) is harmless and is cached. So the gate stood on the
// wrong action: it switched the feature off entirely where it was enough to forbid
// writing. Now on a local stand the game LOOKS the way it does for a real player, while
// rows from our runs are still absent from the table.
// ⛔ `LB_NOSEND` IS READ BY 82-lb.js — do not rename it on your own.
// ⚠️⚠️ THE SEND BAN IS BY THE SIGN OF AUTOMATION, NOT BY THE HOST'S LOCALITY.
// THE LIVE COMPLAINT THAT FIXED THIS: "there is no leaderboard on the level completion
// screen". The mechanism is mine: by forbidding sending from ALL local stands, I
// deprived the owner of his own row; without a row there is no place either, and the win inset
// stays silent by the closed rule when there is no exact place. That is, the protection against
// bots switched the feature off for the ONLY live player.
// ⛔ THE CORRECT SIGN IS `navigator.webdriver`: it is exactly about what we are
// protecting against (the suite and the soak go via Playwright, measurement: `true`), and it does NOT touch
// a human at the same address (in an ordinary browser it is `false`). Plus `file:` —
// the runs open the build as a file, and that is not a player either.
// ⚠️ THE HOST'S LOCALITY NO LONGER SUPPRESSES SENDING: the owner's preview (8781) and
// a playtest from a phone over `<name>.local` write into the table like a real player.
// ⛔ The constant LB_LOCAL was cut out by the cleanup of 2026-08-12 — nobody read it
// (the guard stands on the function lbHostIsLocal, not on the constant; the previous
// comment "the guard stands on it" was untrue).
// ⚠️⚠️ THE LIMIT OF THIS GATE'S HONESTY (INTEGRATION's remark 2026-08-11, accepted
// verbatim): the pair "`file:` OR webdriver" rests on the fact that ALL our
// automated runs go by one of these two paths. The browser may not set the
// `navigator.webdriver` sign — headless is launched with
// `--disable-blink-features=AutomationControlled`. If a third stand appears that
// opens the game OVER HTTP and without this sign — it will write into the production
// database, and silently.
// ⚠️ And a second price, named in advance: the gate does NOT close MANUAL runs by
// the workstreams on their preview ports (8779/8781). A human who finishes a level
// there creates a real row. This is a deliberate trade-off — otherwise the owner
// would again be left without his own row — and it is cured with the link `?lb=1`.
const LB_NOSEND = (function () {
  try {
    if (typeof location !== 'undefined' && location.protocol === 'file:') return true;
    return !!(typeof navigator !== 'undefined' && navigator.webdriver);
  } catch (e) { return true; }
})();
const LB_URL = 'https://lb.blendo.monster';
