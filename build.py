#!/usr/bin/env python3
# Build: glues the src/app/*.js modules (alphabetically = by number) into one
# IIFE script and inlines it together with three.min.js and Rapier into
# src/shell.html -> index.html.
# three.min.js is taken from node_modules (npm i three@0.149.0), or pass the path
# as an argument. Rapier — src/vendor/rapier.js (rebuild:
#   printf 'import RAPIER from "@dimforge/rapier3d-compat";\nwindow.RAPIER = RAPIER;\n' > rapier-entry.mjs
#   npx esbuild rapier-entry.mjs --bundle --format=iife --minify --outfile=src/vendor/rapier.js
# ).
import sys, os, glob, hashlib, shutil
root = os.path.dirname(os.path.abspath(__file__))
three_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, 'node_modules/three/build/three.min.js')
shell = open(os.path.join(root, 'src/shell.html'), encoding='utf-8').read()
# the inline lives inside <script>: the markers MUST exist, otherwise replace
# SILENTLY does nothing and index.html gets built without the engine/game
for marker in ('/*THREE_JS_INLINE*/', '/*RAPIER_JS_INLINE*/', '/*APP_JS_INLINE*/'):
    assert marker in shell, 'src/shell.html: lost marker ' + marker
modules = sorted(glob.glob(os.path.join(root, 'src/app/*.js')))
assert modules, 'src/app/*.js not found'
app = '(function(){\n\'use strict\';\n' + '\n'.join(open(p, encoding='utf-8').read() for p in modules) + '\n})();'
three = open(three_path, encoding='utf-8').read()
rapier = open(os.path.join(root, 'src/vendor/rapier.js'), encoding='utf-8').read()
# protection against a premature <script> close inside string literals —
# for ALL inline bundles ('</script' in a comment/string of any of them
# would cut index.html off mid-code; escaping inside a JS string is harmless)
app = app.replace('</script', '<\\/script')
three = three.replace('</script', '<\\/script')
rapier = rapier.replace('</script', '<\\/script')
out = (shell
       .replace('/*THREE_JS_INLINE*/', three)
       .replace('/*RAPIER_JS_INLINE*/', rapier)
       .replace('/*APP_JS_INLINE*/', app))
# ── THE BUILD LABEL (2026-09-12, the owner's «check which version is on the domain and why the version may differ
# for players»): the dev panel's `#buildVer` — read by the perf report and by telemetry — was a hand-typed literal
# frozen since August, so every report named a build that no longer existed. It now carries THE SAME STAMP AS
# sw.js's `BUILD` and the date that stamp first appeared.
# ⚠️ THE STAMP IS THE MD5 OF THIS BUILD WITH ITS OWN LABEL LEFT AS THE PLACEHOLDER: a label cannot carry the hash
# of a document that contains the label. Same sources -> same stamp -> same bytes.
# ⚠️ THE DATE IS REUSED WHILE THE STAMP IS UNCHANGED (read back from the previous index.html): a label taking
# today's date on every run would change index.html's bytes on every rebuild of the same sources — and the site's
# `build.txt` validator (tools/site-pack.py) keys on those bytes, so every returning player would re-download the
# whole document for a build that did not change.
import datetime, re as _re
LABEL_PH = 'id="buildVer">__BUILDVER__<'
if out.count(LABEL_PH) != 1:
    raise SystemExit('src/shell.html: the build label placeholder must occur exactly once (found %d)' % out.count(LABEL_PH))
BUILD_STAMP = hashlib.md5(out.encode('utf-8')).hexdigest()[:12]
label_date = datetime.date.today().isoformat()
try:
    with open(os.path.join(root, 'index.html'), encoding='utf-8') as _fh:
        _m = _re.search(r'id="buildVer">build ([0-9a-f]{12}) \u00b7 (\d{4}-\d{2}-\d{2})<', _fh.read())
    if _m and _m.group(1) == BUILD_STAMP:
        label_date = _m.group(2)
except OSError:
    pass
out = out.replace(LABEL_PH, 'id="buildVer">build ' + BUILD_STAMP + ' \u00b7 ' + label_date + '<')
open(os.path.join(root, 'index.html'), 'w', encoding='utf-8').write(out)
print('index.html:', os.path.getsize(os.path.join(root, 'index.html')), 'bytes,', len(modules), 'modules, build', BUILD_STAMP, label_date)

