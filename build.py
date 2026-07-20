#!/usr/bin/env python3
# Сборка: склеивает модули src/app/*.js (по алфавиту = по номерам) в один
# IIFE-скрипт и инлайнит его вместе с three.min.js и Rapier в src/shell.html
# -> index.html.
# three.min.js берётся из node_modules (npm i three@0.149.0) или укажите путь
# аргументом. Rapier — src/vendor/rapier.js (пересборка:
#   printf 'import RAPIER from "@dimforge/rapier3d-compat";\nwindow.RAPIER = RAPIER;\n' > rapier-entry.mjs
#   npx esbuild rapier-entry.mjs --bundle --format=iife --minify --outfile=src/vendor/rapier.js
# ).
import sys, os, glob
root = os.path.dirname(os.path.abspath(__file__))
three_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, 'node_modules/three/build/three.min.js')
shell = open(os.path.join(root, 'src/shell.html')).read()
modules = sorted(glob.glob(os.path.join(root, 'src/app/*.js')))
assert modules, 'src/app/*.js не найдены'
app = '(function(){\n\'use strict\';\n' + '\n'.join(open(p).read() for p in modules) + '\n})();'
three = open(three_path).read()
rapier = open(os.path.join(root, 'src/vendor/rapier.js')).read()
# защита от преждевременного закрытия <script> внутри строковых литералов бандла
rapier = rapier.replace('</script', '<\\/script')
out = (shell
       .replace('/*THREE_JS_INLINE*/', three)
       .replace('/*RAPIER_JS_INLINE*/', rapier)
       .replace('/*APP_JS_INLINE*/', app))
open(os.path.join(root, 'index.html'), 'w').write(out)
print('index.html:', os.path.getsize(os.path.join(root, 'index.html')), 'bytes,', len(modules), 'modules')
