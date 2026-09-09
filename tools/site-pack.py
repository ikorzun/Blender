#!/usr/bin/env python3
# ASSEMBLE `site/` — THE FOLDER THE SITE WORKER SERVES AT blendo.monster (2026-09-09-c).
# The site is the BUILD, repackaged: index.html (the whole game), the two Playgama bridge files (loaded by
# 78-ads over http/https), music.mp3 (the one sound not inlined), avatars/ (read by 85-hud at a relative
# path). `video/` is NOT copied by default: on blendo.monster the gate asks video.blendo.monster first and
# github.io second — the relative folder is never used off a local or github host — so copying it would
# upload 5.6 MB for nothing; `--with-video` copies it all the same (a belt for a future gate change).
# `site/` is gitignored: a product of the build, rebuilt from scratch on every run (rm -rf, then copy).
# Run: `python3 tools/site-pack.py [--with-video] [--quiet]`; `npm run site:deploy` runs it before wrangler.
import os, re, shutil, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'site')
FILES = ['index.html', 'playgama-bridge.js', 'playgama-bridge-config.json', 'music.mp3', 'og.jpg']   # og.jpg: the share card (2026-09-09-f), the html's og:image points at it on the domain
DIRS = ['avatars'] + (['video'] if '--with-video' in sys.argv else [])
QUIET = '--quiet' in sys.argv
LIMIT = 25 * 1024 * 1024   # the platform's per-file limit for static assets (25 MiB)
CARD_WINDOW = 512 * 1024   # how far into index.html the head metas are allowed to sit (they live at ~2.5 KB)

# THE CRAWLER CARD (2026-09-09-g, his word «the share picture does not come out in telegram»). A link-preview
# crawler must not be asked to swallow the build: index.html is 12.7 MB raw / 4.5 MB gzipped, and Telegram
# gives a page a small budget of bytes and seconds. `card.html` carries the SAME head metas and nothing else
# (~1 KB), and the site worker hands it to preview bots only. ⚠️ IT IS DERIVED, NEVER WRITTEN BY HAND: the
# project's most repeated defect is a second copy that drifts away from the first. The metas are cut out of
# the built index.html, so a change in src/shell.html reaches the card by rebuilding, with nothing to forget.
def build_card(src):
    head = open(src, 'rb').read(CARD_WINDOW).decode('utf-8', 'replace')
    title = re.search(r'<title>.*?</title>', head, re.S)
    metas = re.findall(r'<meta (?:name|property)="(?:description|og:[\w:]+|twitter:[\w:]+)" content="[^"]*"\s*/?>', head)
    if not title or not any('"og:image"' in m for m in metas):
        sys.exit('site-pack: no <title> or og:image meta in the first %d bytes of index.html — the crawler card '
                 'cannot be built (did the head metas move past the window, or the build go stale?)' % CARD_WINDOW)
    return ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
            + title.group(0) + '\n' + '\n'.join(metas) + '\n'
            '<link rel="canonical" href="https://blendo.monster/">\n'
            '</head>\n<body>\n<h1>Blendo</h1>\n'
            '<p><a href="https://blendo.monster/">Play Blendo</a></p>\n</body>\n</html>\n')

# `--card-only DIR` writes JUST the card and leaves: the suite's drift guard uses it, and it must not rebuild
# `site/` (12.7 MB + avatars) to read 1 KB. Nothing else in the packer runs on this path.
if '--card-only' in sys.argv:
    dst = sys.argv[sys.argv.index('--card-only') + 1]
    src = os.path.join(ROOT, 'index.html')
    if not os.path.exists(src): sys.exit('site-pack: missing index.html — build first (python3 build.py ...)')
    os.makedirs(dst, exist_ok=True)
    with open(os.path.join(dst, 'card.html'), 'w', encoding='utf-8') as fh: fh.write(build_card(src))
    sys.exit(0)
for f in FILES + DIRS:
    if not os.path.exists(os.path.join(ROOT, f)):
        sys.exit('site-pack: missing ' + f + ' — build first (python3 build.py …)')
shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
total = 0; count = 0; rows = []
for f in FILES:
    src = os.path.join(ROOT, f); shutil.copy2(src, os.path.join(OUT, f))
    n = os.path.getsize(src); total += n; count += 1; rows.append((f, n))
cardp = os.path.join(OUT, 'card.html')
with open(cardp, 'w', encoding='utf-8') as fh: fh.write(build_card(os.path.join(ROOT, 'index.html')))
n = os.path.getsize(cardp); total += n; count += 1; rows.append(('card.html (crawlers)', n))
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
