// ===== 86-story: wordless story vignettes (the canon — docs/STORY-SPEC.md) =====
// The owner's assignment 2026-07-30: «implement the story, start with K0 and K1».
//
// THE CORE OF THE LORE (§1 of the spec): the blender is obsessed with the Great
// Recipe — a smoothie made of everything that exists. He is sure that the PLAYER
// is his best helper: in his eyes a match looks like destruction (items burst
// into dust — our own effects), he is delighted by combos and DOES NOT KNOW that
// the things go to the museum. From the very first minutes the player knows more
// than the villain — a casual irony, understandable without a single word.
//
// ⚠️ INVARIANTS OBSERVED HERE TO THE LETTER (§0 and §6 of the spec):
//  1. WORDLESS — not a single line of dialogue, only pictograms. Localization is
//     not needed at all, and that is a deliberate invariant of the roadmap, not a
//     cost saving.
//  2. ZERO GAMEPLAY EDITS — the story is a layer on top: one call line in checkEnd
//     after show('winOverlay'), the core is otherwise untouched.
//  3. IT ADDS NO SCREENS to the «victory → Next» loop: the panel is NESTED into the
//     already shown victory screen (a layer on top), it does not stand before it.
//  4. ≤4 s on its own, a tap = an instant skip, a skip is NOT punished.
//  5. ≤1 vignette per STORY_GAP_LEVELS levels; a milestone outranks the queue.
//  6. Never before the first tap — gated on stats.taps (see storyOnWin).
//
// ⚠️ ZONE: the spec handed the overlay markup to the INTERFACE. I build it FROM JS
// and do not touch shell.html — this way the feature lies entirely inside its own
// zone and does not conflict with their branches. The interface can take over the
// styling / the move into markup later: there is a single entry point (storyPlay),
// and the panels are pure functions returning SVG.

const STORY_AUTO_MS = 4000;    // §6.2: the panel lives no longer than 4 s on its own
// ⚠️ THE PROLOGUE LIVES FASTER than the vignettes: it stands BEFORE the first game,
// and every extra second here hits the portal's trump card «I'm playing in 20 seconds».
// 3 panels × 2.6 s = 7.8 s in the worst case, if the player does not touch the screen
// at all; a tap flips through instantly, i.e. an attentive one gets through in ~1-2 s.
const STORY_INTRO_MS = 2600;
const STORY_GAP_LEVELS = 2;    // §6.3: no more often than one vignette per 2 levels
const STORY_INK = '#fff', STORY_DIM = 'rgba(255,255,255,.5)', STORY_ACC = '#c0ff47';
const STORY_BG = '#0e1320', STORY_PAPER = '#161c2a', STORY_FIRE = '#ff5a3c';

