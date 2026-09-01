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
import base64, hashlib, os, re, subprocess, sys, io

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
# ⛔⛔ THE FIVE VOICES ARE BACK (his word 2026-09-01-d: «give the sound back to the five voices,
# I'll record new files»), AND FOUR OF THEM ARE ALIASES RATHER THAN COPIES. That is proven and
# not polite: the md5 of the decoded mp3 in the build of c052338 is byte-for-byte identical to a
# sound shipping today, because his renaming moved the SAME FILES onto the pack keys. Two
# independent sources agree - the audio md5s AND the derived trims (pack_car 0.339 == the old
# mat_wood 0.339, pack_animal1 1.038 == mat_meat 1.037, today's mat_plastic 0.312 == mat_dough).
# ⚠️ EMBEDDING THEM AS COPIES WOULD COST 60.0 KB OF BASE64 FOR BYTES THE BUILD ALREADY CARRIES,
# and - worse - it would LIE TO THE READER: two large blobs look like two recordings. An alias
# says out loud that meat currently speaks with the animals' voice.
# ⚠️⚠️ AND THAT DUPLICATION IS REAL AND WAS NAMED TO HIM: wood sounds exactly like a car, meat
# like animal take 1, cream like animal take 2, dough like plastic. It is the state he asked for
# until his new recordings land, not a state anyone should call finished.
ALIAS = {
    'mat_wood':  'pack_car',       # his Cars.mp3
    'mat_dough': 'mat_plastic',    # his Plastic.mp3
    'mat_meat':  'pack_animal1',   # his Animals.wav
    'mat_cream': 'pack_animal2',   # his Animals-2.wav
}
# ⚠️⚠️ `mat_paper` IS THE ONLY ONE OF THE FIVE WITH AUDIO OF ITS OWN, and his folder no longer
# holds the source. It was recovered from the build of c052338 and written back into the repo as
# a TRACKED asset, so this tool stays a pure files -> module converter: a `git show` in here would
# add a dependency that dies rc=69 in a shell without DEVELOPER_DIR, and would leave the only
# copy of that audio inside a git blob nobody can play.
# ⚠️ IT IS CARRIED VERBATIM because the file ALREADY IS the 128k mono mp3 this tool would produce
# - re-encoding it would be a transcode of a transcode. The md5 is pinned so a wrong or garbled
# file fails LOUDLY instead of shipping quietly.
VERBATIM = { 'mat_paper': ('Audio/things/paper.mp3', '70e37370deb1ee3535280cb0f35bc3c9') }
DROP = []   # ⛔ nothing is dropped any more - see ALIAS/VERBATIM above
BITRATE, DST = '128k', 'src/app/74-sfx-data.js'

def find(src, stem):
    for ext in ('.wav', '.mp3', '.aif', '.aiff', '.m4a', '.ogg', '.flac'):
        p = os.path.join(src, stem + ext)
        if os.path.exists(p): return p
    return None

def main(src):
    out, total = {}, 0
    for slug, (rel, want) in sorted(VERBATIM.items()):
        b = open(rel, 'rb').read()
        got = hashlib.md5(b).hexdigest()
        if got != want:
            sys.exit('%s: %s md5 %s, expected %s - refusing to ship audio I cannot identify'
                     % (slug, rel, got, want))
        total += len(b); out[slug] = base64.b64encode(b).decode()
        print('%-11s <- %-26s %7d -> %6d B  (verbatim, md5 pinned)' % (slug, rel, len(b), len(b)))
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
    # the alias block, rewritten wholesale so a rerun cannot leave a stale line behind
    block = ['',
      '// \u26a0\ufe0f\u26a0\ufe0f ALIASES, NOT COPIES - and the word is PROVEN, not polite: each of these is',
      '// byte-for-byte the mp3 already stored under the key on the right. His renaming of 2026-09-01-b',
      '// moved the SAME FILES onto the pack keys, so restoring the material voices restores exactly',
      '// those bytes. Embedding them again would cost 60.0 KB for audio the build already carries.',
      '// \u26d4 AND IT IS DELIBERATELY WRITTEN AS AN ASSIGNMENT RATHER THAN A SECOND BLOB, so that the',
      '// duplication is VISIBLE: meat currently speaks with the animals\' voice, wood with the car\'s,',
      '// dough with the plastic\'s, cream with the second animal take. That is the state the owner',
      '// asked for on 2026-09-01-d until his new recordings arrive - not a finished state.',
      '// \u26a0\ufe0f WHEN A REAL FILE ARRIVES FOR ONE OF THESE, move its key from ALIAS to FILES in',
      '// tools/sfx-pack.py and rerun - one line, and the alias disappears from this file by itself.']
    for k, v in sorted(ALIAS.items()):
        block.append('SFX_B64.%-10s = SFX_B64.%s;' % (k, v))
    mark = '// \u26a0\ufe0f\u26a0\ufe0f ALIASES, NOT COPIES'
    i = s.find(mark)
    if i >= 0:
        j = s.find('\n\n', s.rfind('SFX_B64.', i))
        s = s[:s.rfind('\n', 0, i)] + (s[j:] if j > 0 else '\n')
    s = s.rstrip('\n') + '\n' + '\n'.join(block) + '\n'
    io.open(DST, 'w', encoding='utf-8').write(s)
    print('\n%d samples, %d bytes binary, %d bytes of base64 text' % (len(out), total, int(total*4/3)))
    print('%d aliases (0 extra bytes): %s' % (len(ALIAS),
          ', '.join('%s=%s' % kv for kv in sorted(ALIAS.items()))))

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/Desktop/SOUNDS'))
