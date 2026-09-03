// ===== 77-save: resilient save v1 (localStorage + Bridge storage) =====
// Coins — a PAIR OF MONOTONIC earned/spent counters (balance = difference):
// merging divergences through max does NOT dupe the currency (a naive max
// over the balance would roll spending back on a failed write — the verdict
// of the plan audit). Stars — per-level max. Bridge storage is not real on
// every platform — then we honestly stay on localStorage.
const SAVE_KEY = 'mixer_save_v1';
// gen — the save's GENERATION: incremented by a progress reset. Otherwise the
// monotonic max-merge would resurrect zeroed coins from a lagging cloud copy
// (Bridge storage might not accept the zeros, and the max-merge «lifted» them
// back). ⚠️ Checklist for a new save field: add it to Save, to BOTH mergeSave
// branches (the carry-over when from.gen>gen and the merge when equal), and to
// resetProgress.
// ac — ACCUMULATION BY TYPE (the owner's spec 2026-07-22): lifetime
// monotonic counters of merged items of EACH type (key = the type name
// from the assets, TYPES[].name). The tier/multiplier are COMPUTED from the
// counter (accTier/accMult) and are not duplicated in the save — there is
// nothing to diverge. Merge: max by key (the he/hs pattern), the gen epoch is
// respected. On a model batch change orphaned keys are NOT lost (logged in
// accAuditOrphans).
// se/ss — THE SINGLE BALANCE (finalized by the owner 2026-07-24: «points=stars=
// balance»). se = the LIFETIME accumulated game score (denominated,
// score/SCORE_DENOM, banked on a win once per level), ss = lifetime
// spending. balance = se−ss — ONE number: the chip in game, the wallet in the
// menu, the leaderboard.
// ⚠️ WHY NOT A SINGLE BALANCE FIELD with a max-merge: what was spent WOULD BE
// RESTORED from a lagging cloud copy — a dupe (the audit's verdict, the coin
// rake). «One number» is SEMANTICS (a difference), storage stays two
// monotonic counters. Farming is no threat: the game is linear, there is no
// replay of finished levels (levelNum only grows) — the score is banked once
// per level.
// ⚠️ IF a level-select/replay appears — bring back «the best score per level»
// (Save.sc[lv], banking the delta), otherwise replaying an easy level = a farm.
// stars[lv] — the level's RATING (1..3), the quality of the run; NOT a wallet,
// max-merge, untouched by spending. bo — tiers bought with boost (max).
// uk — types bought IN ADVANCE (unlocking for balance; OR-merge). sm — the flag
// of the one-off migration of old saves (monotonic 0->1).
// ⚠️ tu — TOPPED-UP stars (monotonic, max-merge). ⚠️ THERE ARE NO ACTIVE
// SOURCES since 2026-07-27: star packs were removed by the owner's word («there
// is no such thing as a star pack»), and the bundle booster goes through se
// («it works on everything»). We do NOT remove the field — it is already in
// live saves (grandfather) and holds fix A for the future.
// SEPARATED from se (the played score) so that the LEADERBOARD is not
// pay-to-win (fix A, table №2 2026-07-24): what is bought fills the WALLET, but
// the rank grows only from the PLAYED score. balance(wallet)=se+tu−ss;
// leaderboard=se−max(0,ss−tu) (spending eats tu first, then the played score).
// bx — THE BUNDLE MULTIPLIER WINDOWS: {multiplier: expiry moment}. The key is
// the multiplier itself, so the merge is max BY KEY (like ac/bo) and an
// «upgrade» by someone else's tier is impossible by construction. na — the
// window without interstitial ads (epoch ms).
// pe/ps — SHAKES BOUGHT as a monotonic pair (the he/hs pattern), a permanent
// wallet on top of the 3 free ones per level. ls — «the last seen time», a
// monotonic mark against a clock rollback.
const Save = { ce: 0, cs: 0, he: 3, hs: 0, se: 0, ss: 0, tu: 0, stars: {}, ac: {}, bo: {}, uk: {}, sm: 0, gen: 0, bx: {}, na: 0, pe: 0, ps: 0, ls: 0, iw: 0, st: 0, sv: 0, mt: 0  }; // he/hs — hints (start 3, the owner's spec)
function coins(){ return Math.max(0, Save.ce - Save.cs); }
function totalStars(){ let s = 0; for (const k in Save.stars) s += Save.stars[k]; return s; }
function mergeSave(into, from){
  if (!from) return;
  const gi = into.gen || 0, gf = from.gen || 0;
  if (gf > gi){
    // a foreign copy from a NEWER generation (after a reset): take it whole
    into.ce = from.ce || 0; into.cs = from.cs || 0;
    into.he = from.he != null ? from.he : 3; into.hs = from.hs || 0;
    into.se = from.se || 0; into.ss = from.ss || 0; into.tu = from.tu || 0; into.sm = from.sm || 0;
    into.na = from.na || 0; into.pe = from.pe || 0; into.ps = from.ps || 0; into.iw = from.iw || 0;
    // naf — A FOREVER PURCHASE: survives even a generation change (a progress
    // reset does not cancel a paid product) — OR from BOTH sides
    into.naf = (from.naf || into.naf) ? 1 : 0;
    into.gn = into.gn || from.gn || ''; // name: our own non-empty one, else theirs
    into.gid = pickGid(into.gid, from.gid);   // the player key — see pickGid
    into.lv = Math.max(into.lv || 1, from.lv || 1); // level — max (the owner's word: synchronize the progress)
    into.st = from.st || 0; into.sv = from.sv || 0; into.mt = from.mt || 0;
    into.bx = Object.assign({}, (from.bx && typeof from.bx === 'object') ? from.bx : {});
    into.bb = Object.assign({}, (from.bb && typeof from.bb === 'object') ? from.bb : {}); // the play-time budget, 2026-09-03
    into.bu = Object.assign({}, (from.bu && typeof from.bu === 'object') ? from.bu : {});
    into.bs = Object.assign({}, (from.bs && typeof from.bs === 'object') ? from.bs : {});
    into.stars = Object.assign({}, from.stars || {});
    into.ac = Object.assign({}, from.ac || {});
    into.bo = Object.assign({}, from.bo || {});
    into.uk = Object.assign({}, from.uk || {});
    into.gen = gf;
    return;
  }
  if (gi > gf) return; // a foreign copy from an OLD generation — ignore (we do not resurrect)
  into.ce = Math.max(into.ce || 0, from.ce || 0);
  into.cs = Math.max(into.cs || 0, from.cs || 0);
  into.he = Math.max(into.he || 3, from.he || 3); // old saves without he get the starting 3
  into.hs = Math.max(into.hs || 0, from.hs || 0);
  // ⚠️ STARS-AS-CURRENCY: max over BOTH counters. What was spent (ss) is not
  // rolled back by a lagging copy — that is exactly the anti-dupe protection.
  into.se = Math.max(into.se || 0, from.se || 0);
  into.ss = Math.max(into.ss || 0, from.ss || 0);
  into.tu = Math.max(into.tu || 0, from.tu || 0); // top-ups — monotonic, like se/ss
  into.sm = Math.max(into.sm || 0, from.sm || 0); // the migration is one-off across all devices
  into.mt = (into.mt || 0) | (from.mt || 0); // meta explainers — what was shown does not get «unshown»
  into.st = (into.st || 0) | (from.st || 0); // story chapters — OR-merge, what was shown does not get «unshown»
  into.sv = Math.max(into.sv || 0, from.sv || 0);
  into.iw = Math.max(into.iw || 0, from.iw || 0); // cadence, not currency: max = at most one extra show
  into.ls = Math.max(into.ls || 0, from.ls || 0); // the time mark is monotonic — a clock rollback is not cured by switching devices
  into.na = Math.max(into.na || 0, from.na || 0); // the no-ad window — monotonic
  into.naf = (into.naf || from.naf) ? 1 : 0; // «no ads forever» — OR: a purchase is not cancelled by a lagging copy
  into.gn = into.gn || from.gn || ''; // guest name: our own non-empty one wins
  into.gid = pickGid(into.gid, from.gid);       // the player key — see pickGid
  into.lv = Math.max(into.lv || 1, from.lv || 1); // level: max — progress is not rolled back by a lagging copy
  into.pe = Math.max(into.pe || 0, from.pe || 0); // bought shakes: a pair like he/hs,
  into.ps = Math.max(into.ps || 0, from.ps || 0); // a lagging copy does not resurrect what was spent
  // ⚠️ THE MULTIPLIER WINDOWS — max BY THE MULTIPLIER KEY. The key carries the
  // multiplier itself, so a copy with a short x5 can NOT «lift» an active x2: it
  // puts its own time into ITS OWN key. The previous scheme (one deadline+
  // multiplier pair) allowed such an upgrade — that is why it is split by keys.
  if (!into.bx || typeof into.bx !== 'object') into.bx = {};
  const bxf = (from.bx && typeof from.bx === 'object') ? from.bx : {};
  for (const k in bxf) into.bx[k] = Math.max(into.bx[k] || 0, bxf[k] || 0);
  // THE PLAY-TIME BUDGET (2026-09-03): bought and used are BOTH monotonic per multiplier key —
  // the he/hs pattern. Max of each: a lagging copy neither resurrects used time nor doubles a purchase.
  for (const f of ['bb', 'bu', 'bs']){
    if (!into[f] || typeof into[f] !== 'object') into[f] = {};
    const src = (from[f] && typeof from[f] === 'object') ? from[f] : {};
    for (const k in src) into[f][k] = Math.max(into[f][k] || 0, src[k] || 0);
  }
  const st = from.stars || {};
  for (const k in st) into.stars[k] = Math.max(into.stars[k] || 0, st[k] || 0);
  if (!into.ac) into.ac = {};
  const ac = from.ac || {};
  for (const k in ac) into.ac[k] = Math.max(into.ac[k] || 0, ac[k] || 0);
  if (!into.bo) into.bo = {};
  const bo = from.bo || {};
  for (const k in bo) into.bo[k] = Math.max(into.bo[k] || 0, bo[k] || 0);
  if (!into.uk) into.uk = {};
  const uk = from.uk || {};
  for (const k in uk) if (uk[k]) into.uk[k] = 1; // bought unlocks — OR-merge
}
function loadSave(){
  try { mergeSave(Save, JSON.parse(localStorage.getItem(SAVE_KEY) || 'null')); } catch(e){}
}
// The ×N play-time accumulator (the block «THE MULTIPLIER IS A PLAY-TIME BUDGET» below) is
// FOLDED into Save.bu here, at every commit — so a level end, a hint, a shake, a purchase all
// carry the used time for free, and the 60-second heartbeat only serves a long uninterrupted
// stretch. Declared up here, before the first commit can run.
let boostAcc = {}, boostAccMs = 0;
function boostFold(){
  if (!boostAccMs) return;
  if (!Save.bu || typeof Save.bu !== 'object') Save.bu = {};
  for (const k in boostAcc){ Save.bu[k] = (Save.bu[k] || 0) + boostAcc[k]; }
  boostAcc = {}; boostAccMs = 0;
}
function commitSave(){
  boostFold();
  const json = JSON.stringify(Save);
  try { localStorage.setItem(SAVE_KEY, json); } catch(e){}
  // Bridge — asynchronous, fire-and-forget: a failure is not critical (the merge is monotonic)
  try {
    if (window.bridge && window.bridge.storage) window.bridge.storage.set(SAVE_KEY, json).catch(()=>{});
  } catch(e){}
}
// after Bridge initialization (78-ads): pull the cloud copy and merge it
function bridgeSyncSave(){
  try {
    if (!(window.bridge && window.bridge.storage)) return;
    window.bridge.storage.get(SAVE_KEY).then(v => {
      if (!v) return;
      try { mergeSave(Save, typeof v === 'string' ? JSON.parse(v) : v); } catch(e){}
      migrateStarsToWallet(); // the cloud copy could have been pre-migration
      commitSave(); updateHUD(); fireStarsChange();
    }).catch(()=>{});
  } catch(e){}
}
// ── BUNDLES: multiplier window + consumables + the no-ad window ─────────────
// ⚠️ THE DEVICE CLOCK IS THE ONLY SOURCE OF TIME, and it cannot be trusted:
// setting the clock back = extending a paid window for free. The protection is
// the MONOTONIC `ls` mark (max-merged between devices, switching devices gives
// no way around it). On a rollback the remainder is RE-ANCHORED (see boostNow):
// zero time gained, zero time lost either. ⚠️ FULL protection is server-time,
// the zone of INTEGRATION (the same dependency as the daily ad cap).
let lsDirty = 0;
// ⛔⛔ THE MULTIPLIER IS A PLAY-TIME BUDGET SINCE 2026-09-03 (the owner's word: «only game
// time»), NOT a wall-clock window any more. `Save.bb[mult]` = milliseconds BOUGHT, `Save.bu[mult]`
// = milliseconds USED — a monotonic pair like he/hs and pe/ps: both max-merge, a lagging cloud
// copy can neither resurrect used time nor double a purchase. The budget burns ONLY from
// `boostTick`, which the loop (99-main) calls while the level is live: not paused, not the intro,
// not the win/lose screens, not with the matcap editor open. Nothing here reads the clock, so a
// clock rollback or jump cannot touch it — the whole re-anchoring machinery below is for the
// no-ads window `na` alone now. `Save.bx` (the old absolute deadlines) is a DEAD key: nobody had
// paid for a window before the launch, there is nothing to migrate.
// ⚠️ Used time is accumulated in memory (`boostAcc`, declared above commitSave) and FOLDED into
// `Save.bu` by EVERY commitSave (the end of a level, a hint, a shake, a purchase — all commit);
// `boostFlush` forces a commit every BOOST_FLUSH_MS of uninterrupted boosted play or when the
// budget hits zero. ⚠️ 60 s, NOT 5: each commit is a `bridge.storage.set` — a cloud write on the
// portal; the file's own precedent for a play-time heartbeat is the 60-second `ls` mark. A tab
// closed between commits loses up to one heartbeat of USED time — in the player's favour.
const BOOST_FLUSH_MS = 60000;
function boostBudgets(){
  if (!Save.bb || typeof Save.bb !== 'object') Save.bb = {};
  if (!Save.bu || typeof Save.bu !== 'object') Save.bu = {};
  return { bb: Save.bb, bu: Save.bu };
}
function boostLeft(m){ const b = boostBudgets(); return Math.max(0, (b.bb[m] || 0) - (b.bu[m] || 0) - (boostAcc[m] || 0)); }
// THE STREAK (the owner's word 2026-09-03: «you can buy an unlimited number of times, the time
// adds up» + the active badge is a PROGRESS BAR): `Save.bs[mult]` = the USED milliseconds at
// the moment a purchase started a streak from zero; the streak's total = bought − bs, and the
// bar shows remaining / total. A purchase on top of a live budget extends the total (10 of 30
// left + 30 bought = 40 of 60), a purchase from zero starts a new streak. Merged by max like
// the rest of the pair; reset with them.
function boostStreakTotal(m){ const b = boostBudgets(); if (!Save.bs || typeof Save.bs !== 'object') Save.bs = {}; return Math.max(0, (b.bb[m] || 0) - (Save.bs[m] || 0)); }
function boostProgress(){ const m = scoreBoostMult(); if (m <= 1) return 0; const t = boostStreakTotal(m); return t > 0 ? Math.max(0, Math.min(1, boostLeft(m) / t)) : 0; }
function boostFlush(){ if (boostAccMs) commitSave(); } // commitSave folds the accumulator itself
// Spend `ms` of play from the STRONGEST live tier only (the weaker ones wait — the queue
// semantics of 2026-07-28 survive the model change). The loop passes real frame time.
function boostSpend(ms){
  if (!(ms > 0)) return;
  const m = scoreBoostMult(); if (m <= 1) return;
  const use = Math.min(ms, boostLeft(m));
  boostAcc[m] = (boostAcc[m] || 0) + use; boostAccMs += use;
  if (boostAccMs >= BOOST_FLUSH_MS || boostLeft(m) <= 0) boostFlush();
}
// The loop's entry: one frame at a time, capped — a frame longer than a quarter second is a
// hitch or a thaw of the tab, not play (the pause gate in the loop already stops the rest).
function boostTick(rawMs){ boostSpend(Math.min(250, rawMs || 0)); }
function boostNow(){
  const now = Date.now();
  const seen = Save.ls || 0;
  const back = seen - now;
  if (back > 0){
    // ⚠️ THE CLOCK WAS ROLLED BACK (by ANY amount — there is deliberately no
    // threshold, see 00-config). RE-ANCHOR: we take the remainder AS OF THE LAST
    // HONEST MEASUREMENT (`seen`) and tie it to the current time. The player
    // gains not a single second (the time that really passed before the rollback
    // has already been written off) and loses nothing that was paid for.
    // ⚠️ The ls mark IS SYNCHRONIZED to now: without that a single clock jump
    // FORWARD would stick forever and every next PURCHASED window would die instantly.
    // ⛔ the `Save.bx` window loop stood here — the multiplier no longer lives on the clock (2026-09-03)
    const naLeft = Math.max(0, (Save.na || 0) - seen);
    Save.na = naLeft > 0 ? now + naLeft : 0;
    Save.ls = now;
    if (back > 1000) commitSave(); // micro-jitter of the clock is not written to disk
    return { now, rolled: true };
  }
  if (now > seen){
    Save.ls = now;
    if (now - lsDirty > 60000){ lsDirty = now; commitSave(); } // the mark is coarse — we do not write it every frame
  }
  return { now, rolled: false };
}
// ⚠️ MULTIPLIERS DO NOT STACK — the STRONGEST LIVE tier plays, and time is
// accumulated PER TIER separately (the dispatcher's default). Buying x5-for-30-
// minutes on top of x2-for-a-day, the player gets 30 minutes of x5, after which
// the x2 remainder comes back — nothing burns. ⚠️ Rejecting a purchase, as the
// former booster skeleton did, IS NO LONGER ALLOWED: a bundle carries
// consumables, and a refusal would eat what was paid for.
function scoreBoostMult(){
  const b = boostBudgets();
  let best = 1;
  for (const k in b.bb) if (boostLeft(k) > 0) best = Math.max(best, +k || 1);
  return best;
}
// The remainder of the ACTIVE (strongest) tier — play time left, for the on-screen timer.
function scoreBoostLeftMs(){
  const m = scoreBoostMult();
  return m > 1 ? boostLeft(m) : 0;
}
function boostClear(){ Save.bb = {}; Save.bu = {}; Save.bs = {}; boostAcc = {}; boostAccMs = 0; Save.bx = {}; Save.na = 0; commitSave(); } // does NOT touch naf: that is a purchase, not a boost
// GRANTING «NO ADS FOREVER» (Integration's stop-question when payments were
// introduced 2026-08-03): the PERMANENT flag Save.naf — unlike the temporary
// window Save.na of the bundles. It is called by the payment layer (78-ads
// purchase/restore) under the typeof grantNoAdsForever contract. Idempotent:
// restore calls it on EVERY start while the purchase hangs in getPurchases
// (non-consumable).
// THE GUEST NAME (the owner's word 2026-08-04: «use the names of animals and
// birds, that should be enough for a huge number. Avatars just by colour for
// now»). The Save.gn field: generated once per device, on a merge a non-empty
// name is NOT overwritten by a foreign one (when equal — the current device).
// The foundation for the leaderboards block; the avatar is a colour from the
// hash of the name (85-hud).
const AVATAR_COUNT = 49; // files in avatars/ (Avatar01..Avatar49) — the owner's assets
const GUEST_NAMES = ('Fox Owl Lynx Wolf Bear Hawk Crane Swan Raven Robin ' +
  'Finch Wren Heron Stork Eagle Falcon Kestrel Osprey Puffin Pelican ' +
  'Otter Beaver Badger Marten Stoat Weasel Hare Rabbit Squirrel Chipmunk ' +
  'Moose Elk Deer Bison Ibex Chamois Boar Hedgehog Mole Shrew ' +
  'Seal Walrus Dolphin Orca Narwhal Beluga Manatee Turtle Gecko Iguana ' +
  'Panda Koala Wombat Quokka Kiwi Emu Ostrich Rhea Cassowary Peacock ' +
  'Lion Tiger Leopard Cheetah Jaguar Cougar Caracal Serval Ocelot Margay ' +
  'Zebra Giraffe Okapi Gazelle Impala Oryx Kudu Eland Tapir Capybara ' +
  'Toucan Parrot Macaw Cockatoo Lorikeet Hummingbird Sunbird Kingfisher Bee-eater Hoopoe ' +
  'Magpie Jay Nutcracker Starling Thrush Blackbird Skylark Swallow Swift Martin ' +
  'Pigeon Dove Quail Partridge Pheasant Grouse Ptarmigan Lapwing Plover Sandpiper ' +
  'Curlew Godwit Avocet Oystercatcher Tern Gull Skua Gannet Cormorant Shag ' +
  'Loon Grebe Teal Wigeon Pintail Shoveler Pochard Eider Goldeneye Merganser ' +
  'Gadwall Mallard Goose Brant Crake Rail Coot Moorhen Bittern Egret ' +
  'Spoonbill Ibis Flamingo Crab Lobster Shrimp Krill Urchin Seahorse Marlin ' +
  'Tuna Salmon Trout Perch Pike Carp Bream Tench Rudd Roach ' +
  'Lemur Loris Tarsier Gibbon Mandrill Baboon Macaque Langur Colobus Sifaka ' +
  'Dingo Jackal Coyote Fennec Corsac Raccoon Coati Kinkajou Olingo Tanuki').split(' ');
