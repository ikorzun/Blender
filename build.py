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
shell = open(os.path.join(root, 'src/shell.html'), encoding='utf-8').read()
# инлайн живёт внутри <script>: маркеры обязаны существовать, иначе replace
# МОЛЧА ничего не сделает и index.html соберётся без движка/игры
for marker in ('/*THREE_JS_INLINE*/', '/*RAPIER_JS_INLINE*/', '/*APP_JS_INLINE*/'):
    assert marker in shell, 'src/shell.html: потерян маркер ' + marker
modules = sorted(glob.glob(os.path.join(root, 'src/app/*.js')))
assert modules, 'src/app/*.js не найдены'
app = '(function(){\n\'use strict\';\n' + '\n'.join(open(p, encoding='utf-8').read() for p in modules) + '\n})();'
three = open(three_path, encoding='utf-8').read()
rapier = open(os.path.join(root, 'src/vendor/rapier.js'), encoding='utf-8').read()
# защита от преждевременного закрытия <script> внутри строковых литералов —
# для ВСЕХ инлайн-бандлов ('</script' в комментарии/строке любого из них
# обрезал бы index.html посреди кода; экранирование в JS-строке безобидно)
app = app.replace('</script', '<\\/script')
three = three.replace('</script', '<\\/script')
rapier = rapier.replace('</script', '<\\/script')
out = (shell
       .replace('/*THREE_JS_INLINE*/', three)
       .replace('/*RAPIER_JS_INLINE*/', rapier)
       .replace('/*APP_JS_INLINE*/', app))
open(os.path.join(root, 'index.html'), 'w', encoding='utf-8').write(out)
print('index.html:', os.path.getsize(os.path.join(root, 'index.html')), 'bytes,', len(modules), 'modules')