// ── The vocabulary of shapes. The language is the same as the character's: white
// forms, black pupils, flat fill. No gradients and no shadows (§3 of the spec).
function stEye(cx, cy, r, pr, dx, dy){
  return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="#fff"/>' +
         '<circle cx="' + (cx + dx) + '" cy="' + (cy + dy) + '" r="' + pr + '" fill="#1d1c26"/>';
}
// The blender's eyes. mood repeats the canonical states from EYES-CHARACTER-SPEC:
// 'calm' — checking against the recipe; 'dream' — gaze upwards, dreaming; 'adore' —
// pupils flung wide, «the helper has outdone himself».
function stEyes(cx, cy, mood){
  // ANGRY — a separate shape (in the game this is eyes-3, a wedge): the white is closed
  // off from above-and-inside by a «brow» in the backdrop colour. That way the anger
  // reads without any new geometry.
  if (mood === 'angry'){
    const brow = (bx, dir) =>
      '<path d="M' + (bx - 30 * dir) + ' ' + (cy - 34) + ' L' + (bx + 30 * dir) + ' ' + (cy - 8) +
      ' L' + (bx + 30 * dir) + ' ' + (cy - 34) + ' Z" fill="' + STORY_BG + '"/>';
    return stEye(cx - 30, cy, 26, 12, -3, 5) + brow(cx - 30, 1) +
           stEye(cx + 30, cy, 26, 12,  3, 5) + brow(cx + 30, -1);
  }
  const m = { calm:  { r: 26, pr: 11, dx: 0,  dy: 2 },
              dream: { r: 26, pr: 10, dx: 2,  dy: -9 },
              adore: { r: 27, pr: 17, dx: 0,  dy: 0 },
              doubt: { r: 26, pr: 10, dx: -8, dy: 3 },   // gaze to the side: «and where do they go?»
              sly:   { r: 26, pr: 12, dx: 7,  dy: 6 },   // sly: pupils down-and-sideways (eyes-2 in the game)
              shock: { r: 30, pr: 8,  dx: 0,  dy: 0 } }[mood] || { r: 26, pr: 11, dx: 0, dy: 2 };
  // for the sly ones we add a half-lowered upper lid — otherwise they read as calm
  const lid = mood === 'sly'
    ? '<rect x="' + (cx - 62) + '" y="' + (cy - 30) + '" width="124" height="17" fill="' + STORY_BG + '"/>' : '';
  return stEye(cx - 30, cy, m.r, m.pr, m.dx, m.dy) + stEye(cx + 30, cy, m.r, m.pr, m.dx, m.dy) + lid;
}
// The mixer jar — a recognizable silhouette, a thin outline (in the game the glass is almost transparent)
function stJar(x, y, w, h){
  const x2 = x + w, yb = y + h, i = w * 0.17;
  return '<path d="M' + x + ' ' + y + ' L' + x2 + ' ' + y +
         ' L' + (x2 - i) + ' ' + (yb - 12) + ' Q' + (x2 - i) + ' ' + yb + ' ' + (x2 - i - 14) + ' ' + yb +
         ' L' + (x + i + 14) + ' ' + yb + ' Q' + (x + i) + ' ' + yb + ' ' + (x + i) + ' ' + (yb - 12) + ' Z"' +
         ' fill="#161c2a" stroke="' + STORY_DIM + '" stroke-width="2.5"/>';
}
// A thought bubble: a cloud + two tail circles pointing at the character
function stBubble(x, y, w, h, tailX, tailY){
  return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (h / 3) +
         '" fill="rgba(255,255,255,.10)" stroke="' + STORY_DIM + '" stroke-width="2"/>' +
         '<circle cx="' + tailX + '" cy="' + tailY + '" r="7" fill="#161c2a" stroke="' + STORY_DIM + '" stroke-width="2"/>' +
         '<circle cx="' + (tailX - 11) + '" cy="' + (tailY + 15) + '" r="4.5" fill="#161c2a" stroke="' + STORY_DIM + '" stroke-width="2"/>';
}
// Ingredient pictograms — silhouettes of our own model packs (food/animal/car)
function stApple(x, y, s){
  return '<circle cx="' + x + '" cy="' + (y + s * .1) + '" r="' + s * .55 + '" fill="' + STORY_INK + '"/>' +
         '<path d="M' + x + ' ' + (y - s * .45) + ' q' + s * .35 + ' -' + s * .35 + ' ' + s * .5 + ' -' + s * .1 +
         ' q-' + s * .3 + ' ' + s * .25 + ' -' + s * .5 + ' ' + s * .1 + ' Z" fill="' + STORY_INK + '"/>';
}
function stAnimal(x, y, s){ // a muzzle with ears — reads as «a beast»
  return '<circle cx="' + x + '" cy="' + (y + s * .05) + '" r="' + s * .5 + '" fill="' + STORY_INK + '"/>' +
         '<path d="M' + (x - s * .45) + ' ' + (y - s * .3) + ' l' + s * .05 + ' -' + s * .45 + ' l' + s * .38 + ' ' + s * .26 + ' Z" fill="' + STORY_INK + '"/>' +
         '<path d="M' + (x + s * .45) + ' ' + (y - s * .3) + ' l-' + s * .05 + ' -' + s * .45 + ' l-' + s * .38 + ' ' + s * .26 + ' Z" fill="' + STORY_INK + '"/>';
}
function stCar(x, y, s){
  return '<rect x="' + (x - s * .6) + '" y="' + (y - s * .1) + '" width="' + s * 1.2 + '" height="' + s * .42 + '" rx="' + s * .14 + '" fill="' + STORY_INK + '"/>' +
         '<path d="M' + (x - s * .34) + ' ' + (y - s * .1) + ' l' + s * .16 + ' -' + s * .3 + ' l' + s * .4 + ' 0 l' + s * .16 + ' ' + s * .3 + ' Z" fill="' + STORY_INK + '"/>' +
         '<circle cx="' + (x - s * .32) + '" cy="' + (y + s * .34) + '" r="' + s * .16 + '" fill="' + STORY_INK + '"/>' +
         '<circle cx="' + (x + s * .32) + '" cy="' + (y + s * .34) + '" r="' + s * .16 + '" fill="' + STORY_INK + '"/>';
}
function stGlobe(x, y, s){ // THE EARTH — the last line of the recipe
  return '<circle cx="' + x + '" cy="' + y + '" r="' + s * .58 + '" fill="none" stroke="' + STORY_INK + '" stroke-width="3"/>' +
         '<ellipse cx="' + x + '" cy="' + y + '" rx="' + s * .26 + '" ry="' + s * .58 + '" fill="none" stroke="' + STORY_INK + '" stroke-width="2.4"/>' +
         '<path d="M' + (x - s * .58) + ' ' + y + ' L' + (x + s * .58) + ' ' + y + '" stroke="' + STORY_INK + '" stroke-width="2.4"/>';
}
function stDots(x, y, s){ // «…» — section after section, all the way down the list
  return '<circle cx="' + (x - s * .35) + '" cy="' + y + '" r="' + s * .1 + '" fill="' + STORY_DIM + '"/>' +
         '<circle cx="' + x + '" cy="' + y + '" r="' + s * .1 + '" fill="' + STORY_DIM + '"/>' +
         '<circle cx="' + (x + s * .35) + '" cy="' + y + '" r="' + s * .1 + '" fill="' + STORY_DIM + '"/>';
}
function stTap(x, y, s){ // a finger-tap: a circle + a spreading wave
  return '<circle cx="' + x + '" cy="' + y + '" r="' + s * .26 + '" fill="' + STORY_INK + '"/>' +
         '<circle cx="' + x + '" cy="' + y + '" r="' + s * .52 + '" fill="none" stroke="' + STORY_DIM + '" stroke-width="2.4"/>';
}
function stDust(x, y, s){ // dust — what HE sees instead of a rescue
  let o = '';
  const p = [[-.5,-.2,.13],[-.15,-.45,.1],[.2,-.25,.14],[.5,.05,.1],[-.35,.3,.11],[.1,.35,.13],[.42,-.4,.08]];
  for (const q of p) o += '<circle cx="' + (x + q[0] * s) + '" cy="' + (y + q[1] * s) + '" r="' + q[2] * s + '" fill="' + STORY_INK + '"/>';
  return o;
}
function stHeart(x, y, s){
  return '<path d="M' + x + ' ' + (y + s * .42) + ' C' + (x - s * .75) + ' ' + (y - s * .1) + ' ' + (x - s * .3) + ' ' + (y - s * .62) + ' ' + x + ' ' + (y - s * .18) +
         ' C' + (x + s * .3) + ' ' + (y - s * .62) + ' ' + (x + s * .75) + ' ' + (y - s * .1) + ' ' + x + ' ' + (y + s * .42) + ' Z" fill="' + STORY_ACC + '"/>';
}
// The question mark — we draw it with a PATH, not with text: no font is needed, and no
// localization either (a symbol, not a word — the «wordless» invariant is intact).
function stQuestion(x, y, s){
  return '<path d="M' + (x - s * .34) + ' ' + (y - s * .34) +
         ' a' + s * .36 + ' ' + s * .36 + ' 0 1 1 ' + s * .62 + ' ' + s * .3 +
         ' q-' + s * .28 + ' ' + s * .22 + ' -' + s * .28 + ' ' + s * .42 + '"' +
         ' fill="none" stroke="' + STORY_INK + '" stroke-width="' + s * .17 + '" stroke-linecap="round"/>' +
         '<circle cx="' + (x + s * .06) + '" cy="' + (y + s * .62) + '" r="' + s * .11 + '" fill="' + STORY_INK + '"/>';
}
// The museum shelf: the items stand there WHOLE and content — what he did not expect to see
function stShelf(x, y, w){
  return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="7" rx="3" fill="' + STORY_DIM + '"/>';
}
function stSpark(x, y, s){
  return '<path d="M' + x + ' ' + (y - s) + ' L' + (x + s * .28) + ' ' + (y - s * .28) +
         ' L' + (x + s) + ' ' + y + ' L' + (x + s * .28) + ' ' + (y + s * .28) +
         ' L' + x + ' ' + (y + s) + ' L' + (x - s * .28) + ' ' + (y + s * .28) +
         ' L' + (x - s) + ' ' + y + ' L' + (x - s * .28) + ' ' + (y - s * .28) + ' Z" fill="' + STORY_ACC + '"/>';
}
function stFlame(x, y, s){
  // ⚠️ A symmetric «droplet» read as a DROPLET, not as fire (visible on the screenshot).
  // We make the tongue of flame ASYMMETRIC and give it a lighter inner core —
  // two tones turn the silhouette into fire without gradients and textures.
  const outer = 'M' + x + ' ' + (y - s) +
    ' q' + s * .34 + ' ' + s * .42 + ' ' + s * .16 + ' ' + s * .72 +
    ' q' + s * .30 + ' -' + s * .12 + ' ' + s * .22 + ' -' + s * .40 +
    ' q' + s * .42 + ' ' + s * .58 + ' -' + s * .04 + ' ' + s * 1.02 +
    ' q-' + s * .34 + ' ' + s * .30 + ' -' + s * .72 + ' 0' +
    ' q-' + s * .46 + ' -' + s * .52 + ' ' + s * .38 + ' -' + s * 1.34 + ' Z';
  const core = 'M' + x + ' ' + (y - s * .14) +
    ' q' + s * .30 + ' ' + s * .34 + ' ' + s * .06 + ' ' + s * .60 +
    ' q-' + s * .26 + ' ' + s * .18 + ' -' + s * .40 + ' -' + s * .06 +
    ' q-' + s * .18 + ' -' + s * .28 + ' ' + s * .34 + ' -' + s * .54 + ' Z';
  return '<path d="' + outer + '" fill="' + STORY_FIRE + '"/>' +
         '<path d="' + core + '" fill="#ffc247"/>';
}
function stArrow(x, y, w){
  return '<path d="M' + x + ' ' + y + ' L' + (x + w) + ' ' + y + '" stroke="' + STORY_DIM + '" stroke-width="3" stroke-linecap="round"/>' +
         '<path d="M' + (x + w - 9) + ' ' + (y - 7) + ' L' + (x + w) + ' ' + y + ' L' + (x + w - 9) + ' ' + (y + 7) + '" fill="none" stroke="' + STORY_DIM + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>';
}