// THE PLAYER KEY for OUR OWN leaderboard (the owner's decision 2026-08-07:
// «a guest needs to be assigned a unique id and always shown, effectively an
// auto-login in the game, but not a Google one»). The format is the same as the
// telemetry sid.
// ⚠️ MERGE = THE MINIMUM OF THE STRINGS, not «our own wins» (do NOT copy the gn
// rule: by construction it does not converge, and a person on two devices would
// get two rows in the table). The base36 timestamp is 8 characters long until
// the year 2059, so the lexicographic minimum = THE OLDEST id; the rule is
// idempotent and commutative — both copies converge to one value.
function pickGid(a, b){
  if (!a) return b || '';
  if (!b) return a;
  return a < b ? a : b;
}
function guestId(){
  if (!Save.gid){
    Save.gid = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    commitSave();
  }
  return Save.gid;
}
// ⚠️ THE IDENTITY IS DERIVED FROM THE KEY (the owner's word 2026-08-07 «better
// to reduce it to one»): the name and the avatar are computed from gid, so on
// two devices the player looks THE SAME. The price, named to the owner: for some
// players the name will change once on the first merge — accepted knowingly.
function gidHash(){
  const g = guestId(); let h = 0;
  for (let i = 0; i < g.length; i++) h = (h * 31 + g.charCodeAt(i)) >>> 0;
  return h;
}
function guestName(){
  const want = GUEST_NAMES[gidHash() % GUEST_NAMES.length];
  if (Save.gn !== want){ Save.gn = want; commitSave(); }
  return Save.gn;
}
function guestAvatar(){ return (gidHash() >>> 8) % AVATAR_COUNT + 1; } // the file number avatars/AvatarNN.png
function grantNoAdsForever(){
  if (Save.naf) return;
  Save.naf = 1;
  commitSave();
  try { updateHUD(); } catch(e){}
  try { Telemetry.ev('iap', { ph: 'grant', id: 'noads_forever' }); } catch(e){}
}
// THE NO-AD WINDOW: it suppresses ONLY interstitials; rewarded ones live on —
// the player asks for them himself (the dispatcher's decision), and they are the
// ones carrying the charges of hints/shakes.
function noAdActive(){ if (Save.naf) return true; const t = boostNow(); return (Save.na || 0) > t.now; }
function noAdLeftMs(){ const t = boostNow(); return Math.max(0, (Save.na || 0) - t.now); }
// SHAKES BOUGHT — a PERMANENT wallet as a monotonic pair (the he/hs pattern):
// anti-dupe by construction, the cloud max-merge does not resurrect what was spent.
function purchasedShakes(){ return Math.max(0, (Save.pe || 0) - (Save.ps || 0)); }
function spendPurchasedShake(){ if (purchasedShakes() < 1) return false; Save.ps = (Save.ps || 0) + 1; commitSave(); return true; }
// BUYING A BUNDLE — INTEGRATION's entry point (called AFTER a confirmed payment).
function buyBundle(id){
  const b = STAR_BUNDLES.find(x => x.id === id);
  if (!b) return { ok: false, reason: 'unknown' };
  const bd = boostBudgets();
  if (!Save.bs || typeof Save.bs !== 'object') Save.bs = {};
  if (boostLeft(b.mult) <= 0) Save.bs[b.mult] = (bd.bu[b.mult] || 0) + (boostAcc[b.mult] || 0); // a streak starts from zero: the bar's total resets
  bd.bb[b.mult] = (bd.bb[b.mult] || 0) + b.ms; // play time accumulates for ITS OWN tier
  // ⛔ no no-ads window in the package (2026-09-03): the `Save.na` line is gone with `noAdMs`
  Save.pe = (Save.pe || 0) + b.shakes;
  addHints(b.hints); // hints — into the existing he charges, no new system needed
  commitSave();
  Telemetry.ev('bundle_buy', { tier: b.id, usd: b.usd, mult: b.mult });
  return { ok: true, tier: b.id, mult: scoreBoostMult(), state: bundleState() };
}
// A snapshot for the INTERFACE (rendering the active bundle).
function bundleState(){
  const tiers = STAR_BUNDLES.map(b => ({ id: b.id, mult: b.mult, leftMs: boostLeft(b.mult), totalMs: boostStreakTotal(b.mult) }));
  return { mult: scoreBoostMult(), boostLeftMs: scoreBoostLeftMs(), progress: boostProgress(), tiers,
           shakes: purchasedShakes(), hints: hints(), noAd: noAdActive(), noAdLeftMs: noAdLeftMs() };
}
function hints(){ return Math.max(0, (Save.he || 0) - (Save.hs || 0)); }
function addHints(n){ if (n > 0){ Save.he += n; commitSave(); } }
function spendHint(){ if (hints() < 1) return false; Save.hs += 1; commitSave(); return true; }
function addCoins(n){ if (n > 0){ Save.ce += n; commitSave(); } }
function spendCoins(n){ if (coins() < n) return false; Save.cs += n; commitSave(); return true; }
// ⛔⛔ `setStars` IS GONE (2026-09-01-i) — nothing writes a rating any more.
// ⚠️ `Save.stars` ITSELF IS KEPT, READ-ONLY AND ON PURPOSE: the grandfather migration below
// (`starAward` over Save.stars) converts an OLD save's ratings into a starting balance, and it is
// gated by a monotonic flag, so a player who has not migrated yet would silently lose that
// conversion if the field were dropped. It is now written by nothing and read by exactly one
// one-time path. ⛔ Do not "tidy" it away without checking that flag first.

