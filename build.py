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
open(os.path.join(root, 'index.html'), 'w', encoding='utf-8').write(out)
print('index.html:', os.path.getsize(os.path.join(root, 'index.html')), 'bytes,', len(modules), 'modules')

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
