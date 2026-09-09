# BUILD A SABOTAGED VARIANT OF index.html OUTSIDE THE TREE (2026-09-06-e): copies build.py and src/ into a
# temp dir, applies ONE replacement to ONE file (the anchor must occur exactly once — a stale sabotage is
# reported, never silently skipped), builds there and prints the variant's index.html. The tree's own
# index.html never carries a sabotage, so the suite always runs on the honest build. Pair it with
# tools/section-dryrun.js: MIXER_PAGE=<printed path> SECTION=<name> node tools/section-dryrun.js
# usage: python3 tools/build-variant.py <name> <file-rel-to-repo> <find> <repl>
import sys, os, shutil, subprocess, tempfile
name, rel, find, repl = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(tempfile.gettempdir(), 'blendo-variants', name)
shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
shutil.copy(os.path.join(ROOT, 'build.py'), OUT)
shutil.copytree(os.path.join(ROOT, 'src'), os.path.join(OUT, 'src'))
# the video intro's files live NEXT to the build (`video/`, 2026-09-08-c) and the gate takes the relative
# address on file:// — a variant without them would send every desktop arm down the comic fallback and the
# proof «each sabotage reddens its own arm» could not be made; a symlink, so nothing is copied.
if os.path.isdir(os.path.join(ROOT, 'video')): os.symlink(os.path.join(ROOT, 'video'), os.path.join(OUT, 'video'))
# the background music too (2026-09-08-e): the film's guard reads «the music held while the film sounds, released
# after» — without music.mp3 next to the variant the bgm's play() rejects and that arm reddened on EVERY variant,
# an artefact of this tool, not of the sabotage. build.py copies it into the tree; here a symlink.
if os.path.isfile(os.path.join(ROOT, 'music.mp3')): os.symlink(os.path.join(ROOT, 'music.mp3'), os.path.join(OUT, 'music.mp3'))
# and the same for everything a NODE-SIDE section reads next to the artefact (2026-09-09-h): the PWA arms
# read manifest.webmanifest, icons/ and tools/site-pack.py, the share-card arms read og.jpg and run the packer
# with `--card-only`. Without these a variant does not redden its own arm — the section DIES on a missing file,
# which reads like «the guard is blind» and is really the tool's artefact. `tools` is symlinked whole so the
# packer runs against the VARIANT (its own ROOT comes from the invocation path, not from a resolved symlink).
for _side in ('manifest.webmanifest', 'og.jpg', 'icons', 'tools', 'playgama-bridge.js', 'playgama-bridge-config.json', 'avatars'):
    _src = os.path.join(ROOT, _side)
    if os.path.exists(_src) and not os.path.exists(os.path.join(OUT, _side)): os.symlink(_src, os.path.join(OUT, _side))
# ⛔⛔ NEVER WRITE THROUGH A SYMLINK. The side files above are symlinked into the variant, so a sabotage
# aimed at one of them (or at a file inside a symlinked folder, e.g. tools/site-pack.py) would open the
# REPOSITORY's own file for writing and leave the tree sabotaged — the very thing this tool exists to
# prevent. The topmost symlinked component on the path is replaced with a real copy first.
f = os.path.join(OUT, rel)
if os.path.realpath(f).startswith(ROOT + os.sep):
    _parts = rel.split(os.sep)
    for _i in range(1, len(_parts) + 1):
        _p = os.path.join(OUT, *_parts[:_i])
        if os.path.islink(_p):
            _t = os.path.realpath(_p); os.unlink(_p)
            shutil.copytree(_t, _p) if os.path.isdir(_t) else shutil.copy(_t, _p)
            break
s = open(f, encoding='utf-8').read()
assert s.count(find) == 1, 'anchor count %d for %s' % (s.count(find), find[:60])
open(f, 'w', encoding='utf-8').write(s.replace(find, repl))
subprocess.check_call(['python3', os.path.join(OUT, 'build.py'), os.path.join(ROOT, 'node_modules/three/build/three.min.js')], cwd=OUT, stdout=subprocess.DEVNULL)
print(os.path.join(OUT, 'index.html'))