// ===== STARS-AS-CURRENCY: the wallet (the owner's decision 2026-07-23) =====
// A subscription for the interface: the balance changed (award/spending/migration).
const starChangeCbs = [];
function onStarsChange(cb){ if (typeof cb === 'function') starChangeCbs.push(cb); }
function fireStarsChange(){
  const ev = { balance: starBalance(), earned: Save.se || 0, spent: Save.ss || 0 };
  for (const cb of starChangeCbs){ try { cb(ev); } catch(e){} }
  try { updateHUD(); } catch(e){}
}
// THE WALLET = what was played + top-ups − spending (what can be SPENT).
function starBalance(){ return Math.max(0, (Save.se || 0) + (Save.tu || 0) - (Save.ss || 0)); }
// THE LEADERBOARD (the owner's finalization 2026-07-24 + fix A of table №2):
// rank = only the PLAYED score. Spending first eats the top-ups (tu), and only
// the excess of spending over top-ups drops the played score — this way buying
// stars does NOT lift the rank (not pay-to-win), while spending on boost/unlock
// beyond what was bought knowingly drops the position (the owner's trade-off).
// The leaderboard feature itself is waiting for the platform (Playgama/Yandex
// yes, Poki no) — for now it is a number-handle.
function leaderboardScore(){ return Math.max(0, (Save.se || 0) - Math.max(0, (Save.ss || 0) - (Save.tu || 0))); }
// THE DENOMINATED DISPLAY of the score: floor(max(0,score)/10). A single source
// for the chip AND for the floating pop numbers (the owner's #10 2026-07-27:
// «the numbers are clear both during play and in the tally»). ⚠️ A pop is
// computed as the DELTA of this value (scoreShownDelta), not floor(value/10)
// piece by piece — otherwise the sum of the pops diverges from the chip's growth
// by the carry (±1 drift). The guarantee: Σ of pops = the change of the chip
// over the level, bit for bit.
function scoreShownDenom(v){ return Math.floor(Math.max(0, v || 0) / SCORE_DENOM); }
// ⛔⛔ THE DELTA IS HONEST BELOW ZERO SINCE 2026-08-23-d (the owner: «why do I see +0 points
// from a merge?»). It used to be the difference of two CLAMPED values, so while the level
// score sat in the minus BOTH ends clamped to 0 and every gain popped up as «+0» — the player
// merged a pair and the game told him it was worth nothing.
// ⚠️⚠️ WHY IT WENT UNNOTICED FOR A MONTH AND SURFACED NOW: going into the minus used to be
// rare and shallow (a miss cost 1 point). Since the miss was re-based to 10 points against a
// pair's 2, the minus is a normal state — so the clamp stopped being an edge case and became
// what he sees. **A display rule that is only correct in the common case is a bug waiting for
// a balance change.**
// ⚠️ THE CONSEQUENCE, STATED RATHER THAN HIDDEN: the identity «Σ of the pops = the change of
// the chip» (his #10 of 2026-07-27) now holds only while the score is ABOVE zero. Below zero
// the pops keep describing the LEVEL SCORE honestly while the chip keeps describing the
// WALLET, which cannot go negative — two different quantities that used to coincide. The
// alternative was to keep lying about the gain, and a wrong number is worse than two numbers
// that mean different things.
// ⚠️ `scoreShownDenom` ITSELF KEEPS ITS CLAMP: it feeds the chip and the bank, and a negative
// wallet is meaningless.
function scoreShownDelta(before, after){
  return Math.floor((after || 0) / SCORE_DENOM) - Math.floor((before || 0) / SCORE_DENOM);
}
// The LIVE balance for the in-game chip (a request to the INTERFACE: the chip
// shows balance, not the per-level score): the banked balance + the still NOT
// banked score of the current level. On a win the score goes into se, so the
// number is continuous.
// The UNBANKED part of the current level, minus what was already banked EARLY
// (level.banked — the run's watermark, lives in the level's memory).
function liveScoreDenom(){
  try {
    if (typeof level !== 'undefined' && level && !level.over &&
        typeof stats !== 'undefined' && stats)
      return Math.max(0, scoreShownDenom(stats.score) - (level.banked || 0));
  } catch(e){}
  return 0;
}
function liveBalance(){ return starBalance() + liveScoreDenom(); }
// ⚠️ BANKING ON DEMAND (the owner's spec 2026-07-28 «during the game one number,
// and on the pause screen another» → the wallet SHOWS liveBalance). What is
// shown must be SPENDABLE: if the banked amount is not enough but with the
// current level it is — we bank what has been accumulated now and move the
// watermark so that the win does NOT bank it a second time.
function bankLive(){
  const add = liveScoreDenom();
  if (add <= 0) return 0;
  Save.se = (Save.se || 0) + add;
  if (typeof level !== 'undefined' && level) level.banked = (level.banked || 0) + add;
  commitSave(); fireStarsChange();
  return add;
}
// The single gate for all spending.
function ensureBanked(price){
  price = Math.max(0, price | 0);
  if (starBalance() >= price) return true;   // the banked amount is enough as it is
  if (liveBalance() < price) return false;   // not enough even with the current level
  bankLive();
  return starBalance() >= price;
}
// BANKING THE SCORE ON A WIN (the owner's finalization: «everything earned in a
// level = balance»). se += score/SCORE_DENOM (denomination ×10, floor, clamped
// ≥0). Once per level — the game is linear, there is no replay, so it cannot be
// farmed.
function bankLevelScore(score){
  const total = Math.floor(Math.max(0, score || 0) / SCORE_DENOM);
  const pre = (typeof level !== 'undefined' && level && level.banked) || 0;
  const rest = total - pre;
  if (rest > 0) Save.se = (Save.se || 0) + rest;
  // ⚠️ THE SCORE FELL AFTER AN EARLY BANK (penalties/grinding): more was banked
  // than the level ended up being worth. Decreasing se IS NOT ALLOWED — it is
  // monotonic, and a max-merge with a lagging cloud copy would bring back what
  // was written off (the coin rake). The correction goes into ss (also
  // monotonic): the difference se−ss comes out EXACTLY floor(score/10), and the
  // leaderboard se−max(0,ss−tu) converges the same way.
  else if (rest < 0) Save.ss = (Save.ss || 0) + (-rest);
  if (typeof level !== 'undefined' && level) level.banked = Math.max(pre, total);
  commitSave(); fireStarsChange();
  return total; // «earned in the level» in full, including what was banked early
}
// The win's face value by RATING — kept ONLY for the grandfather migration of
// old saves (they have no score history, so we seed the starting balance from
// the rating; the magnitude matches the new banking, ~hundreds per level). It
// no longer computes the currency for a win — that is carried by bankLevelScore.
function starAward(lv, stars){
  if (!(stars > 0)) return 0;
  return (STAR_AWARD[Math.min(3, stars)] || 0) + STAR_LEVEL_BONUS * Math.max(1, lv | 0);
}
// TOPPING UP the wallet (ads/IAP) — into tu, NOT into se: it does not lift the
// leaderboard (fix A). It feeds the wallet and is spent on par with the played score.
// ⚠️ There are no live calls since 2026-07-27 (the packs were removed): it stays
// an entry point for future top-ups and the starGrant test handle. It writes
// into tu — it does not lift the rank.
function addStars(n){ if (n > 0){ Save.tu = (Save.tu || 0) + n; commitSave(); fireStarsChange(); } }
function spendStars(n){
  n = Math.max(0, n | 0);
  if (!ensureBanked(n)) return false;
  Save.ss = (Save.ss || 0) + n;
  commitSave(); fireStarsChange();
  return true;
}
// THE ONE-OFF MIGRATION of existing saves: players have already accumulated a
// rating — we credit a starting balance at the same face value, the progress is
// not zeroed. It is idempotent: the sm flag is monotonic and max-merged, so a
// second device / a second start will not credit it again.
function migrateStarsToWallet(){
  if (Save.sm) return 0;
  let sum = 0;
  for (const lv in Save.stars) sum += starAward(parseInt(lv, 10) || 1, Save.stars[lv] || 0);
  Save.sm = 1;
  if (sum > 0) Save.se = (Save.se || 0) + sum;
  commitSave();
  if (sum > 0){ try { Telemetry.ev('stars_migrate', { n: sum }); } catch(e){} }
  return sum;
}

