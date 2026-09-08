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
f = os.path.join(OUT, rel); s = open(f, encoding='utf-8').read()
assert s.count(find) == 1, 'anchor count %d for %s' % (s.count(find), find[:60])
open(f, 'w', encoding='utf-8').write(s.replace(find, repl))
subprocess.check_call(['python3', os.path.join(OUT, 'build.py'), os.path.join(ROOT, 'node_modules/three/build/three.min.js')], cwd=OUT, stdout=subprocess.DEVNULL)
print(os.path.join(OUT, 'index.html'))
