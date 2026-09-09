#!/usr/bin/env python3
"""Build the PWA icons from the owner's own icon (icon.jpg) — ONE command, reproducible.

⛔⛔ HIS FILE IS THE ICON, NOT A SOURCE TO RE-COMPOSE. `icon.jpg` (2026-09-09, dropped on the disk
and named in one line, «update the icon» — the silent delivery channel the canon records) is a
finished 1024x1024 app icon: the jar with the wordmark, the eyes and the flames on his own radial
vignette. The «any» and apple-touch icons are therefore a PLAIN DOWNSCALE. Nothing is cropped,
re-framed or recoloured, and the JPEG itself is never rewritten.
⛔ IT REPLACES the 2026-09-09-h crop out of og.jpg — that one was a stand-in until he drew this.

THE ONE VARIANT THAT CANNOT BE A PLAIN DOWNSCALE IS `maskable`, and here is why, measured:
Android may mask an icon with a CIRCLE of 80% of the side, and his art fills the square — the bbox
is x161..859, y49..960, its farthest pixel 477.5 of the 512 half-side (93.3%). Handed over as is,
a circle cuts the bottom of the jar and the tops of the flames (6.6% of the art's pixels). So the
maskable variant is his icon scaled until the art fits that circle, on a background that fills the
square.
⚠️⚠️ AND THE BACKGROUND IS HIS OWN EDGE SMEARED OUTWARD (`fillborders=...:mode=smear`), NOT A FLAT
COLOUR — measured across the seam at the middle of an edge: a flat pad of the corner colour steps
by 20 units, a flat pad of the mid-edge colour steps the other way, a synthetic radial vignette
still steps by 17, and the smear steps by **1**. His vignette is radial, so no single colour can
match a whole edge; the smear matches it by construction. A step shows as a square frame inside the
icon on every launcher that masks with a rounded square instead of a circle.

The scale is MEASURED from the file, not written down, so a future icon of his adapts by itself:
the background is read per row from the outermost pixel (his vignette varies from edge to centre,
so a single corner colour is not a usable reference), a pixel is «art» when it differs from that
row's edge by more than ART_DELTA, and the scale is SAFE / (the art's farthest radius).
⚠️ THE LIMIT OF THAT RULE, NAMED: on an icon whose BACKGROUND is much lighter in the middle than at
the edges AND whose art does not cover the centre, some background near the centre would be counted
as art and the scale would come out too small. The numbers are printed on every run for exactly
that reason, and `--scale N` overrides them.

Run: python3 tools/icon-gen.py            (needs ffmpeg; PIL is not installed on this Mac)
"""
import os, subprocess, sys, math

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC  = os.path.join(ROOT, 'icon.jpg')
DST  = os.path.join(ROOT, 'icons')
SAFE = 0.80          # the maskable safe zone: a circle of 80% of the side (the spec's worst case)
# ⚠️ AND A MARGIN INSIDE IT, MEASURED RATHER THAN CHOSEN: scaling so the art TOUCHES the circle exactly
# leaves its antialiased fringe a fraction of a pixel outside after the downscale to 512 — five pixels of
# a flame tip, 0.1..0.3 px over, on the first build. The guard states «no art outside» and it should not
# have to carry a tolerance for our own resampling, so the picture gets the room instead.
FRINGE = 0.975
ART_DELTA = 40       # sum of |channel| difference from the row's edge colour that counts as art
PLAIN = [('icon-192.png', 192), ('icon-512.png', 512), ('apple-touch-icon.png', 180)]
MASKABLE = ('icon-maskable-512.png', 512)


def probe_size(path):
    out = subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'stream=width,height',
                                   '-of', 'csv=p=0:s=x', path]).decode().strip().split('\n')[0]
    w, h = out.split('x')[:2]
    return int(w), int(h)


def art_radius(path, w, h):
    """The farthest 'art' pixel from the centre, in pixels. Reads the frame through ffmpeg."""
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
                         stdout=subprocess.PIPE, check=True).stdout
    cx, cy, best = w / 2.0, h / 2.0, 0.0
    minx = miny = 10 ** 9
    maxx = maxy = -1
    for y in range(h):
        row = y * w * 3
        br, bg, bb = raw[row], raw[row + 1], raw[row + 2]
        for x in range(w):
            i = row + x * 3
            if abs(raw[i] - br) + abs(raw[i + 1] - bg) + abs(raw[i + 2] - bb) > ART_DELTA:
                d = math.hypot(x - cx, y - cy)
                if d > best: best = d
                if x < minx: minx = x
                if x > maxx: maxx = x
                if y < miny: miny = y
                if y > maxy: maxy = y
    return best, (minx, maxx, miny, maxy)


def run(vf, out, size):
    subprocess.check_call(['ffmpeg', '-v', 'error', '-y', '-i', SRC, '-vf', vf,
                           '-pix_fmt', 'rgb24', '-compression_level', '100', out])
    print('%-24s %4d px  %7d bytes' % (os.path.basename(out), size, os.path.getsize(out)))


def main():
    if not os.path.exists(SRC):
        sys.exit('icon-gen: %s is missing — his icon is the source of every file in icons/' % SRC)
    w, h = probe_size(SRC)
    if w != h:
        sys.exit('icon-gen: %s is %dx%d — an app icon must be square, ask him for a square export' % (SRC, w, h))
    for name, size in PLAIN:
        run('scale=%d:%d:flags=lanczos' % (size, size), os.path.join(DST, name), size)

    if '--scale' in sys.argv:
        s = float(sys.argv[sys.argv.index('--scale') + 1])
        print('maskable: scale %.4f (given on the command line)' % s)
    else:
        r, bbox = art_radius(SRC, w, h)
        s = min(1.0, (SAFE * FRINGE * w / 2.0) / r) if r > 0 else 1.0
        print('maskable: art bbox x%d..%d y%d..%d, farthest %.1f of %.1f (%.1f%%) -> scale %.4f'
              % (bbox[0], bbox[1], bbox[2], bbox[3], r, w / 2.0, 100.0 * r / (w / 2.0), s))
    inner = int(round(w * s))
    if inner % 2: inner -= 1                      # an even side keeps the pad symmetric
    pad = (w - inner) // 2
    name, size = MASKABLE
    # pad to the original side, then REPLACE the pad with a smear of his own edge pixels
    vf = ('scale=%d:%d:flags=lanczos,pad=%d:%d:%d:%d:color=0x000000,'
          'fillborders=left=%d:right=%d:top=%d:bottom=%d:mode=smear,'
          'scale=%d:%d:flags=lanczos' % (inner, inner, w, h, pad, pad,
                                         pad, w - inner - pad, pad, h - inner - pad, size, size))
    run(vf, os.path.join(DST, name), size)


if __name__ == '__main__':
    main()