// ===== BOOST: buying an accumulation tier for stars =====
// Bought tiers live SEPARATELY from the merge counter (ac): ac is «how many were
// rescued» (the showcase/museum show the honest number), bo is «how many were
// bought on top». The resulting tier = the sum, with a shared cap.
function boostTier(name){ return (Save.bo && Save.bo[name]) || 0; }
// ⚠️ «AT LEAST ONE ITEM IS UPGRADED» — this is about the BOUGHT tiers
// (`Save.bo`), not about the ones earned by accumulation (`Save.ac`). The earned
// ones come by themselves from playing, and a condition on them would be met
// almost immediately — that is, the gate would be decorative. A bought tier is a
// deliberate spend, and that is exactly what the owner called «upgrading».
function anyBoostBought(){
  if (!Save.bo) return false;
  for (const k in Save.bo) if ((Save.bo[k] | 0) > 0) return true;
  return false;
}
function boostPrice(name){
  if (!isTypeUnlocked(name)) return null;          // boost only for an UNLOCKED type (the gate)
  if (accTier(name) >= ACC_TIER_CAP) return null;  // the multiplier is already at the ceiling — nothing to give
  if (boostTier(name) >= BOOST_TIER_CAP) return null; // the bought ceiling (anchor 62000, review fix)
  // ⚠️ THE PRICE is based on the BOUGHT tiers (boostTier), NOT the total ones
  // (accTier) — fix B of table №2: otherwise boosting a WELL-PLAYED type (it has
  // earned tiers) would cost 2000·2^earned, «the max of a favourite» blew up to
  // 248k+, and the pack anchor «Mega=the max of a type=62000» was lying. Now
  // every bought tier doubles regardless of how much it was played:
  // 2000/4000/8000/16000/32000 (cap BOOST_TIER_CAP=5 → the sum 62000,
  // universal for any type).
  return Math.round(BOOST_PRICE_BASE * Math.pow(BOOST_PRICE_MULT, boostTier(name)));
}
function canBoost(name){ const p = boostPrice(name); return p != null && liveBalance() >= p; } // by what is SHOWN
function buyBoost(name){
  if (!isTypeUnlocked(name)) return { ok: false, reason: 'locked' }; // unlock the type first
  const p = boostPrice(name);
  if (p == null) return { ok: false, reason: 'capped', tier: accTier(name), boughtTier: boostTier(name) };
  if (!ensureBanked(p)) return { ok: false, reason: 'insufficient', price: p, balance: liveBalance() };
  if (!Save.bo) Save.bo = {};
  Save.ss = (Save.ss || 0) + p;          // spending — via the monotonic counter
  Save.bo[name] = boostTier(name) + 1;
  commitSave(); fireStarsChange();
  try { Telemetry.ev('boost', { t: name, tier: accTier(name), price: p }); } catch(e){}
  return { ok: true, price: p, tier: accTier(name), mult: accMult(name),
    balance: starBalance(), next: boostPrice(name) };
}
// A full progress reset (the button in ⚙️): the zeros are written to the Bridge
// cloud TOO, and gen++ makes the new generation NEWER than any lagging cloud
// copy — even if writing the zeros to the cloud fails, mergeSave will not
// resurrect the old copy
function resetProgress(){
  Save.gen = (Save.gen || 0) + 1;
  Save.ce = 0; Save.cs = 0; Save.he = 3; Save.hs = 0; Save.stars = {}; Save.ac = {};
  Save.se = 0; Save.ss = 0; Save.tu = 0; Save.bo = {}; Save.uk = {}; Save.sm = 1;
  Save.bx = {}; Save.bb = {}; Save.bu = {}; Save.bs = {}; boostAcc = {}; boostAccMs = 0; Save.na = 0; Save.pe = 0; Save.ps = 0; Save.iw = 0; Save.st = 0; Save.sv = 0; Save.mt = 0; // bundle windows, bought shakes, story chapters and meta explainers // sm=1: nothing to migrate, the rating is empty
  commitSave();
  levelNum = 1;
  try { localStorage.setItem('mixer_level', '1'); } catch(e){}
  Save.lv = 1;   // the level lives in the save too (sync between devices)
  // ⚠️⚠️ THE RESET MUST REACH THE LEADERBOARD (the owner's complaint 2026-08-11:
  // «I reset the progress, but stayed in the leaderboard at my old place»).
  // The mechanism already exists and works for spending: the `onStarsChange`
  // subscriber in 82-lb forgets the cache and sends the new number. The reset was
  // the ONLY change of the balance that notified nobody — that is, the game was
  // zeroed silently and the server never learned about it. Starting our own
  // network call here IS NOT ALLOWED: it would be a copy of someone else's path
  // next to a working one (the law the project has already been burned by five
  // times) and would diverge from it at the first edit.
  // ⚠️ The zero will reach the server only for someone who already has a row —
  // the gate stands in `lbSubmit` and is explained there.
  // ⛔⛔ WHAT MUST NOT BE TOUCHED HERE (Integration's review 2026-08-11, analysis
  // by code). The reset does NOT clear `mixer_lb_sent` and does NOT touch the
  // signing key — and that is load-bearing, not an accident:
  //   • were it to clear `mixer_lb_sent` — after a reload the memory of the
  //     submission would be empty, the zero would stop going out (the gate in
  //     `lbSubmit` looks exactly at it), and the owner's complaint would come
  //     back as «reset, reloaded, still in the table»;
  //   • were it to clear the signing key — under TOFU the player would FOREVER
  //     lose the right to update his row, and it would freeze with the old score.
  fireStarsChange();
}