// ── PANELS ──────────────────────────────────────────────────────────────────
// K0 «The Recipe», panel 1: the book. A list of ingredients by section, and the last
// line is THE EARTH. A single checkmark (§3: at most one arrow/checkmark) stands by
// the first section: he has already begun.
function stPanelK0a(){
  return '<svg viewBox="0 0 360 230" width="100%" height="100%">' +
    // the book: two pages with a spine
    '<rect x="112" y="26" width="216" height="178" rx="10" fill="#161c2a" stroke="' + STORY_DIM + '" stroke-width="2.5"/>' +
    '<path d="M220 26 L220 204" stroke="' + STORY_DIM + '" stroke-width="2.5"/>' +
    stApple(158, 62, 26) + '<path d="M186 62 l7 8 l13 -16" fill="none" stroke="' + STORY_ACC + '" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>' +
    stAnimal(158, 118, 26) +
    stCar(158, 172, 26) +
    stDots(274, 62, 30) +
    stGlobe(274, 140, 52) +
    // himself, on the left, checking against the list
    stJar(18, 96, 78, 96) + stEyes(57, 132, 'calm') +
    '</svg>';
}
// K0, panel 2: the dream. Inside the bubble — the jar, and inside it THE EARTH. Gaze upwards.
function stPanelK0b(){
  return '<svg viewBox="0 0 360 230" width="100%" height="100%">' +
    stBubble(122, 18, 214, 150, 108, 172) +
    stJar(186, 40, 88, 106) + stGlobe(230, 100, 56) +
    stJar(24, 118, 78, 92) + stEyes(63, 152, 'dream') +
    '</svg>';
}
// K1 «The Helper»: he looks at the player with adoration. Inside the bubble — how he SEES
// the player's work: tap → dust. Hearts on the outside: delight with the helper.
// ⚠️ The whole irony rests on the viewer already knowing: the dust is a rescue.
function stPanelK1(){
  return '<svg viewBox="0 0 360 230" width="100%" height="100%">' +
    stBubble(150, 20, 190, 104, 132, 132) +
    stTap(196, 72, 44) + stArrow(230, 72, 38) + stDust(300, 72, 40) +
    stJar(30, 118, 84, 96) + stEyes(72, 154, 'adore') +
    stHeart(26, 92, 24) + stHeart(114, 104, 18) +
    '</svg>';
}

