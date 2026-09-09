#!/usr/bin/env python3
"""Cut the PWA icons out of the owner's poster (og.jpg) -- ONE command, reproducible.

WHY A TOOL AND NOT FOUR TRACKED PNGs MADE BY HAND: the icons are a DERIVED asset. The
owner may redraw the poster or ask for another framing, and a hand-made crop nobody can
reproduce is the "second copy that drifts" this project has paid for five times. Every
number below was MEASURED off og.jpg, not chosen by eye:

  the sky      rgb(122,206,252) = #7ACEFC -- read from a top-row pixel of og.jpg
  the face     x 936..1448, y 34..350 -- the flame brows and the two eyes; the black
               BLENDO wordmark begins at y ~ 310 on the right and is deliberately left
               out (at 48 px its top edge reads as a dirty wedge under the eyes)
  the pads     the face at ~85% of an "any" icon, ~60% of a "maskable" one (the Android
               adaptive mask can eat everything outside the middle 80%, and a CIRCLE is
               the worst case), ~76% for the iOS squircle

⚠️ THE OWNER'S FILE IS NEVER RE-ENCODED IN PLACE: og.jpg is read and left alone.
Run: python3 tools/icon-gen.py        (needs ffmpeg; PIL is not installed on this Mac)
"""
import os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC  = os.path.join(ROOT, 'og.jpg')
DST  = os.path.join(ROOT, 'icons')
SKY  = '0x7ACEFC'
FACE = (936, 34, 512, 316)          # x, y, w, h -- measured, see the header
# name, the padded square (the face's 512 divided by the share it should occupy), the output size
OUT = [
    ('icon-192.png',          602, 192),   # 512/602 = 85%
    ('icon-512.png',          602, 512),
    ('icon-maskable-512.png', 853, 512),   # 512/853 = 60% -- survives a circle mask
    ('apple-touch-icon.png',  674, 180),   # 512/674 = 76% -- the iOS squircle keeps more than a circle
]

def main():
    if not os.path.exists(SRC):
        sys.exit('icon-gen: %s is missing' % SRC)
    os.makedirs(DST, exist_ok=True)
    x, y, w, h = FACE
    for name, pad, size in OUT:
        vf = ('crop=%d:%d:%d:%d,pad=%d:%d:(ow-iw)/2:(oh-ih)/2:color=%s,scale=%d:%d:flags=lanczos'
              % (w, h, x, y, pad, pad, SKY, size, size))
        out = os.path.join(DST, name)
        subprocess.check_call(['ffmpeg', '-v', 'error', '-y', '-i', SRC, '-vf', vf,
                               '-pix_fmt', 'rgb24', '-compression_level', '100', out])
        print('%-24s %4d px  %7d bytes' % (name, size, os.path.getsize(out)))

if __name__ == '__main__':
    main()