// ===== ACCUMULATION BY TYPE: the API (the contract for the INTERFACE, see
// WORKSTREAMS). The thresholds are the owner's ×2+100 series:
// 100/300/700/1500/3100/6300... = 100·(2^n−1).
function accThreshold(t){ return t <= 0 ? 0 : 100 * (Math.pow(2, t) - 1); }
function accCount(name){ return (Save.ac && Save.ac[name]) || 0; }
// The tiers EARNED by merges (purchases not counted) — the showcase progress
// bar is computed from them: the player must see an honest «N of M rescued».
function accCountTier(name){
  const c = accCount(name);
  let t = 0;
  while (t < ACC_TIER_CAP && c >= accThreshold(t + 1)) t++;
  return t;
}
// The RESULTING tier = earned + bought with boost (a shared cap).
function accTier(name){ return Math.min(ACC_TIER_CAP, accCountTier(name) + boostTier(name)); }
function accMult(name){ return 1 + ACC_MULT_STEP * accTier(name); }
function accNext(name){ // the threshold of the next EARNABLE tier, or null at the cap
  const t = accCountTier(name);
  return t >= ACC_TIER_CAP ? null : accThreshold(t + 1);
}
// The tier-up event: the interface hangs a popup on it via onAccTierUp(cb); the
// callback receives { name, tier, mult, item } AT THE MOMENT the threshold is
// crossed (from doMatch). An error in someone else's callback does not break the
// match (try/catch).
const accTierUpCbs = [];
function onAccTierUp(cb){ if (typeof cb === 'function') accTierUpCbs.push(cb); }
function accAdd(name, n, item){
  if (!name || !(n > 0)) return;
  if (!Save.ac) Save.ac = {};
  const before = accTier(name);
  Save.ac[name] = accCount(name) + n;
  const after = accTier(name);
  commitSave();
  if (after > before){
    try { Telemetry.ev('acc_up', { t: name, tier: after }); } catch(e){}
    // ev.name — the HUMAN-READABLE label (rendered by the INTERFACE's popup),
    // ev.key — the asset key; item is LIVE: the mesh is valid, but the Rapier
    // body is already destroyed and the dissolve has started — take the portrait
    // right away inside the callback
    const ev = { name: accLabel(name), key: name, tier: after, mult: accMult(name), item: item || null };
    for (const cb of accTierUpCbs){ try { cb(ev); } catch(e){} }
  }
}
// HUMAN-READABLE TYPE LABELS (the INTERFACE's request 2026-07-22: the museum
// showcase was showing asset keys). The rule: cut off the pack prefix + a capital
// letter; the glued-together freaks go into the exceptions map. The labels are EN
// (like the buttons).
// ⚠️ The list of prefixes = ALL the TYPES packs (the INTERFACE's request
// 2026-07-22: the showcase produced «Brickround»/«Piratebarrel»). Starting a new
// pack — add its prefix here, otherwise the label will drift along with the
// asset key.
// The bricks got the word «brick» added: their names are bare shapes (round/bar/
// duo/stud...), and in the museum list «Round» does not read without support;
// the pirate items stand on their own (Barrel/Cannon/Chest) and go as they are.
// ⚠️ THE MAP KEYS ARE the FULL type names (not the trimmed ones): the trimmed
// form coincides across different packs (animalfish and foodfish both produced
// «Fish» — two indistinguishable rows in the showcase), so the map separates
// them by the original key.
const ACC_LABELS = {
  animalpolar: 'Polar bear', animalfish: 'Fish',
  carpolice: 'Police car', carrace: 'Race car', carfiretruck: 'Fire truck',
  cargarbagetruck: 'Garbage truck', carkartoobi: 'Go-kart', carbox: 'Box truck',
  carcone: 'Traffic cone',
  foodicecream: 'Ice cream', fooddonutsprinkles: 'Donut', foodfish: 'Cooked fish',
  foodwholeham: 'Whole ham', foodcakebirthday: 'Birthday cake',
  foodicecreamscoopmint: 'Mint ice cream', foodhotdog: 'Hot dog',
  foodchinese: 'Takeout box',
  // bricks: the names are bare shapes (round/bar/duo/stud...), in the museum
  // list «Round» does not read without support; the pirate items stand on their
  // own (Barrel/Cannon/Chest) and go as the trimmed form, as they are
  brickround: 'Round brick', brickbar: 'Bar brick', brickcorner: 'Corner brick',
  brickstud: 'Stud brick', brickclassic: 'Classic brick',
  bricksquare: 'Square brick', brickduo: 'Duo brick',
  // the Kenney packs: stripping the prefix is not enough, the stem itself is unreadable
  // («Vehiclemonstertruck», «Coga», «Presentacube», «Gingerbreadman»)
  holidaygingerbreadman: 'Gingerbread man', holidaypresentacube: 'Gift box',
  toycarvehiclemonstertruck: 'Monster truck', toycarvehiclespeedster: 'Speedster',
  toycarvehiclevintageracer: 'Vintage racer', factorycoga: 'Cog',
  // ⚠️ survivalfish needs a label of its OWN: `animalfish` is already «Fish» and `foodfish` is
  // «Cooked fish» — without this line the museum would show two cards called «Fish».
  // «Raw» is the dispatcher's default and was named to the owner; one string to change.
  survivalfish: 'Raw fish',
  // the props pack: only the two multi-word stems need an entry — «book», «hat»,
  // «soup», «cart», «ghost», «plunger», «matchbox», «dumbbell», «lifebuoy» and
  // «volleyball» all strip to a real word once `props` is in the prefix list below.
  propstoiletpaper: 'Toilet paper', propswater: 'Water bottle',
  // ⛔ BOTH KNIVES ARE GONE NOW (the kitchen one 2026-09-01-e, the kabar 2026-09-01-i,
  // both by his screenshot) - the pack carries no blade at all any more.
  // «Washer» reads as the small metal ring; «Bat» as the animal. Both are spelled out.
  propswasher: 'Washing machine',
  propswineglass: 'Wine glass', propsbeachball: 'Beach ball',
  // the owner's batch of 2026-08-28: only the ones whose stem does not read on its own
  // (basketball / volleyball / fries strip cleanly)
  sporttennisball: 'Tennis ball', sportsoccerball: 'Football',
  // ⚠️⚠️ THE KEY SAYS GOLF, THE MODEL IS A BASEBALL — NAMED TO THE OWNER, NOT FIXED SILENTLY.
  // His file is named «golf ball» in Russian, so the type key keeps his name (assets are taken as they
  // are). But the rendered portrait is a white ball with the classic red figure-of-eight seam;
  // a golf ball would have dimples and no seam. A label that contradicts the picture is the
  // actual defect, so the LABEL follows the model. If he meant golf, the artist sent the wrong
  // ball — one string here either way.
  sportgolfball: 'Baseball' };
