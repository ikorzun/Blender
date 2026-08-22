#!/usr/bin/env python3
# Build: glues the src/app/*.js modules (alphabetically = by number) into one
# IIFE script and inlines it together with three.min.js and Rapier into
# src/shell.html -> index.html.
# three.min.js is taken from node_modules (npm i three@0.149.0), or pass the path
# as an argument. Rapier — src/vendor/rapier.js (rebuild:
#   printf 'import RAPIER from "@dimforge/rapier3d-compat";\nwindow.RAPIER = RAPIER;\n' > rapier-entry.mjs
#   npx esbuild rapier-entry.mjs --bundle --format=iife --minify --outfile=src/vendor/rapier.js
# ).
import sys, os, glob
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
