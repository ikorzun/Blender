// ===== 84-chrome: THE SAFARI 26 SENSOR STRIPS — the driver (the owner's instruction of
// 2026-09-05, `safari-26-liquid-glass.md`; the CSS, the markup and the mechanism are described
// at the html/body rules in shell.html) =====
//
// Two fixed 12 px strips (#sbTop/#sbBot) sit on top of everything at both edges; Safari 26 finds
// them first at its check points and paints the zones behind the clock and the address bar with
// their `background-color`. This module keeps that colour equal to what the page shows at the
// same edge:
//   base   — the sky's own edge stops, `--sky-top-rgb` / `--sky-bot-rgb`, written by 10-stage from
//            SKY_STOPS (the frame's top and bottom rows by construction — the canon at
//            `SKY_MAP='screen'`);
//   layers — every full-width fixed layer that covers the edge point, composited source-over in
//            stacking order: the layer's own background-color (opacity applied) and its fixed
//            ::before/::after when they are full-screen (our overlays paint on ::before since
//            2026-09-03; the Playgama curtain is a plain fixed node with a solid colour).
//            A layer whose fill is a background-IMAGE (the menu's sky gradient on
//            #mainScreen::before) is skipped — its pixels ARE the base already.
// ⚠️ NOT the instruction's generic sampler: it reads `background-color` off the stack and our
//    sky is a WebGL canvas plus a gradient — a sampler would hand the bottom strip the zenith.
// ⚠️ THE WIDTH FILTER IS LOAD-BEARING: a button standing at the edge point (the zoom row on the
//    desktop is 20 px above it, the menu's floating pill 8) is not a layer; only ≥ 90 % wide
//    boxes count, exactly the instruction's candidate rule.
// ⚠️ THE HEIGHT FILTER ON PSEUDOS IS LOAD-BEARING TOO: `#mainScreen::after` is a 1 px mint strip
//    at the bottom; read blindly it would turn the TOP strip mint under the menu. Only
//    full-screen pseudos (≥ 90 % of both sides) are layers.
// ⚠️ The combo fever (`uCombo`) paints the frame's bottom red for a moment; the strip stays the
//    sky's bottom stop then — named, not chased.
// The triggers: show()/hide() and newObjShow/newObjHide (85-hud) call chromeStripsSync() on
// the spot; a MutationObserver on <body> (childList + class/style on the subtree) catches the
// SDK curtain and anything toggled by another path; resize / pageshow / visibilitychange and the
// palette writers in 10-stage call it too. Every call is coalesced into ONE sample per frame.
// The suite hook: `__game.chromeStrips()` (99-main).

function chromeParseColor(str){
  const m = String(str || '').match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
  if (p.length < 3 || p.some(v => Number.isNaN(v))) return null;
  return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
}
function chromeOver(dst, src, k){
  const a = Math.max(0, Math.min(1, src.a * (k == null ? 1 : k)));
  return { r: src.r * a + dst.r * (1 - a), g: src.g * a + dst.g * (1 - a), b: src.b * a + dst.b * (1 - a), a: 1 };
}
function chromeBase(edge){
  const v = getComputedStyle(document.documentElement).getPropertyValue(edge === 'top' ? '--sky-top-rgb' : '--sky-bot-rgb');
  const c = chromeParseColor('rgb(' + v + ')');
  return c || (edge === 'top' ? { r: 133, g: 220, b: 255, a: 1 } : { r: 204, g: 255, b: 248, a: 1 });
}
// the colour the strip of `edge` must carry right now
function chromeStripColor(edge){
  let acc = chromeBase(edge);
  const W = innerWidth, H = innerHeight;
  const x = Math.round(W / 2), y = edge === 'top' ? 8 : H - 8;
  let stack = [];
  try { stack = document.elementsFromPoint(x, y).slice().reverse(); } catch(e){}   // bottom → top
  for (const el of stack){
    if (el === document.documentElement || el === document.body) continue;
    if (el.classList && el.classList.contains('sb-strip')) continue;
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width < W * 0.9) continue;                       // a control, not a layer
    const op = parseFloat(cs.opacity); if (!(op > 0)) continue;
    const own = chromeParseColor(cs.backgroundColor);
    if (own && own.a > 0 && (!cs.backgroundImage || cs.backgroundImage === 'none')) acc = chromeOver(acc, own, op);
    for (const pseudo of ['::before', '::after']){
      const ps = getComputedStyle(el, pseudo);
      if (!ps || ps.content === 'none' || ps.display === 'none') continue;
      if (ps.position !== 'fixed' && ps.position !== 'absolute') continue;
      if (parseFloat(ps.width) < W * 0.9 || parseFloat(ps.height) < H * 0.9) continue;   // a strip, not a layer
      if (ps.backgroundImage && ps.backgroundImage !== 'none') continue;            // the sky gradient = the base
      const pc = chromeParseColor(ps.backgroundColor);
      if (pc && pc.a > 0) acc = chromeOver(acc, pc, op * (parseFloat(ps.opacity) || 1));
    }
  }
  return 'rgb(' + Math.round(acc.r) + ', ' + Math.round(acc.g) + ', ' + Math.round(acc.b) + ')';
}
let chromeSyncQueued = false;
function chromeStripsApply(){
  chromeSyncQueued = false;
  const top = document.getElementById('sbTop'), bot = document.getElementById('sbBot');
  if (!top || !bot) return;
  const ct = chromeStripColor('top'), cb = chromeStripColor('bottom');
  if (top.dataset.sb !== ct){ top.dataset.sb = ct; top.style.backgroundColor = ct; }
  if (bot.dataset.sb !== cb){ bot.dataset.sb = cb; bot.style.backgroundColor = cb; }
  // theme-color for Chrome/Android rides on the top strip's colour (Safari 26 ignores the meta)
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta && meta.content !== ct) meta.content = ct;
}
function chromeStripsSync(){
  if (chromeSyncQueued) return;
  chromeSyncQueued = true;
  requestAnimationFrame(chromeStripsApply);
}
try {
  addEventListener('resize', chromeStripsSync);
  addEventListener('pageshow', chromeStripsSync);
  addEventListener('orientationchange', chromeStripsSync);
  document.addEventListener('visibilitychange', chromeStripsSync);
  new MutationObserver(chromeStripsSync).observe(document.body, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
  // <html> as well: the palette writers set --sky-* on documentElement.style and the load gates
  // (skyfill / uiready / introdone) are classes on <html> — body's observer never sees either.
  // Measured before this line existed: with body's observer removed the strips kept the
  // load-time sample and never converged on the final palette.
  new MutationObserver(chromeStripsSync).observe(document.documentElement, {
    attributes: true, attributeFilter: ['class', 'style'] });
  chromeStripsSync();
} catch(e){}
