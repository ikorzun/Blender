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
    # the five voices that had NO recording at all - 24 live types that until now merged with
    # the synthesised arpeggio, the single largest audible gap the sound inventory named
    'mat_wood':    'OhmLab_Industrial-Pop',     # 5 types: barrel, palm, matchbox, nutcracker, cart
    'mat_dough':   'OhmLab_Double-Bubble-Pop',  # 6: gingerbread, cupcake, croissant, chinese, cake, donut
    'mat_meat':    'Hit Pop',                   # 7: fish, burger, turkey, cheese, ham, hotdog
    'mat_paper':   'Pop',                       # 3: toilet paper, book, present
    'mat_cream':   'Pop Up Dings',              # 3: the three ice creams
    # ⛔ THESE THREE REPLACE RECORDINGS HE HIMSELF CHOSE ON 2026-08-20-e. Named to him rather
    # than done quietly: one word puts the old ones back, they are in git.
    'mat_juicy':   'Fruits',                    # 23 types
    'mat_metal':   'Metall',                    # 16 types
    'mat_plastic': 'Brick',                     # 7 types
    # the interface, and the screens the inventory listed as MUTE
    'ui':          'Peep Click Pop',            # every <button> in the game
    'miss':        'Error-1',                   # was procedural: two square blips
    'newobj':      'New object',                # the reveal screen - it had NO sound at all
    'upgrade':     'Upgrade obj',               # the multiplier tier-up
    'fill':        'Fill blender',              # the intro pour
    'toast':       'Ding Pop Up',               # toast() - the game's only refusal channel
}
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
    for slug, b64 in out.items():
        line = "  %s: '%s'," % (slug, b64)
        pat = re.compile(r"^  %s: '[^']*',$" % re.escape(slug), re.M)
        if pat.search(s): s = pat.sub(lambda _: line, s, count=1)
        else:             s = s.replace('\n};', '\n' + line + '\n};', 1)
    io.open(DST, 'w', encoding='utf-8').write(s)
    print('\n%d samples, %d bytes binary, %d bytes of base64 text' % (len(out), total, int(total*4/3)))

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/Desktop/SOUNDS'))
