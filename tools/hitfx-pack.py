#!/usr/bin/env python3
# ===== tools/hitfx-pack.py — repack one flashyfeather hit animation into src/app/37-hitfx.js =====
# The owner's word 2026-08-30: «khochu dobavit takie effekty pri soedinenii predmetov»
# (flashyfeather.itch.io/hit-animations-vol2, the pack he downloaded into «Hits2 Animations/»).
# ⚠️ THE SOURCE PACK IS GITIGNORED: the licence covers use in a game, not redistribution of the
# assets; the game embeds only this REPACKED 128 px subset. Rerunnable; needs the source folder.
#   python3 tools/hitfx-pack.py [effect_number]   (default 13 — the warm radial burst)
import io, sys, base64, math
from PIL import Image

SRC = 'Hits2 Animations/%s.png'
OUT = 'src/app/37-hitfx.js'
EFFECT = sys.argv[1] if len(sys.argv) > 1 else '13'
FRAME = 128          # output frame size
TAKE = 24            # frames kept (evenly sampled across the animation)
FPS = 40             # playback: 24/40 = 0.6 s per hit

im = Image.open(SRC % EFFECT)
g = 8; cell = im.size[0] // g
alpha = im.split()[3]
occ = [(r, c) for r in range(g) for c in range(g)
       if alpha.crop((c*cell, r*cell, (c+1)*cell, (r+1)*cell)).getbbox()]
idxs = [occ[min(len(occ)-1, round(i*(len(occ)-1)/(TAKE-1)))] for i in range(TAKE)]
cols = 6; rows = math.ceil(TAKE / cols)
sheet = Image.new('RGBA', (cols*FRAME, rows*FRAME), (0, 0, 0, 0))
for k, (r, c) in enumerate(idxs):
    fr = im.crop((c*cell, r*cell, (c+1)*cell, (r+1)*cell)).resize((FRAME, FRAME), Image.LANCZOS)
    sheet.paste(fr, ((k % cols)*FRAME, (k // cols)*FRAME))
buf = io.BytesIO()
sheet.save(buf, 'PNG', optimize=True)
b64 = base64.b64encode(buf.getvalue()).decode()
js = f"""// ===== 37-hitfx: the match-hit flash (flashyfeather hit-animations-vol2, effect {EFFECT}) =====
// Repacked by tools/hitfx-pack.py from the gitignored source pack: {TAKE} frames of {FRAME} px
// sampled evenly from the {len(occ)}-frame 4096px sheet, played at {FPS} fps (~{TAKE/FPS:.2f} s).
// ⚠️ To try another effect: python3 tools/hitfx-pack.py <n> — the file is fully regenerated.
// The consumer is spawnHitFx (70-fx); the sprite billboards itself, normal blending — the
// additive look of the source dies on our light sky, the alpha channel carries it instead.
const HITFX = {{ cols: {cols}, rows: {rows}, n: {TAKE}, fps: {FPS} }};
const HITFX_PNG = 'data:image/png;base64,{b64}';
let _hitFxTex = null;
function hitFxBaseTexture(){{
  if (_hitFxTex) return _hitFxTex;
  const img = new Image();
  const tex = new THREE.Texture(img);
  img.onload = () => {{ tex.needsUpdate = true; }};
  img.src = HITFX_PNG;
  tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  _hitFxTex = tex;
  return tex;
}}
"""
io.open(OUT, 'w', encoding='utf-8').write(js)
print('effect %s: %d source frames -> %d @ %dpx, sheet %dx%d, %d KB embedded'
      % (EFFECT, len(occ), TAKE, FRAME, cols*FRAME, rows*FRAME, len(b64)//1024))