// ⚠️ The list of prefixes = ALL the TYPES packs (the INTERFACE's request
// 2026-07-22: the showcase produced «Brickround»/«Piratebarrel»). Starting a new
// pack — add its prefix here, otherwise the label will drift along with the key.
// ── THE TEXTS OF THE LONG META (plan item 1.3: on a phone the showcase is not
// built, and the rule «merges grow the type's multiplier FOREVER» the player
// learns nowhere. In v2 this is sharper than it was in v1: the multiplier toast
// under the eyes (node 829:1242) shows «×1.25» on EVERY collection of an upgraded
// kind — the number keeps catching the eye constantly and is still explained by
// nothing).
// ⚠️ The strings live HERE, not on the surfaces: the toast, the museum and the
// win screen must speak about one and the same thing in ONE set of words. Should
// the wordings drift apart — the player will decide these are different mechanics.
const META_TIP_RULE = 1; // the Save.mt bit: the accumulation rule has been explained
// «300 saved» — how many of EXACTLY this kind were rescued. A number, not
// percentages: the counter is lifetime and has no upper bound, a share would lie.
function accSavedText(name){ return accCount(name) + ' saved'; }
// «next ×1.5 at 700» — what will change and when. Show it ONLY when there is a
// next tier: at the cap the «next …» line would be lying.
function accNextText(name){
  const n = accNext(name);
  if (!n) return 'max level';
  return 'next ' + accMultText(1 + ACC_MULT_STEP * (accCountTier(name) + 1)) + ' at ' + n;
}
function accMultText(m){ return '×' + (+m).toFixed(2).replace(/\.?0+$/, ''); }
// One line under the portrait: «Tiger · 300 saved». The name + the count turn a
// bare «×1.25» into an understandable quantity.
function accToastLine(name){ return accLabel(name) + ' · ' + accSavedText(name); }
// THE RULE — we explain it EXACTLY ONCE, at the moment of the first tier:
// earlier the player would not understand what it is about, later he has already
// got used to seeing the number without any meaning.
function accRuleDue(){ return !((Save.mt || 0) & META_TIP_RULE); }
function accRuleText(){ return 'This kind now pays more — forever'; }
function accRuleMark(){ Save.mt = (Save.mt || 0) | META_TIP_RULE; commitSave(); }
function accLabel(key){
  const k = String(key);
  if (ACC_LABELS[k]) return ACC_LABELS[k];
  // ⚠️⚠️ ALL ELEVEN PACKS, NOT FIVE. The comment above has demanded «the list of prefixes = ALL
  // the TYPES packs» since 2026-07-22, but the five Kenney packs were never added to it, and the
  // fallback therefore glued the prefix onto ELEVEN of the 87 cards the player actually reads:
  // «Toycarvehiclemonstertruck», «Holidaygingerbreadman», «Factorycoga», «Survivalfish»,
  // «Forestplant». Found by computing every label instead of reading the regex. The named ones
  // below also get a real ACC_LABELS entry — stripping alone still leaves «Vehiclemonstertruck».
  // ⚠️ Longest first: `toycar` must win over `car`, `forest`/`factory` over `food`. With `^` they
  // cannot actually collide today, but the order costs nothing and survives a new pack.
  const short = k.replace(/^(survival|factory|holiday|toycar|animal|pirate|forest|brick|props|sport|food|car)/, '');
  return short.charAt(0).toUpperCase() + short.slice(1);
}
// TYPE UNLOCKING BY PROGRESSION (the contract for GRAPHICS — a 3D portrait only
// for the unlocked ones, otherwise it spoils the models). The rule is THE SAME as
// in genLevel (40-items): types open IN THE ORDER of the TYPES array, 9 at lv.1,
// +1 per level, the pool's ceiling. levelNum is monotonic in a real game (it
// grows on a win), therefore = THE MAXIMUM REACHED. The interface has ITS OWN
// unlockedTypeCount (85-hud, its zone) — the numbers coincide; converge later,
// if it wants to.
function typesUnlockedCount(){
  const lvl = (typeof levelNum === 'number' ? levelNum : 1);
  return Math.min(TYPES.length, LEVEL_TYPES_MIN + Math.max(0, lvl - 1));
}
// Unlocked = by progression OR bought in advance for balance (uk). ⚠️ A bought
// unlock reveals the type in the COLLECTION/portrait (and allows a boost), but
// does NOT change genLevel's spawn pool (that would be an edit of the core/
// difficulty) — the type will start dropping in the game by the usual
// progression. The interpretation has been flagged to the dispatcher; if the
// owner wants an early SPAWN — that is a separate genLevel edit.
function isTypeUnlocked(name){
  const idx = TYPES.findIndex(T => T.name === name);
  if (idx >= 0 && idx < typesUnlockedCount()) return true;
  return !!(Save.uk && Save.uk[name]);
}
function unlockedTypes(){ return TYPES.filter(T => isTypeUnlocked(T.name)).map(T => T.name); }
// UNLOCKING A TYPE FOR BALANCE (the owner's finalization 2026-07-24). The price
// is LEVEL-SCALED (matrix #9, §v3): BASE + PER_LEVEL·levelNum — it grows with
// income and keeps a dent of ~29% of the bank at any level. Spending goes
// through ss → the balance and the leaderboard fall (the owner's deliberate
// trade-off). Already unlocked ones are not sold. ⚠️ The price is based on the
// CURRENT level, NOT on the distance to the type — spike safety is structural
// (the spawn gate), see §v3 TRIPWIRE.
function typeUnlockPrice(name){
  if (isTypeUnlocked(name)) return null; // already unlocked (by progression or bought)
  const idx = TYPES.findIndex(T => T.name === name);
  return idx >= 0 ? (TYPE_UNLOCK_BASE + TYPE_UNLOCK_PER_LEVEL * levelNum) : null;
}
function canUnlockType(name){ const p = typeUnlockPrice(name); return p != null && liveBalance() >= p; } // by what is SHOWN
function purchaseUnlock(name){
  const p = typeUnlockPrice(name);
  if (p == null) return { ok: false, reason: isTypeUnlocked(name) ? 'already' : 'unknown' };
  if (!ensureBanked(p)) return { ok: false, reason: 'insufficient', price: p, balance: liveBalance() };
  if (!Save.uk) Save.uk = {};
  Save.ss = (Save.ss || 0) + p; // spending — a monotonic counter (the leaderboard falls)
  Save.uk[name] = 1;
  commitSave(); fireStarsChange();
  try { Telemetry.ev('unlock_buy', { t: name, price: p }); } catch(e){}
  return { ok: true, price: p, balance: starBalance() };
}

