#!/usr/bin/env python3
"""Pack the Audio/ folder into src/app/74-sfx-data.js.

    python3 tools/sfx-pack.py          # reads Audio/, rewrites the sound data module
    python3 tools/sfx-pack.py --check  # reports only, writes nothing

⚠️⚠️ `Audio/` IS THE SOURCE OF TRUTH FOR EVERY SOUND IN THE GAME (the owner's word 2026-09-01-l:
«I need all the game's sounds and the music to be in this folder, in folders … so that I can change
the files myself right inside the folder and they go into the game»). Four folders, named after his
own four categories, and ONE table below binds a file name to the engine's lookup key. Drop a file
in under the documented name, run this tool, run build.py — it is in the game.

⚠️⚠️ THE KEYS ARE THE ENGINE'S OWN LOOKUP NAMES, NOT SLUGS OF OUR OWN, and nothing may rename one
«for tidiness». `playBuf` finds a material recording as `'mat_' + materialOf(item)` and a pack
override as `'pack_' + type.tex` (75-audio), so a voice's key is fixed by 73-material.js and by the
pack names in TYPES. The canon records what a rename costs: calling `mat_juicy` `mat_fruit` would
have silenced 26 types SILENTLY, because the fallback to the synthesised voice is a presence check
and not an error. THE FILE NAME IS FREE TO BE OBVIOUS; the key is not.

⚠️ VERBATIM OR CONVERTED — the rule is one line and it is printed for every file on every run:
a file the browser can decode (mp3 / m4a / ogg / wav) and no larger than VERBATIM_MAX ships
BYTE FOR BYTE; anything else is converted to mono 128 kbps mp3 by ffmpeg.
  * verbatim by default because these are HIS recordings and the standing rule is not to re-encode
    them. Every file in the folder today is under the ceiling, so a run with the folder untouched
    rewrites the module BYTE-IDENTICALLY - which is the property that makes this tool safe to run
    at any time, and it is checked by the suite.
  * the ceiling exists so that dropping in a 40 MB master does not quietly put 53 MB of base64 into
    the build. Over it, the conversion is automatic and loud.
  * mono, because `playBuf` sends every sample through a StereoPanner, which is equal-power for
    mono and eats exactly -3.01 dB whatever the pan - stereo buys nothing here and doubles the
    bytes. 128k and not 96k because the residual against the source measured 2-3 dB better on the
    two files that carry high frequencies, for 64 KB over the whole set.
⚠️ decodeAudioData is handed RAW BYTES and never a mime type (75-audio), which is why mp3, m4a, ogg
  and wav all decode on the identical path and no engine change is ever needed for a format.

⚠️⚠️ ALIASES ARE DETECTED, NOT DECLARED. Two files with identical bytes produce ONE blob and an
assignment for the second - so the folder can show every voice as its own file (which is what makes
it complete and editable) without paying for the duplication in the build. Replace one of them with
a real recording and it becomes its own blob by itself, with no edit here.

⚠️⚠️ LOUDNESS IS REPORTED, NOT SILENTLY FIXED. Every shipped sample is measured with the SAME ruler
the suite uses - the maximum short-term RMS in a 200 ms window - against the bank's target of
-22.8 dB, and the trim it WOULD need is printed next to the trim `VOICE_TRIM` gives it today. A
replaced file keeps the OLD file's trim until that number is moved, and the owner has twice asked
for the sounds to be levelled: this is the line that makes the drift visible instead of audible.
⛔ IT IS NOT AUTO-APPLIED, deliberately: `VOICE_TRIM` also carries four numbers that are COPIES of a
twin's rather than measurements (the aliased voices) and a guard asserts that equality, so deriving
the table wholesale re-bases a live guard and belongs in its own pass.

⚠️ THE MUSIC IS NOT IN THIS TOOL. It is not inlined into index.html - it is an external file the
page streams - so `build.py` copies Audio/2-music/background-music.* to ./music.mp3.
"""
import array, base64, hashlib, io, math, os, re, subprocess, sys