# ── THE SERVICE WORKER: src/sw.js -> ./sw.js, with THIS build's hash baked in ─────────────────
# ⚠️⚠️ THE CACHE NAME CARRIES THE HASH OF THE BUILT index.html, AND THAT IS THE WHOLE VERSIONING
# STORY. A hand-bumped version string is the "second copy that drifts" this canon has paid for
# five times: whoever forgets to bump it ships a worker that serves the PREVIOUS build to every
# installed player, and nothing on screen says so. Derived from the artefact, it cannot be forgotten.
# ⚠️ SINCE 2026-09-12 THE HASH IS TAKEN WITH THE DEV PANEL'S BUILD LABEL LEFT BLANK: the label carries the same
# stamp, and a document cannot contain the hash of itself. See the label block above.
# ⚠️ THE ROOT sw.js IS A BUILD ARTEFACT AND IS COMMITTED, exactly like index.html and music.mp3 —
# GitHub Pages and the site Worker both serve the repository. Do not edit it by hand; edit src/sw.js.
SW_SRC = os.path.join(root, 'src', 'sw.js')
SW_DST = os.path.join(root, 'sw.js')
if os.path.exists(SW_SRC):
    sw = open(SW_SRC, encoding='utf-8').read()
    if '__BUILD__' not in sw:
        raise SystemExit('src/sw.js has no __BUILD__ placeholder - the cache name would freeze '
                         'across releases and installed players would keep the old build.')
    stamp = BUILD_STAMP   # the md5 of the build with its label blank — the same stamp the label shows (2026-09-12)
    open(SW_DST, 'w', encoding='utf-8').write(sw.replace('__BUILD__', stamp))
    print('sw.js: written from src/sw.js, build', stamp)
else:
    print('sw.js: NO SOURCE at src/sw.js - the root copy (if any) is left as it is')

# ── THE MUSIC: Audio/2-music/background-music.mp3 -> ./music.mp3 ──────────────────────────────
# ⚠️⚠️ THE TRACK IS THE ONE SOUND THAT IS **NOT** INLINED INTO index.html, and that is a measured
# decision the canon carries: 4.4 MB of base64 would have bloated the build 7 -> 12.6 MB and
# tripled the start, while the music is not critical - the page streams it from a neighbouring
# file with `preload="none"`. So it cannot go through tools/sfx-pack.py, and it needs its own copy
# step here, or a file dropped into the folder would never reach the game.
# ⚠️ THE ROOT COPY IS A BUILD ARTEFACT AND IS COMMITTED, exactly like index.html: GitHub Pages
# serves the repository, and the portal package is `index.html + 2 bridge files + music.mp3`.
# ⚠️ THE STEM IS FIXED (`background-music`) SO THE FOLDER CAN HOLD MORE THAN ONE FILE - the
# 267 kbps master lives next to it and must never be the one that ships. Everything else in
# 2-music/ is ignored, and that is what the README tells him.
# ⛔ NO CONVERSION HERE, AND NOT FOR TIDINESS: build.py runs on every build and has no ffmpeg
# dependency; adding one would put a new failure mode on the critical path. A non-mp3 source stops
# the build with the exact command to run instead of quietly shipping a wav named .mp3.
MUSIC_SRC = os.path.join(root, 'Audio', '2-music', 'background-music.mp3')
MUSIC_DST = os.path.join(root, 'music.mp3')
if os.path.exists(MUSIC_SRC):
    md5 = lambda p: hashlib.md5(open(p, 'rb').read()).hexdigest()
    if not os.path.exists(MUSIC_DST) or md5(MUSIC_SRC) != md5(MUSIC_DST):
        shutil.copy2(MUSIC_SRC, MUSIC_DST)
        print('music.mp3: copied from Audio/2-music/background-music.mp3,',
              os.path.getsize(MUSIC_DST), 'bytes')
    else:
        print('music.mp3: up to date with Audio/2-music/background-music.mp3')
else:
    other = [f for f in glob.glob(os.path.join(root, 'Audio', '2-music', 'background-music.*'))]
    if other:
        raise SystemExit('Audio/2-music/background-music.mp3 is missing, but %s is there.\n'
                         'The game streams an .mp3. Convert it first:\n'
                         '  ffmpeg -i "%s" -c:a libmp3lame -b:a 96k '
                         '"Audio/2-music/background-music.mp3"' % (os.path.basename(other[0]), other[0]))
    print('music.mp3: NO SOURCE in Audio/2-music/ - the root copy (if any) is left as it is')

# THE SITE FOLDER (2026-09-09-c): `site/` — what the site Worker serves at blendo.monster — is assembled from
# THIS build by tools/site-pack.py at the end of every build, so a deploy line run after a build never ships
# a stale folder (the deploy itself is the owner's action: `npm run site:deploy`). A packer failure is
# printed and does not fail the build: the game's artifact is index.html, the site is its repackaging.
try:
    import subprocess as _sp, sys as _sys
    _sp.check_call([_sys.executable, os.path.join(root, 'tools', 'site-pack.py'), '--quiet'])
    print('site/: assembled from this build (tools/site-pack.py)')
except Exception as _e:
    print('site/: NOT assembled -', _e)
