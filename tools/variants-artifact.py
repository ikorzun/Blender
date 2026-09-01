#!/usr/bin/env python3
"""Build the self-contained copy of electric-variants/index.html for publishing.

    python3 tools/variants-artifact.py     -> electric-variants/artifact.html

⚠️⚠️ THE BENCH ITSELF IS A LOCAL TOOL AND IS NOT SELF-CONTAINED ON PURPOSE. It loads three.js from
`node_modules/` and the game's own `36-models.js` / `08-matcap-packs.js` straight out of `src/`,
so what it renders is THE GAME'S model, colormap atlas and pack matcap - not a stand-in. An effect
judged against a stand-in is a judgement about the stand-in, which is the whole reason the bench
exists. The price is that it only runs from the project's own preview server.

This tool makes the shareable copy: the three sources inlined, and `36-models.js` trimmed from
3.7 MB to the three models the page actually offers. ~1.1 MB, opens anywhere.

⚠️⚠️ TWO NON-OBVIOUS RULES, BOTH LEARNED FROM A BROKEN RENDER:
 1. THE OUTPUT CARRIES NO DOCTYPE AND NO <head>, because the artifact host supplies both. Served
    DIRECTLY - from a plain file server or from GitHub Pages - the same file falls into QUIRKS
    MODE, and there the fixed WebGL canvas detaches from the tiles it is scissored into: measured,
    the models render tens of pixels above their cards. That is why the generated copy is
    gitignored and the deliverable is the published artifact, never a URL on our own domain. If a
    copy on our own domain is ever wanted it is a DELIBERATE third file with a doctype, not this
    one renamed.
 2. THE PAGE'S OWN TEXT IS ENTITY-ENCODED TO PURE ASCII. With no <head> the file cannot declare a
    charset, so a host serving anything but UTF-8 turns every em dash into mojibake - which is
    exactly what a local check showed. Numeric entities are charset-proof, and they work in the
    variant notes too because those are written through innerHTML.
    ⛔ The encoding is applied BEFORE the bundles are inserted: entity-encoding three.min.js would
    destroy it.
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BENCH = os.path.join(ROOT, 'electric-variants', 'index.html')
OUT = os.path.join(ROOT, 'electric-variants', 'artifact.html')
THREE = os.path.join(ROOT, 'node_modules', 'three', 'build', 'three.min.js')
PACKS = os.path.join(ROOT, 'src', 'app', '08-matcap-packs.js')
MODELS = os.path.join(ROOT, 'src', 'app', '36-models.js')

# the three objects the bench offers; everything else in 36-models.js is dropped
WANT_ATLAS = ('animal', 'food', 'car')
WANT_MODEL = ('M_ANIMALFOX_', 'M_FOODWATERMELON_', 'M_CARTAXI_')
# lines 1..44 are the atlas registry, modelColormap and modelGeo - taken verbatim so the copy
# builds its geometry through the game's own helper rather than a re-implementation
HEAD_LINES = 44

TAGS = ('<script src="../node_modules/three/build/three.min.js"></script>\n'
        '<script src="../src/app/08-matcap-packs.js"></script>\n'
        '<script src="../src/app/36-models.js"></script>\n')


def main():
    models = open(MODELS, encoding='utf-8').read().split('\n')
    keep = [ln for ln in models
            if (ln.startswith("MODEL_ATLASES['") and ln.split("'")[1] in WANT_ATLAS)
            or (ln.startswith('const M_') and any(ln.startswith('const ' + w) for w in WANT_MODEL))]
    trimmed = '\n'.join(models[:HEAD_LINES]) + '\n' + '\n'.join(keep) + '\n'

    page = open(BENCH, encoding='utf-8').read()
    page = '<title>' + page.split('<title>', 1)[1]          # drop the doctype and the meta tags
    page = page.encode('ascii', 'xmlcharrefreplace').decode('ascii')
    if TAGS not in page:
        raise SystemExit('the three <script src> tags moved - update TAGS in this tool')
    inline = ''.join('<script>%s</script>\n' % open(p, encoding='utf-8').read().replace('</script', '<\\/script')
                     for p in (THREE, PACKS)) \
        + '<script>%s</script>\n' % trimmed.replace('</script', '<\\/script')
    open(OUT, 'w', encoding='utf-8').write(page.replace(TAGS, inline, 1))
    print('%s: %d bytes (%d of %d model lines kept)'
          % (os.path.relpath(OUT, ROOT), os.path.getsize(OUT), len(keep), len(models)))


if __name__ == '__main__':
    main()