# ── THE ONE TABLE: engine key -> (folder, file stem, what it is) ──────────────────────────────
LAYOUT = {
  # 1 - INTERFACE: what a control does when it is touched
  'ui':      ('1-interface', 'button-tap',        'any button in the interface'),
  'miss':    ('1-interface', 'wrong-tap',         'a tap that hit nothing / a pairless item'),
  'toast':   ('1-interface', 'notification',      'the message strip (rewards and refusals)'),

  # 3 - OBJECTS: what a thing sounds like when it merges.
  # ⚠️ A `pack-*` file speaks for EVERYTHING in that pack whatever it is made of, and it is tried
  #    BEFORE the material (his word 2026-09-01-b «pack beats material»): 11 of the 12 cars are
  #    material `metal` and all 3 bricks are `plastic`, so without this tier each pair would fight
  #    over one voice. A pack with no file falls through to the material by itself.
  'pack_car':     ('3-objects', 'pack-cars',        'every car'),
  'pack_brick':   ('3-objects', 'pack-bricks',      'every brick'),
  'pack_animal1': ('3-objects', 'pack-animals-1',   'every animal, take 1 of 2 (picked at random)'),
  'pack_animal2': ('3-objects', 'pack-animals-2',   'every animal, take 2 of 2'),
  'mat_juicy':    ('3-objects', 'material-juicy',   'fruit and vegetables'),
  'mat_metal':    ('3-objects', 'material-metal',   'metal that is not a car'),
  'mat_plastic':  ('3-objects', 'material-plastic', 'plastic that is not a brick'),
  'mat_paper':    ('3-objects', 'material-paper',   'paper and cardboard'),
  'mat_glass':    ('3-objects', 'material-glass',   'glass'),
  'mat_plush':    ('3-objects', 'material-plush',   'soft / plush things'),
  'mat_wood':     ('3-objects', 'material-wood',    'wood'),
  'mat_dough':    ('3-objects', 'material-dough',   'dough and bread'),
  'mat_meat':     ('3-objects', 'material-meat',    'meat'),
  'mat_cream':    ('3-objects', 'material-cream',   'cream and ice cream'),

  # 4 - GAMEPLAY: the blender, the screens, the character
  'newobj':  ('4-gameplay', 'new-object-screen', 'the new-object reveal screen'),
  'upgrade': ('4-gameplay', 'object-level-up',   'an object reached the next multiplier'),
  'fill':    ('4-gameplay', 'blender-fill',      'the pour at the start of a level'),
  'grind1':  ('4-gameplay', 'blender-grind-1',   'the blender grinding, take 1 of 4 (random)'),
  'grind2':  ('4-gameplay', 'blender-grind-2',   'the blender grinding, take 2 of 4'),
  'grind3':  ('4-gameplay', 'blender-grind-3',   'the blender grinding, take 3 of 4'),
  'grind4':  ('4-gameplay', 'blender-grind-4',   'the blender grinding, take 4 of 4'),
  'eyes1':   ('4-gameplay', 'eyes-poke-1',       'poking the eyes, take 1 of 2 (random)'),
  'eyes2':   ('4-gameplay', 'eyes-poke-2',       'poking the eyes, take 2 of 2'),

  # ── SLOTS WITH NO FILE YET. The game SYNTHESISES these today; drop a file in under the name
  #    below and it takes over, with no code change (75-audio tries a recording first for every
  #    one of them). They are listed here rather than in a separate table on purpose: the point
  #    of this folder is that it shows every sound the game can make, not only the recorded ones.
  'win':      ('4-gameplay', 'level-win',      'the victory screen'),
  'lose':     ('4-gameplay', 'level-lose',     'the defeat screen'),
  'surprise': ('4-gameplay', 'treasure-found', 'the golden fish is dug out'),
  'shake':    ('4-gameplay', 'bowl-shake',     'shaking the bowl'),
  'combo':    ('4-gameplay', 'combo-start',    'a series starts'),
  'chain':    ('4-gameplay', 'turbo-chain',    'turbo / the chain reaction'),
  'crunch':   ('4-gameplay', 'shards-crunch',  'a hard thing splitting into shards'),
  'tick':     ('4-gameplay', 'timer-tick',     'the tick at the edge of the series window'),
  'merge':    ('4-gameplay', 'merge-generic',  'a mixed harvest with no single material'),
}
EXTS = ('.mp3', '.m4a', '.ogg', '.wav', '.aif', '.aiff', '.flac')
DECODES_AS_IS = ('.mp3', '.m4a', '.ogg', '.wav')   # what the browser reads without conversion
VERBATIM_MAX = 96 * 1024
BITRATE, SRC, DST = '128k', 'Audio', 'src/app/74-sfx-data.js'
# ⛔ Keys that used to exist and must be removed from the module. Deletion is DELIBERATE and never
# automatic: an absent file means «not recorded yet» (the synthesised voice plays), not «delete the
# sound». A key only leaves when it is written here.
DROP = []


