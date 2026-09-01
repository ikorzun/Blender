#!/usr/bin/env python3
"""Pack the owner's sound drop into src/app/74-sfx-data.js.

    python3 tools/sfx-pack.py ~/Desktop/SOUNDS

Reads the source files, converts each to MONO 128 kbps MP3 and rewrites the entries it owns in
SFX_B64, in place, leaving every other key untouched.

WHY MP3 AND WHY MONO - both measured, neither guessed:
  * MP3 is the owner's explicit instruction 2026-09-01 ("convert them to mp3 for less weight").
    It overrides the standing rule "never re-encode the owner's assets to another extension" -
    that rule exists because a conversion was once done WITHOUT being asked and destroyed
    transparency on his screenshots. Here he asked. 1.80 MB of sources -> 251 KB.
  * MONO because `playBuf` sends every sample through a StereoPanner, which is equal-power for
    mono and eats exactly -3.01 dB whatever the pan - i.e. stereo buys nothing here and doubles
    the bytes. All of his previous recordings are mono too.
  * 128k and not 96k because the residual against the source is 2-3 dB better on the two files
    that actually carry high frequencies (Metall -24.1 vs -21.3 dB, Hit Pop -31.8 vs -28.9),
    for 64 KB over the whole set.
  * ⚠ Four of the sources are ALREADY mp3, so those are transcodes and carry the first
    encoder's artefacts as well - visible as a worse residual (Fruits -17.6, Brick -17.7).
    Nothing can be done about that from here; the originals are what he sent.
⚠ decodeAudioData is handed RAW BYTES and never a mime type (75-audio), which is why an MP3
  needs NO engine change at all - it decodes on the identical path as the m4a and wav entries.
"""
import base64, os, re, subprocess, sys, io

# SFX_B64 KEY -> source file stem.
# ⚠⚠ THE KEYS ARE THE ENGINE'S OWN LOOKUP NAMES, NOT SLUGS OF OUR OWN. `playBuf` finds a material
# recording as `'mat_' + materialOf(item)` (75-audio), so a voice's key is fixed by
# 73-material.js and nothing may rename it "for tidiness" - the canon records that renaming
# `mat_juicy` to `mat_fruit` would have silenced 26 types SILENTLY, because the fallback to the
# procedural bloop is a presence check and not an error.
FILES = {
    # ── BY PACK (his word 2026-09-01-b: «pack beats material»). A pack override is tried BEFORE
    #    the material voice, so these speak for everything in their pack whatever it is made of.
    #    He renamed the files himself to say so - the names ARE the mapping.
    'pack_car':     'Cars',          # 12 types (11 of them are material `metal`)
    'pack_brick':   'Brick',         # 3 types (all of them are material `plastic`)
    'pack_animal1': 'Animals',       # 24 types, two takes picked at random
    'pack_animal2': 'Animals-2',
    # ── BY MATERIAL, for whatever no pack override covers
    'mat_juicy':    'Fruits',        # 23 types
    'mat_metal':    'Metall',        # the metal that is not a car: toycars, factory, props
    'mat_plastic':  'Plastic',       # the plastic that is not a brick
    # ── EVENTS
    'ui':           'Peep Click Pop',
    'miss':         'Error-1',
    'newobj':       'New object screen',
    'upgrade':      'Upgrade obj',
    'fill':         'Fill blender',
    'toast':        'Ding Pop Up',
    'eyes1':        'robot',         # poking the eyes - his word: «the robot ones are for
    'eyes2':        'robot-2',       # clicking on the eyes». Two takes, picked at random.
    'grind4':       'Blend object',  # his pick: «the moment of blending itself»
}
# ⛔⛔ FIVE VOICES LOST THEIR RECORDING IN THIS BATCH, AND IT IS HIS RENAMING THAT DID IT, NOT A
# DELETION OF MINE: `mat_wood` was fed by the file now called Cars, `mat_dough` by the one now
# called Plastic, `mat_meat` by Animals, `mat_cream` by Animals-2, and `mat_paper` by a file he
# took out of the folder. Keeping them would have meant meat sounding exactly like animals.
# 24 live types therefore go back to the synthesised arpeggio - named to him with the count.
DROP = ['mat_wood', 'mat_dough', 'mat_meat', 'mat_paper', 'mat_cream']
BITRATE, DST = '128k', 'src/app/74-sfx-data.js'

def find(src, stem):
    for ext in ('.wav', '.mp3', '.aif', '.aiff', '.m4a', '.ogg', '.flac'):
        p = os.path.join(src, stem + ext)
        if os.path.exists(p): return p
    return None

def main(src):
    out, total = {}, 0
    for slug, stem in sorted(FILES.items()):
        p = find(src, stem)
        if not p: sys.exit('missing source: %s' % stem)
        tmp = '/tmp/sfxpack-%s.mp3' % slug
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', p, '-ac', '1', '-ar', '44100',
                        '-c:a', 'libmp3lame', '-b:a', BITRATE, '-write_xing', '0', tmp], check=True)
        b = open(tmp, 'rb').read(); total += len(b)
        out[slug] = base64.b64encode(b).decode()
        print('%-11s <- %-26s %7d -> %6d B' % (slug, os.path.basename(p), os.path.getsize(p), len(b)))
    s = io.open(DST, encoding='utf-8').read()
    for dead in DROP:
        s = re.sub(r"^  %s: '[^']*',\n" % re.escape(dead), '', s, count=1, flags=re.M)
    for slug, b64 in out.items():
        line = "  %s: '%s'," % (slug, b64)
        pat = re.compile(r"^  %s: '[^']*',$" % re.escape(slug), re.M)
        if pat.search(s): s = pat.sub(lambda _: line, s, count=1)
        else:             s = s.replace('\n};', '\n' + line + '\n};', 1)
    io.open(DST, 'w', encoding='utf-8').write(s)
    print('\n%d samples, %d bytes binary, %d bytes of base64 text' % (len(out), total, int(total*4/3)))

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/Desktop/SOUNDS'))