// K2 «Where to?..»: the first doubt. Inside the bubble an item MELTS AWAY and a «?» takes
// its place. For the first time he notices that what was ground up goes somewhere. The
// setup for the K4 twist.
function stPanelK2(){
  return '<svg viewBox="0 0 360 230" width="100%" height="100%">' +
    stBubble(146, 22, 194, 106, 130, 134) +
    stApple(190, 74, 30) +
    '<g opacity=".45">' + stArrow(216, 74, 34) + '</g>' +
    stQuestion(292, 74, 40) +
    stJar(30, 116, 84, 96) + stEyes(72, 152, 'doubt') +
    '</svg>';
}
// K3 «Section two»: the recipe's checklist. The garden is closed ✓ — ANIMALS are next.
// Sly eyes: the plan is going according to plan (he is still sure that he is winning).
function stPanelK3(){
  return '<svg viewBox="0 0 360 230" width="100%" height="100%">' +
    '<rect x="140" y="34" width="196" height="162" rx="10" fill="' + STORY_PAPER + '" stroke="' + STORY_DIM + '" stroke-width="2.5"/>' +
    stApple(186, 80, 28) +
    '<path d="M222 80 l8 9 l15 -18" fill="none" stroke="' + STORY_ACC + '" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M186 112 L186 132" stroke="' + STORY_DIM + '" stroke-width="3" stroke-linecap="round"/>' +
    '<path d="M180 126 L186 134 L192 126" fill="none" stroke="' + STORY_DIM + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
    stAnimal(186, 160, 30) +
    '<circle cx="252" cy="160" r="15" fill="none" stroke="' + STORY_INK + '" stroke-width="3"/>' +
    stJar(24, 112, 84, 96) + stEyes(66, 148, 'sly') +
    '</svg>';
}
// K4 «The museum?!» — THE TWIST, 3 panels: he sees the shelf with the «ground-up» ones
// whole → shock → fury. From here on the difficulty escalation gets a narrative reason.
function stPanelK4a(){
  return '<svg viewBox="0 0 360 230" width="100%" height="100%">' +
    stApple(130, 92, 30) + stAnimal(196, 92, 32) + stCar(266, 96, 32) +
    stSpark(160, 58, 8) + stSpark(232, 54, 7) + stSpark(300, 66, 6) +
    stShelf(96, 122, 210) +
    stJar(20, 130, 74, 84) + stEyes(57, 160, 'calm') +
    '</svg>';
}
function stPanelK4b(){
  return '<svg viewBox="0 0 360 230" width="100%" height="100%">' +
    stApple(126, 74, 26) + stAnimal(186, 74, 28) + stCar(250, 78, 28) +
    stShelf(96, 100, 190) +
    stJar(120, 132, 110, 84) + stEyes(175, 168, 'shock') +
    '</svg>';
}
function stPanelK4c(){
  return '<svg viewBox="0 0 360 230" width="100%" height="100%">' +
    stFlame(96, 150, 46) + stFlame(268, 146, 42) +
    stFlame(52, 172, 30) + stFlame(310, 170, 32) + stFlame(180, 60, 26) +
    stJar(116, 104, 128, 100) + stEyes(180, 140, 'angry') +
    '</svg>';
}