TARGET_DB = -22.8          # the bank's level - the same one the suite's spread arm measures against
WINDOW_S = 0.200           # short-term RMS: close to the ear's integration time
# ⛔⛔ ONE FAMILY IS DELIBERATELY NOT AT THE BANK'S LEVEL, AND THE FIRST RUN OF THIS REPORT CRIED
# WOLF ABOUT IT. The three Kenney grinding takes ship UNTRIMMED because they are one recorded set,
# already balanced against each other, and the owner's fourth take was aimed at THEIR mean
# (-15.2 dB) rather than at -22.8 - normalising it to the events would have left a hole in the set.
# So the family is measured against ITSELF: what must hold is that its members stay level with one
# another, and that statement survives him replacing any one of them.
# ⚠️ A warning that is always on is a warning nobody reads - which is why this exists at all.
SELF_LEVELLED = {'grind1', 'grind2', 'grind3', 'grind4'}


def loudness_db(path):
    """Max short-term RMS in a 200 ms window, in dBFS. None if ffmpeg is not around."""
    try:
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', '44100',
                              '-f', 'f32le', '-'], check=True, capture_output=True).stdout
    except Exception:
        return None
    a = array.array('f')
    a.frombytes(raw[:len(raw) - len(raw) % 4])
    n = len(a)
    if n < 16:
        return None
    w = min(n, int(44100 * WINDOW_S))
    hop = max(1, int(44100 * 0.010))
    acc = sum(x * x for x in a[:w])
    best, i = acc, 0
    while i + w + hop <= n:
        for j in range(i, i + hop):
            acc -= a[j] * a[j]
        for j in range(i + w, i + w + hop):
            acc += a[j] * a[j]
        i += hop
        if acc > best:
            best = acc
    rms = math.sqrt(best / w)
    return 20 * math.log10(rms) if rms > 1e-9 else None


def live_trims():
    """The trims the game applies today, read out of 75-audio - never a copy kept here."""
    try:
        src = io.open('src/app/75-audio.js', encoding='utf-8').read()
        block = re.search(r'const VOICE_TRIM = \{(.*?)\n  \};', src, re.S).group(1)
        return {k: float(v) for k, v in re.findall(r"^\s*([a-z_0-9]+):\s*([0-9.]+),", block, re.M)}
    except Exception:
        return {}


def find(folder, stem):
    for e in EXTS:
        p = os.path.join(SRC, folder, stem + e)
        if os.path.exists(p):
            return p
    return None