// A snapshot for the museum showcase (the INTERFACE's contract, 85-hud picks it
// up by typeof): name — the label for display, key — the asset key (the argument
// of accCount and others), _item — a live item of the type for the offscreen
// portrait (or null), unlocked — whether the type is open by progression
// (GRAPHICS renders the portrait only for the unlocked ones; the field is
// additive — the old consumers are untouched).
function accSnapshot(){
  const openN = typesUnlockedCount();
  return TYPES.map((T, i) => {
    const k = T.name;
    let live = null;
    try {
      if (typeof items !== 'undefined' && items)
        live = items.find(i => i.alive && !i.animating && i.type && i.type.name === k) || null;
    } catch(e){}
    const prog = i < openN;
    return { name: accLabel(k), key: k, count: accCount(k), tier: accTier(k),
      mult: accMult(k), next: accNext(k),
      // BOOST for the owner's menu: how many tiers were bought on top, the price
      // of the next one (null — we hit the cap) and whether the balance is enough
      // right now
      boost: boostTier(k), price: boostPrice(k), affordable: canBoost(k),
      // UNLOCKING: unlocked = by progression OR bought; bought — bought
      // specifically (the interface tells «reached it» from «bought in advance»);
      // unlockPrice/canUnlock — for the «unlock for balance» button on the
      // LOCKED cards
      unlocked: prog || !!(Save.uk && Save.uk[k]), bought: !!(Save.uk && Save.uk[k]),
      unlockPrice: typeUnlockPrice(k), canUnlock: canUnlockType(k),
      _item: live };
  });
}
// Protection against a model batch change (the spec's mandatory link (b)): save
// keys that are absent from the current TYPES are NOT deleted — the progress will
// survive the type's return to the pool; a warning with the list goes to console.
function accAuditOrphans(){
  try {
    if (!Save.ac) return;
    const known = {};
    for (const T of TYPES) known[T.name] = 1;
    const orphans = Object.keys(Save.ac).filter(k => !known[k]);
    if (orphans.length)
      console.warn('[acc] orphaned accumulation counters (type outside the current batch, progress kept): ' + orphans.join(', '));
  } catch(e){}
}
loadSave();
// ⚠️ THE LEVEL LIVES IN THE SAVE TOO (the owner's word 2026-08-07: «the sync
// between devices is needed... both for points and purchases and for progress»).
// We take the MAXIMUM of the two sources: the save could have arrived fresher
// from the cloud, localStorage could be newer offline.
// ⚠️⚠️ THE BLOCK LIVES EXACTLY HERE, AFTER loadSave(), AND NOT IN 40-items: the
// concatenation sorts the modules by name, and in 40-items «typeof Save» threw a
// ReferenceError (the TDZ of a const), which an empty catch swallowed — since
// 2026-08-07 a cold start LOST the saved level, every restart began the game from
// the 1st. Found by an external review 2026-08-13; the guard «the level save
// survives a reload» in the suite stands exactly on this. `levelNum` is declared
// in 40-items (40 < 77) — by this moment it has long been alive, there is no TDZ
// here.
try {
  const fromLs = Math.max(1, parseInt(localStorage.getItem('mixer_level') || '1', 10) || 1);
  const fromSave = Math.max(1, (Save && Save.lv) || 1);
  levelNum = Math.max(levelNum, fromLs, fromSave);
} catch (e) {}
migrateStarsToWallet(); // one-off: the rating of existing saves -> the starting balance
accAuditOrphans();
