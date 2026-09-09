#!/usr/bin/env python3
# ASSEMBLE `site/` — THE FOLDER THE SITE WORKER SERVES AT blendo.monster (2026-09-09-c).
# The site is the BUILD, repackaged: index.html (the whole game), the two Playgama bridge files (loaded by
# 78-ads over http/https), music.mp3 (the one sound not inlined), avatars/ (read by 85-hud at a relative
# path). `video/` is NOT copied by default: on blendo.monster the gate asks video.blendo.monster first and
# github.io second — the relative folder is never used off a local or github host — so copying it would
# upload 5.6 MB for nothing; `--with-video` copies it all the same (a belt for a future gate change).
# `site/` is gitignored: a product of the build, rebuilt from scratch on every run (rm -rf, then copy).
# Run: `python3 tools/site-pack.py [--with-video] [--quiet]`; `npm run site:deploy` runs it before wrangler.
import os, shutil, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'site')
FILES = ['index.html', 'playgama-bridge.js', 'playgama-bridge-config.json', 'music.mp3']
DIRS = ['avatars'] + (['video'] if '--with-video' in sys.argv else [])
QUIET = '--quiet' in sys.argv
LIMIT = 25 * 1024 * 1024   # the platform's per-file limit for static assets (25 MiB)
for f in FILES + DIRS:
    if not os.path.exists(os.path.join(ROOT, f)):
        sys.exit('site-pack: missing ' + f + ' — build first (python3 build.py …)')
shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
total = 0; count = 0; rows = []
for f in FILES:
    src = os.path.join(ROOT, f); shutil.copy2(src, os.path.join(OUT, f))
    n = os.path.getsize(src); total += n; count += 1; rows.append((f, n))
ignore = shutil.ignore_patterns('.*', '_orig-p')   # dotfiles and the untracked originals folder inside avatars/
for d in DIRS:
    shutil.copytree(os.path.join(ROOT, d), os.path.join(OUT, d), ignore=ignore)
    for base, _, names in os.walk(os.path.join(OUT, d)):
        for nm in names:
            n = os.path.getsize(os.path.join(base, nm)); total += n; count += 1
    rows.append((d + '/', sum(os.path.getsize(os.path.join(b, x)) for b, _, xs in os.walk(os.path.join(OUT, d)) for x in xs)))
big = [(f, n) for f, n in rows if n > LIMIT]
if not QUIET:
    for f, n in rows: print('  %-32s %10d B' % (f, n))
    print('site/: %d files, %.2f MB total' % (count, total / 1e6))
if big: sys.exit('site-pack: over the 25 MiB per-file limit: ' + ', '.join(f for f, _ in big))