def main(check=False):
    out, alias, empty, seen, total = {}, {}, [], set(), 0
    present = {}
    by_hash = {}
    # ⚠️⚠️ DECLARATION ORDER, NOT ALPHABETICAL, AND THAT DECIDES WHICH WAY AN ALIAS POINTS.
    # The first key to claim a set of bytes owns the blob and every later twin becomes an
    # assignment to it. Sorted by file name, `material-wood` came before `pack-cars` and the tool
    # emitted `SFX_B64.pack_car = SFX_B64.mat_wood` - functionally identical, and a LIE to the
    # reader: it said the cars speak with wood's voice when the recording is his `Cars.mp3` and
    # wood is the stand-in. LAYOUT is written original-first, so declaration order tells the truth.
    for key in LAYOUT:
        folder, stem, what = LAYOUT[key]
        p = find(folder, stem)
        if not p:
            empty.append((key, folder, stem, what))
            print('%-13s %-30s -- no file yet, the game synthesises it' % (key, folder + '/' + stem))
            continue
        seen.add(os.path.abspath(p))
        ext = os.path.splitext(p)[1].lower()
        raw = open(p, 'rb').read()
        if ext in DECODES_AS_IS and len(raw) <= VERBATIM_MAX:
            b, how = raw, 'verbatim'
        else:
            tmp = '/tmp/sfxpack-%s.mp3' % key
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', p, '-ac', '1', '-ar', '44100',
                            '-c:a', 'libmp3lame', '-b:a', BITRATE, '-write_xing', '0', tmp],
                           check=True)
            b = open(tmp, 'rb').read()
            how = 'converted %s -> mono %s mp3' % (ext[1:], BITRATE)
        h = hashlib.md5(b).hexdigest()
        if h in by_hash:
            alias[key] = by_hash[h]
            print('%-13s %-30s == %s  (alias, 0 extra bytes)'
                  % (key, os.path.relpath(p), by_hash[h]))
            continue
        by_hash[h] = key
        total += len(b)
        out[key] = base64.b64encode(b).decode()
        present[key] = '%s, %.1f KB, ships %s' % (os.path.basename(p), len(b) / 1024.0,
                                                  'as you saved it' if how == 'verbatim' else how)
        print('%-13s %-30s %7d B  %s' % (key, os.path.relpath(p), len(b), how))

    # anything in the folder the table does not know about - loud, because a misspelt name is
    # otherwise indistinguishable from a sound that simply is not in the game
    strays = []
    for root, _, files in os.walk(SRC):
        for f in sorted(files):
            if f.startswith('.') or os.path.splitext(f)[1].lower() not in EXTS:
                continue
            p = os.path.abspath(os.path.join(root, f))
            if p in seen or 'background-music' in f or 'original-master' in f:
                continue
            strays.append(os.path.relpath(p))
    if strays:
        print('\n⚠ IN THE FOLDER BUT NOT IN THE GAME - check the spelling against the table above:')
        for p in strays:
            print('   ' + p)

    if check:
        print('\n--check: nothing written')
        return

    s = io.open(DST, encoding='utf-8').read()
    for dead in DROP:
        s = re.sub(r"^  %s: '[^']*',\n" % re.escape(dead), '', s, count=1, flags=re.M)
    # a key that BECAME an alias must lose its literal, or the build would carry both
    for key in alias:
        s = re.sub(r"^  %s: '[^']*',\n" % re.escape(key), '', s, count=1, flags=re.M)
    for key, b64 in out.items():
        line = "  %s: '%s'," % (key, b64)
        pat = re.compile(r"^  %s: '[^']*',$" % re.escape(key), re.M)
        if pat.search(s):
            s = pat.sub(lambda _: line, s, count=1)
        else:
            s = s.replace('\n};', '\n' + line + '\n};', 1)

    # the alias block, rewritten wholesale so a rerun cannot leave a stale line behind
    block = ['',
      '// ⚠️⚠️ ALIASES, NOT COPIES - and this block is GENERATED, never hand-written:',
      '// tools/sfx-pack.py hashes every file in Audio/ and emits an assignment whenever two of them',
      '// are byte-for-byte identical, so the folder can show every voice as its own file without the',
      '// build paying for the duplication. Replace one of these files with a real recording and it',
      '// becomes its own blob on the next run, with no edit anywhere.',
      '// ⛔ AND THE DUPLICATION IS REAL AND WAS NAMED TO THE OWNER: today wood sounds exactly like',
      '// a car, meat like animal take 1, cream like animal take 2, dough like plastic. His renaming of',
      '// 2026-09-01-b moved the SAME FILES onto the pack keys; this is the state he asked for on',
      '// 2026-09-01-d until his new recordings land, not a finished state.']
    for k, v in sorted(alias.items()):
        block.append('SFX_B64.%-10s = SFX_B64.%s;' % (k, v))
    mark = '// ⚠️⚠️ ALIASES, NOT COPIES'
    i = s.find(mark)
    if i >= 0:
        j = s.find('\n\n', s.rfind('SFX_B64.', i))
        s = s[:s.rfind('\n', 0, i)] + (s[j:] if j > 0 else '\n')
    s = s.rstrip('\n') + '\n' + '\n'.join(block) + '\n'
    io.open(DST, 'w', encoding='utf-8').write(s)

    print('\n%d blobs, %d bytes binary, %d bytes of base64 text' % (len(out), total, int(total * 4 / 3)))
    print('%d aliases (0 extra bytes): %s'
          % (len(alias), ', '.join('%s=%s' % kv for kv in sorted(alias.items())) or '-'))
    print('%d slots waiting for a file: %s'
          % (len(empty), ', '.join('%s/%s' % (e[1], e[2]) for e in empty) or '-'))
    write_readme(present, alias, empty)
    print('Audio/README.txt rewritten from the table above')

    # ── LOUDNESS: what each file measures, and what trim it would need ──────────────────────────
    trims, rows, no_trim = live_trims(), [], []
    for key in list(out) + list(alias):
        folder, stem, _ = LAYOUT[key]
        p = find(folder, stem)
        db = loudness_db(p) if p else None
        if db is None:
            continue
        need = 10 ** ((TARGET_DB - db) / 20.0)
        have = trims.get(key)
        rows.append((key, db, need, have))
        if have is None:
            no_trim.append(key)
    if not rows:
        print('\n(loudness not measured - ffmpeg is not on the PATH)')
        return
    # ⚠️ THE QUANTITY IS THE **EFFECTIVE** LEVEL - the file as measured, plus whatever trim the game
    # multiplies it by. That is what the player hears, and it is the only number both the bank and
    # the self-levelled family can be judged by.
    eff = {k: db + (20 * math.log10(have) if have else 0.0) for k, db, need, have in rows}
    fam = [eff[k] for k in eff if k in SELF_LEVELLED]
    fam_mean = sum(fam) / len(fam) if fam else None
    print('\nLOUDNESS - effective level after trim (max short-term RMS in %d ms):' % (WINDOW_S * 1000))
    print('  bank target %.1f dB; the grinding set is levelled against its own mean%s'
          % (TARGET_DB, (' (%.1f dB)' % fam_mean) if fam_mean is not None else ''))
    drift = []
    for key, db, need, have in sorted(rows):
        aim = fam_mean if (key in SELF_LEVELLED and fam_mean is not None) else TARGET_DB
        d = eff[key] - aim
        tag = 'trim %.3f' % have if have else 'no trim'
        note = 'in step' if abs(d) < 1.5 else '%+.1f dB OFF - wants trim %.3f' % (d, (have or 1.0) * 10 ** (-d / 20.0))
        print('  %-13s file %7.1f dB  ->  heard %7.1f dB   %-11s %s' % (key, db, eff[key], tag, note))
        if abs(d) >= 1.5:
            drift.append(key)
    if drift:
        print('\n⚠⚠ THESE ARE OUT OF STEP WITH THE REST: %s' % ', '.join(drift))
        print('   A replaced file keeps the OLD file\'s trim until VOICE_TRIM (75-audio) is moved, so')
        print('   it plays louder or quieter than everything else. Move the number, or ask for the')
        print('   whole table to be derived from this folder.')
    else:
        print('\n   every sample is within 1.5 dB of what it should be heard at')
    if no_trim:
        print('   (no trim entry, i.e. played as recorded: %s)' % ', '.join(no_trim))