// ── MILESTONE TRIGGERS. ⚠️ Derived from MY data (Save.ac, lifetime per-type
// counters), and not from interface events: the spec tied K2-K4 to the museum, but
// the museum IS these counters — a type is «on the shelf» if it was rescued even once.
// This way the chapters do not wait for someone else's zone and work already today.
const STORY_SET_MIN = 4; // a «hall» — a pack of 4 types or more: the packs of 1-2 (forest/arcade/
// market) sit in the TAIL of the array, but the protection is needed for the future: a
// set of a single item must not count as a completed hall and launch the twist.
function stPacks(){
  const by = {};
  for (const t of TYPES) if (t.tex) (by[t.tex] = by[t.tex] || []).push(t.name);
  return by;
}
// The packs that contain a type which has REACHED the first accumulation tier
function stTieredPacks(){
  const by = stPacks(), out = [];
  // ⚠️ accCountTier, and NOT accTier: the latter adds up what was earned with what was
  // BOUGHT for money (boostTier). On accTier the milestone «the first exhibit has taken
  // its place on the shelf» would be handed to a player who collected NOTHING and simply
  // bought a Boost — the story would congratulate him on someone else's merit. Caught by
  // our own run: the suite buys boosts, and K2 popped up with zero counters.
  for (const k in by) if (by[k].some(n => accCountTier(n) >= 1)) out.push(k);
  return out;
}
// The first COMPLETE hall: every type of the pack was rescued at least once (and the pack is not a dwarf one)
function stFullSet(){
  const by = stPacks();
  for (const k in by){
    if (by[k].length < STORY_SET_MIN) continue;
    if (by[k].every(n => accCount(n) > 0)) return k;
  }
  return null;
}