# ⚠️⚠️ THE README IS GENERATED FROM `LAYOUT` ON EVERY RUN, NEVER HAND-WRITTEN. A hand-kept copy of
# this table sitting next to the working one is the project's single most repeated defect: it is
# correct the day it is written and silently wrong afterwards. Rename a slot here and the folder's
# own instructions rename themselves.
def write_readme(present, alias, empty):
    L = []
    L.append('BLENDO - ALL THE SOUNDS OF THE GAME')
    L.append('=' * 60)
    L.append('')
    L.append('Everything the game can play lives in this folder. To change a sound: put your file')
    L.append('in place of the one below, KEEPING THE NAME, then run these two commands in the')
    L.append('project folder:')
    L.append('')
    L.append('    python3 tools/sfx-pack.py     <- reads this folder into the game')
    L.append('    python3 build.py              <- rebuilds index.html (and copies the music)')
    L.append('')
    L.append('THE NAME IS THE ADDRESS. The game finds a sound by the file name, so a renamed file')
    L.append('is a sound the game cannot find - it does not break, it just goes quiet and falls')
    L.append('back to the old synthesised voice. The extension is free: mp3, m4a, ogg and wav all')
    L.append('work. Latin letters only, please - the project carries no Cyrillic anywhere.')
    L.append('')
    L.append('mp3 / m4a / ogg / wav up to %d KB ship exactly as you saved them. Anything bigger,'
             % (VERBATIM_MAX // 1024))
    L.append('or any other format, is converted to mono %s mp3 automatically. Mono on purpose:' % BITRATE)
    L.append('the game pans every sound, and panning a stereo file buys nothing and costs double.')
    L.append('')
    for folder, title in (('1-interface', '1 - INTERFACE'), ('2-music', '2 - MUSIC'),
                          ('3-objects', '3 - OBJECT SOUNDS'), ('4-gameplay', '4 - GAMEPLAY SOUNDS')):
        L.append('')
        L.append(title)
        L.append('-' * 60)
        if folder == '2-music':
            L.append('  background-music.mp3        the track that plays in the game')
            L.append('                              MUST be an .mp3 and MUST keep this name -')
            L.append('                              build.py copies exactly this file to music.mp3.')
            L.append('  original-master-267kbps.mp3 the high-quality master, kept for re-encoding.')
            L.append('                              NOT shipped. Anything else here is ignored too.')
            continue
        for key in LAYOUT:
            f, stem, what = LAYOUT[key]
            if f != folder:
                continue
            if key in present:
                note = present[key]
            elif key in alias:
                note = 'same file as ' + LAYOUT[alias[key]][1] + ' today - replace it to give this its own voice'
            else:
                note = 'NO FILE YET - the game synthesises this; drop a file in and it takes over'
            L.append('  %-28s %s' % (stem + '.*', what))
            L.append('  %-28s %s' % ('', note))
    L.append('')
    L.append('')
    L.append('IF YOU ADD A SOUND THAT IS NOT LISTED')
    L.append('-' * 60)
    L.append('A file the game does not know about is reported by tools/sfx-pack.py as')
    L.append('"IN THE FOLDER BUT NOT IN THE GAME" - that is almost always a misspelt name.')
    L.append('A genuinely new kind of sound needs one line in tools/sfx-pack.py as well.')
    L.append('')
    L.append('(this file is generated by tools/sfx-pack.py - do not edit it by hand)')
    io.open(os.path.join(SRC, 'README.txt'), 'w', encoding='utf-8').write('\n'.join(L) + '\n')


if __name__ == '__main__':
    main('--check' in sys.argv)