// ── CHAPTERS. bit — a bit of the Save.st bitmask (§7): monotonic, merged with OR, a
// chapter is not shown twice; a lost save = a replay from K0 (harmless).
// `when` — the chapter's milestone. null = «right away, once its turn comes».
const STORY_CHAPTERS = [
  { id: 'k0', bit: 1, panels: [stPanelK0a, stPanelK0b], when: null },       // the prologue — 2 panels (§3)
  { id: 'k1', bit: 2, panels: [stPanelK1],  when: null },
  // the first «exhibit has taken its place on the shelf» = the first type to reach tier 1
  { id: 'k2', bit: 4, panels: [stPanelK2],  when: () => stTieredPacks().length >= 1 },
  // «section two» = a tier appeared in the SECOND pack (a new hall of the recipe)
  { id: 'k3', bit: 8, panels: [stPanelK3],  when: () => stTieredPacks().length >= 2 },
  // THE TWIST: the first fully completed hall
  { id: 'k4', bit: 16, panels: [stPanelK4a, stPanelK4b, stPanelK4c], when: () => !!stFullSet() },
];
function storySeen(bit){ return !!((Save.st || 0) & bit); }
// Which chapter is «due» right now. A MILESTONE OUTRANKS THE QUEUE (§6.3): K0 is tied to
// the FIRST victory and does not wait out the gap, the rest — no more than once per 2 levels.
function storyDue(){
  const lv = Math.max(1, levelNum - 1); // the level that has just been completed
  // ⚠️ THE ORDER IS STRICT: a chapter waits until the previous one has been shown. Otherwise
  // the K4 twist («he found out about the museum») could overtake K2 («the first doubt») —
  // for a player with a fast set the story would assemble itself backwards.
  for (const ch of STORY_CHAPTERS){
    if (storySeen(ch.bit)) continue;
    if (ch.when && !ch.when()) return null;   // the milestone has not come — and the next ones wait
    // K0 is tied to the FIRST victory and does not wait out the gap (a milestone outranks the queue, §6.3)
    if (ch.bit !== 1 && lv - (Save.sv || 0) < STORY_GAP_LEVELS) return null;
    return ch;
  }
  return null;
}
let storyBusy = false;
// ⚠️ A MUTE FOR THE AUTOMATED RUNS. A vignette is a fullscreen layer, and it honestly
// swallows the tap (otherwise the very first tap on the panel would press «Next»
// underneath it). In the suite victories happen by the dozen, and an open panel ate the
// coordinate clicks of the following sections — exactly the rake that the «Verification»
// section in CLAUDE.md warns about («close overlays before coordinate clicks»).
// The suite mutes the story for the duration of the mechanical sections and enables it in its own.
let storyOn = true;
function storyEnable(v){ storyOn = v !== false; }
// ⛔⛔ THE BETWEEN-LEVELS VIGNETTE IS TURNED OFF BY THE OWNER'S WORD 2026-08-11: «remove
// the placeholder screen that appears after the screen with the new object». This is
// exactly it: in the victory chain the vignette follows the new-item screen
// (`90-input.js:313`), and for now it is drawn with PLACEHOLDER panels.
// ⚠️⚠️ ONLY THE VICTORY PATH IS MUTED, THE PROLOGUE IS ALIVE. The owner named ONE screen —
// the one after the new item; the prologue before the game he is replacing himself («it
// will be one, not three, I'll bring it today»). Killing the prologue along with it would
// mean deciding its separate fate for him under the guise of the first one.
// ⚠️ WE KILL IT WITH A FLAG, NOT BY DELETING THE CODE — the metal detector's trick
// (`MAGNET_ENABLED`): the tract of chapters, milestones and `done` on all branches stays
// alive and verifiable, and bringing it back costs ONE word.
// ⛔ AND NOT through `storyEnable(false)` at startup: then whether the player sees the
// placeholder or not would be decided by the call order, while the suite uses that very
// same lever to ENABLE the story in its own section — they would fight each other. A
// separate name keeps «turned off by the owner» apart from «muted by an automated run».
const STORY_WIN_VIGNETTE = false;
// ⚠️⚠️ A SEPARATE LEVER FOR THE AUTOMATED RUN, AND IT IS NOT A DUPLICATE OF THE SWITCH.
// The vignette's mechanics (chapters, milestones, the «≤1 per 2 levels» gap, the refusal
// branches) must stay UNDER GUARDS until the owner brings the material — otherwise by the
// time it comes back it will be unverified. That is why the shipping value is a CONSTANT
// (and it is that constant which the shipping guard asserts), while the suite raises its
// own flag explicitly.
// ⛔ Do not merge them into one variable: then the guard «turned off in the shipped build»
// would read what the suite itself had set — a tautology of exactly the class the project
// has already been burned by with the leaderboard address.
let storyWinForce = false;
function storyWinForceSet(v){ storyWinForce = v !== false; return storyWinForce; }
// The entry point: called from checkEnd RIGHT AFTER show('winOverlay') — the panel lies
// on top of the already shown victory screen, without adding a step to the loop.
// ⚠️ THE CALL SITE HAS MOVED (the owner's word 2026-08-06: «the announcement screen for a
// new item must be before the level and AFTER the statistics of the completed level. Right
// now it is immediately after the level and that is not logical»). It used to be called
// from checkEnd RIGHT AFTER show('winOverlay') and lay on top of statistics that had not
// been read yet; now it is called by the «Next» button (90-input) and awaits `done`, so
// that the level starts AFTER the announcement. The comment above about «the panel on top
// of the victory screen» is CANCELLED by this.
// ⚠️ `done` MUST be called on ALL branches, including the refusal ones (the story is off,
// a level without taps, no chapter) — otherwise the «Next» button would silently stop
// starting the level in the most frequent case: when there is no announcement.
function storyOnWin(done){
  const fin = () => { if (done) done(); };
  // ⚠️ THE REFUSAL COMES FIRST, but through `fin` — «Next» must start the level even with
  // the vignette turned off (the rule about the refusal branches — a paragraph above).
  if (!STORY_WIN_VIGNETTE && !storyWinForce) return fin();
  if (!storyOn) return fin();
  // §6.1 «never before the first tap»: a level won without a single tap (finished off by
  // the final cleanup) does not open a vignette — it will wait for the next one.
  if (!stats || !stats.taps) return fin();
  const ch = storyDue();
  if (ch) storyPlay(ch, fin); else fin();
}
// The display. The overlay is built from JS (see the note about zones in the file header).
function storyPlay(ch, done){
  if (storyBusy){ if (done) done(); return; }
  storyBusy = true;
  const autoMs = ch.intro ? STORY_INTRO_MS : STORY_AUTO_MS;
  let i = 0, timer = 0;
  const box = document.createElement('div');
  box.id = 'storyOverlay';
  box.setAttribute('style',
    'position:fixed; inset:0; z-index:45; display:flex; align-items:center; justify-content:center;' +
    'background:#0e1320; cursor:pointer; -webkit-tap-highlight-color:transparent;');
  const stage = document.createElement('div');
  stage.setAttribute('style', 'width:min(460px, 88vw); aspect-ratio:360/230; transition:opacity .18s;');
  box.appendChild(stage);
  // the «tap» hint — three progress dots, without a single word (§0)
  const dots = document.createElement('div');
  dots.setAttribute('style', 'position:absolute; bottom:34px; display:flex; gap:8px;');
  box.appendChild(dots);
  const draw = () => {
    stage.innerHTML = ch.panels[i]();
    dots.innerHTML = ch.panels.map((_, k) =>
      '<i style="width:7px;height:7px;border-radius:50%;background:' +
      (k === i ? STORY_INK : 'rgba(255,255,255,.28)') + '"></i>').join('');
  };
  const next = () => {
    clearTimeout(timer);
    i++;
    if (i >= ch.panels.length){ close(); return; }
    draw();
    timer = setTimeout(next, autoMs);
  };
  const close = () => {
    clearTimeout(timer);
    box.remove();
    storyBusy = false;
    // we set the mark ON COMPLETION, including on a skip: a skip is not punished (§6.2),
    // the chapter counts as shown and will not pop up a second time.
    Save.st = (Save.st || 0) | (ch.marks || ch.bit);
    Save.sv = Math.max(Save.sv || 0, Math.max(1, levelNum - 1));
    commitSave();
    Telemetry.ev('story', { ch: ch.id });
    if (done) done();
  };
  storyDismiss = close; // so that skipIntro/tests can close the panel through the regular path
  box.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); next(); });
  document.body.appendChild(box);
  draw();
  timer = setTimeout(next, autoMs);
}
// ── THE PROLOGUE (the owner's spec 2026-07-30: «tell this story BEFORE the game in the
// form of a comic»). ⚠️ THIS IS A DELIBERATE CANCELLATION of rule §6.1 of the spec,
// «never before the first tap of the session»: it protected the trump card «I'm playing
// in 20 seconds», and the owner's word is newer. The risk is removed BY CONSTRUCTION,
// not by ignoring it:
//  • the prologue is embedded into the 'wait' phase of the intro — the platform's curtain
//    is already removed, the jar is empty, and the items HAVE NOT FALLEN YET. That means
//    the filling animation (which the owner fought for separately) is not lost: it simply
//    starts after the comic.
//  • the panels are faster than the usual ones (2.6 s against 4), a tap flips instantly;
//  • it is shown EXACTLY ONCE per lifetime of the save and only to a NEW player.
// ⚠️ The condition is «st === 0», and not «the bit is not set»: for a player who has
// already seen K0/K1 between levels under the old scheme the prologue will NOT pop up —
// otherwise he would watch the same content twice. Closing the prologue marks both K0 and
// K1 — between levels they will not come any more.
const STORY_PROLOGUE = { id: 'p0', bit: 32, marks: 32 | 1 | 2, intro: true,
                         panels: [stPanelK0a, stPanelK0b, stPanelK1] };
let storyDismiss = null;
function storyPrologueDue(){ return storyOn && (Save.st || 0) === 0; }
// done() is called ALWAYS — both when the prologue has been shown and when it is not
// needed: the start of the items' fall hangs on this callback, it must not be lost.
function storyPrologue(done){
  if (!storyPrologueDue()) return done && done();
  storyPlay(STORY_PROLOGUE, done);
}
// Close an open panel through the regular path (skipIntro in tests, emergency paths)
function storyForceClose(){ if (storyDismiss) storyDismiss(); return !document.getElementById('storyOverlay'); }
