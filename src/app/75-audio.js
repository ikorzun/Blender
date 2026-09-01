// ===== 75-audio: procedural sound (WebAudio, no assets) and vibration =====
// The context is created/resumed only on a user gesture (an iOS requirement) —
// Sound.unlock() is hung on pointerdown in 90-input.

const Sound = (function(){
  let ctx = null, master = null;
  function ensure(){
    if (ctx || !(window.AudioContext || window.webkitAudioContext)) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      // ⚠️ NOT a hardcoded 0.5, but applyGain() — a GAP found by the dispatcher during
      // the merge of the volume fix (2026-07-30): master is created LAZILY on the first
      // gesture, while restoring the slider from localStorage (applySoundVol at startup,
      // 85-hud) runs EARLIER, when master is still null and applyGain is a no-op.
      // With the hardcode, a restored 40% PLAYED AT FULL volume until the first
      // touch of the slider or an ad mute. The guard's measurement below: the gain after
      // a cold start must be 0.5·playerVol, not 0.5.
      master.connect(ctx.destination);
      applyGain();
    } catch(e){ ctx = null; }
  }
  // Samples from 74-sfx-data: decoded lazily after unlock. m4a/AAC decodes
  // everywhere (Safari CANNOT do ogg — hence the conversion at the integration stage).
  // When a sample is unavailable the sound honestly falls back to the procedural variant.
  const buffers = {};
  function b64buf(b64){
    const bin = atob(b64), arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr.buffer;
  }
  function loadSamples(){
    if (!ctx || loadSamples.done) return;
    loadSamples.done = true;
    for (const k in SFX_B64){
      try { ctx.decodeAudioData(b64buf(SFX_B64[k]), buf => { buffers[k] = buf; }, ()=>{}); }
      catch(e){}
    }
  }
  // ⚠️⚠️ THE THIRD ARGUMENT `v` IS VARIETY, AND IT IS OPTIONAL BY DESIGN.
  // The owner's word 2026-08-10: «make web audio varied ONLY for the 3
  // ⚠️ THERE ARE FIVE RECORDINGS NOW (2026-08-20-g/e: plastic and animals voiced for the
  // first time), and variety came to it BY ITSELF — the branch looks at the PRESENCE OF
  // A BUFFER, not at a list of names. The spec «only for the added sounds» is not
  // violated by this: it separated the owner's recordings from the procedural sound,
  // it did not count how many of them there are.
  // newly added sounds» — these are his material recordings (mat_juicy/metal/
  // glass). All the other consumers (`grind`, `ui`, `crunch`) call the function
  // with TWO arguments and go the previous path bit-for-bit.
  // ⛔ THAT IS EXACTLY WHY VARIETY IS AN ARGUMENT AND NOT THE DEFAULT BEHAVIOR:
  // «only for the three» is then held by STRUCTURE, not by the discipline of whoever
  // edits this file next. The guard relies on this: `grind` is also a
  // sample and also goes through playBuf, and it must stay at rate exactly 1.
  // ===== ALIGNING THE LOUDNESS OF THE VOICES (the owner's word 2026-08-20-zh) =====
  // ⚠️⚠️ TRIM IN CODE, NOT NORMALIZATION OF THE FILES. We do not touch the owner's
  // recordings — a project rule; the engine compensates the difference with one
  // multiplier per voice. If he says to re-record them more evenly, the table will
  // drift to ones by itself.
  //
  // ⚠️ THE METRIC IS THE MAX. SHORT-TERM RMS IN A 200 ms WINDOW, not the peak and not the
  // RMS of the whole file. The peak does not describe loudness (a click and a rustle with
  // equal peaks are heard differently); the RMS of the whole file would punish `fruit.wav`
  // for 310 ms of silence in the tail; a 200 ms window is close to the temporal
  // integration of hearing, therefore a SHORT sound honestly gets more gain.
  // Measurement (short-term, dB):
  //   plush -21.4 | metal -17.8 | plastic -20.4 | juicy -35.7 | glass -35.6
  // ⚠️ THE TARGET -22.8 dB IS THE WEIGHTED AVERAGE BY THE NUMBER OF LIVE TYPES (plush 26,
  // juicy 22, metal 15, plastic 4). This way the overall loudness of the game DOES NOT
  // DRIFT: only the spread moves, which was 16.6 dB by RMS and 20.7 by peak.
  // ⚠️ ABOUT THE HEADROOM BEFORE OVERLOAD, HONESTLY: `plush` has a peak of -1.0 dBFS, and
  // with a large group the per-channel multiplier reaches (0.5+0.06n)·√2 = 1.216 — that
  // is, a trim of 0.858 gives a per-channel peak of 0.93, still under one.
  // ⛔ BUT THE FORMER WORDING «raising it higher is IMPOSSIBLE, the ceiling is 0.923» WAS
  // WRONG: the intermediate WebAudio nodes are float32 and do not clip at all,
  // clipping happens only at `destination`, and before it the signal is still multiplied
  // by the master (0.5 · the player's volume). The real headroom is about 9.6 dB.
  // The target -22.8 was chosen NOT by the ceiling, but so that the overall loudness of
  // the game would not drift.
  // ⚠️ THE NOISE FLOOR WAS CHECKED BEFORE THE BOOST: the largest trim (+12.9 dB on
  // `juicy`) raises its noise to -54 dBFS, that is, it stays inaudible.
  // ⚠️ WHY COUNTING BY THE FILES IS LEGITIMATE: `playBuf` applies to ALL voices
  // ONE AND THE SAME transformation (group gain × √2 of panning × master), therefore
  // the difference between the voices EQUALS the difference between the files. A browser
  // capture in headless did not confirm this and was discarded as a faulty instrument,
  // not as an argument.
  // ⛔ `grind*` AND `ui` ARE DELIBERATELY NOT IN THE TABLE: these are other events, the
  // owner asked to align the material sounds. An unknown key gives 1.
  // ⚠️⚠️ EVERY SAMPLE, NOT ONLY THE MATERIAL VOICES (2026-09-01). The owner's new drop spans
  // 13.2 dB of short-term RMS between its loudest and quietest file, so an untrimmed bank would
  // have made «Upgrade obj» twelve decibels louder than the interface click. All sixteen are
  // normalised to the SAME target the five original voices were (-22.8 dB max short-term RMS in
  // a 200 ms window), and the ROLE's loudness is expressed where it belongs - in the `peak`
  // argument at the call site, which is the knob the engine already has.
  // ⛔ THE FORMER NOTE «grind and ui are deliberately NOT in the table - different events» is
  // superseded for `ui` and kept for `grind`: the three grinding variants are one recorded set
  // already balanced against each other, and levelling them individually would flatten that.
  // ✅ THE MEASUREMENT REPRODUCES THE OLD TABLE, which is what says the ruler is the same one:
  // computed blind from the shipped bytes, mat_plush came out 0.854 against the 0.858 standing
  // here since 2026-08-20-zh, and mat_glass 4.381 against 4.401.
  // ⚠️⚠️ THE VALUES ARE DERIVED WITH THE GUARD'S OWN RULER, IN THE BROWSER, AND NOT WITH A
  // PYTHON COPY OF IT. Computed offline first, the table came out 1.2 dB wide because my
  // window stepped in quarter-window hops while the guard slides sample by sample - `toast`
  // has a transient the coarse grid stepped over. Same metric, different sampling, and the
  // difference was larger than the 1.0 dB the guard allows. Re-derived from `bufferOf` in a
  // real decode: the spread is now 0.16 dB.
  // ⚠️ Headroom checked for all sixteen on the loudest path there is (a group of 6+, peak
  // 0.5+0.06*6 = 0.86, times the panner's sqrt2): the worst lands at 0.93 of full scale.
  const VOICE_TRIM = {
    mat_plush:   0.855,
    mat_juicy:   0.188,
    mat_metal:   0.374,
    mat_plastic: 0.508,
    mat_glass:   4.381,
    mat_wood:    0.339,
    mat_dough:   0.312,
    mat_meat:    1.037,
    mat_paper:   0.586,
    mat_cream:   0.699,
    ui:          0.919,
    miss:        0.422,
    newobj:      0.404,
    upgrade:     0.233,
    fill:        0.519,
    toast:       0.482,
  };
  // ⚠️ THE PEAK OF THE PROCEDURAL «BLOOP» IS A NAMED CONSTANT, not a literal in the
  // formula: the guard looks at it, and a copy of the number next to the working one
  // diverges at the first edit. The derivation of the number is at the formula itself below.
  const MATCH_PROC_PEAK = 0.131;
  // ⚠️ WE EXPOSE THE TABLE AND THE BUFFERS, NOT COPIES OF THE NUMBERS: the guard computes
  // the loudness FROM THE RECORDINGS THEMSELVES and multiplies by THE SAME trim that the
  // live code applies. Literals in the test would diverge from the code at the first
  // re-recording of a sound.
  function sfxTrimTable(){ return Object.assign({}, VOICE_TRIM); }
  function sfxProcPeak(){ return MATCH_PROC_PEAK; }
  function sfxBufferOf(name){ return buffers[name] || null; }
  function playBuf(name, peak, v){
    const buf = buffers[name];
    if (!buf) return false;
    const src = ctx.createBufferSource(); src.buffer = buf;
    if (v && v.rate) src.playbackRate.value = v.rate;
    // Panning — only if the browser can do it; no node means the sound is centered,
    // and this is NOT a reason to drag in a PannerNode with HRTF: on mobile it computes a
    // convolution for EVERY source, while a match happens several times per second.
    let pan = null;
    if (v && v.pan != null && ctx.createStereoPanner){
      try { pan = ctx.createStereoPanner(); pan.pan.value = Math.max(-1, Math.min(1, v.pan)); }
      catch (e) { pan = null; }
    }
    // ⚠️⚠️ √2 IS THE RETURN OF EATEN LOUDNESS, NOT A BOOST. All three of the owner's
    // recordings are MONO (verified by the WAV headers: 1 channel, 46875 Hz, 16 bit).
    // Mono WITHOUT panning is upmixed as a COPY into both channels — ×1.0; mono THROUGH
    // StereoPanner goes equal-power and at ANY panning value gives ×0.707,
    // that is, EXACTLY −3.01 dB. Measured in an OfflineAudioContext: power
    // 0.25 → 0.125 at pan 0 / 0.33 / 0.6 — the loss does not depend on the position.
    // ⛔ WITHOUT THIS LINE the owner's recordings sound quieter than the procedural
    // «bloop», which goes to master directly — that is, exactly what he recorded plays
    // quieter. And worse: on old iOS there is NO panning at all, and there the same
    // recordings would go 3 dB LOUDER — one sound at different loudness on different
    // phones.
    // ⚠️ TRUE ONLY FOR MONO. If stereo takes arrive — revisit: with a stereo
    // input StereoPanner does not cut the level.
    // ⚠️ THE ORDER IS LOAD-BEARING: the gain is computed AFTER the decision about panning,
    // because it depends on it. The lines cannot be swapped.
    const g = ctx.createGain();
    g.gain.value = (peak || 0.7) * (pan ? Math.SQRT2 : 1) * (VOICE_TRIM[name] || 1);
    src.connect(g);
    if (pan){ g.connect(pan); pan.connect(master); } else { g.connect(master); }
    // ⚠️ WE DISCONNECT AFTER THE END: Safari is in no hurry to collect disconnected
    // nodes by itself, and with frequent matches hundreds of them pile up. The previous
    // path (two nodes per sound) tolerated this, with panning there are three.
    src.onended = function(){ try { src.disconnect(); g.disconnect(); if (pan) pan.disconnect(); } catch (e) {} };
    src.start();
    return true;
  }
  function unlock(){
    ensure();
    // not only 'suspended': after a call/minimizing iOS gives 'interrupted' —
    // we resume from ANY non-running state, otherwise the sound stayed silent until reload
    if (ctx && ctx.state !== 'running'){ try { ctx.resume(); } catch(e){} }
    loadSamples();
  }
  function env(t0, a, d, peak){
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + a + d);
    g.connect(master);
    return g;
  }
  function tone(freq, type, t0, a, d, peak){
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    o.connect(env(t0, a, d, peak));
    o.start(t0); o.stop(t0 + a + d + 0.05);
  }
  function noise(t0, d, peak, cutoff){
    const len = Math.max(1, Math.floor(ctx.sampleRate * d));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i=0;i<len;i++) data[i] = (Math.random()*2 - 1) * (1 - i/len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff || 800;
    src.connect(f); f.connect(env(t0, 0.005, d, peak));
    src.start(t0);
  }
  const fxMap = {
    match(a){ // a «bloop» arpeggio, higher and longer with a big group.
      // Argument: a number (compatibility) OR {n, k} — k = the length of the streak,
      // the pitch grows as a staircase with the tempo (tempo batch 2026-07-31), cap +60%.
      const n = (a && a.n) || a || 2, k = (a && a.k) || 0;
      // ⚠️⚠️ THE MATERIAL'S VOICE OUTRANKS THE PROCEDURAL «BLOOP», BUT IS NOT MANDATORY.
      // Not the whole set is recorded (five voices out of ten: plush, juicy, metal,
      // plastic, glass — 67 live types out of 87) —
      // the other voices have no sample, and they MUST sound as before.
      // ⛔ Therefore it is not `if (material)` here, but a check for the PRESENCE OF A
      // BUFFER: the type is always tagged, while the sound is not yet, and confusing
      // these two conditions means silently deafening a fifth of the pool (20 live types
      // out of 87 go procedural; when this paragraph was written it was nine tenths —
      // there were three recordings).
      // ⚠️ THE LOUDNESS GROWS WITH THE SIZE OF THE GROUP, it is not fixed: with the
      // procedural «bloop» the size is heard through the length of the arpeggio, and a
      // sample without this would read as «the sound stopped reacting to the game». The
      // pitch of the streak is NOT carried over here — on a recording it would sound like
      // a sped-up tape.
      // ⚠️⚠️ VARIETY ONLY HERE (the owner's word 2026-08-10). A recorded
      // sample repeated one to one is caught by the ear as «it looped» already by the
      // fifth time — the procedural «bloop» did not suffer from this, it is computed anew
      // every time.
      // ⛔ ROUND ROBIN WAS CANCELED BY THE OWNER (2026-08-11: «remove the duplicate sound
      // recordings»). I proposed recording 2-3 takes per voice in order to enable
      // selection like `grind` has — he refused. ⛔ That means VARIETY IS HELD
      // ENTIRELY BY THE PITCH AND THE PANNING, and touching them «as unnecessary» is not
      // allowed: without them a single recording would read as looped already by the
      // fifth time.
      // ⚠️ Do not add takes «for the future» either: every recording rides in the portal
      // package, and our headroom to the 8 MB limit is 1.4 MB for everything else.
      // ⚠️ PITCH BY SIZE — the owner's formula 1/√size: a large thing sounds
      // lower, a small one higher. We take the bounding radius of the TAPPED item: it
      // carries both the caliber of the type and the size spread of the level.
      // ⚠️⚠️ THE PIVOT IS `MESH_SCALE`, NOT ONE, AND THIS IS NOT COSMETICS. `it.r` is
      // `rc · levelSize · MESH_SCALE` (40-items:117), that is, for a typical
      // item (`rc:1.0`, and there are 107 such out of 120) it equals 0.62, not 1. A pivot
      // at one baked in a constant multiplier of 1/√0.62 = 1.27: THE MEASUREMENT on live
      // matches gave 12 values out of 12 ABOVE one (median 1.12), that is,
      // «bigger — lower» degenerated into «everything is sped up, the big ones a bit less».
      // ⛔ AND THE COST WAS NOT ONLY IN MEANING: Blink and WebKit resample
      // `AudioBufferSourceNode` with linear interpolation (that is almost all mobile
      // traffic), and raising the tone is decimation without antialiasing. Constant
      // work above one folded the top of the spectrum on EVERY match.
      // ⚠️ The pivot is taken from THE SAME constant the radius is assembled from, not
      // from the literal 0.62: a copy of a number next to the working one always
      // diverges later.
      // ⚠️ THE CORRIDOR 0.72..1.38 IS NOT DECORATION: beyond it a short recording
      // reads no longer as «the same material, bigger», but as a different sound, and
      // the material stops being recognizable by ear — exactly what it was recorded for.
      // ⚠️ THE ±5% JITTER IS TAKEN FROM THE OWNER'S SAMPLE (0.95..1.05) — it is what gives
      // «a bit different every time» where the size is the same (levels 1-19 go with
      // ONE size, SIZE_UNIFORM_LEVELS: without the jitter there is no variety there
      // at all, and those are the player's very first half hour).
      if (a && a.m){
        const r = Math.max(0.05, (a && a.r) || MESH_SCALE);
        const rate = Math.max(0.72, Math.min(1.38,
          Math.sqrt(MESH_SCALE / r) * (0.95 + Math.random() * 0.1)));
        if (playBuf('mat_' + a.m, 0.5 + 0.06 * Math.min(6, n),
                    { rate, pan: (a && a.pan != null) ? a.pan : null })) return;
      }
      // ⛔⛔ IT NO LONGER PLAYS FOR ANY ORDINARY MERGE (2026-09-01). Every one of the ten
      // voices in `MATERIAL_OF` now has a recording, so the branch above always finds a buffer
      // and returns. What is left reachable - and it is the RIGHT remainder, not a leftover -
      // are the two «everything at once» events that pass NO material: the bowl shatter
      // collect-all (80-gameplay:601) and a detonated type charge (:677, which passes a bare
      // number). A mixed harvest has no single material to speak with, so the synthesised
      // arpeggio is exactly the honest voice for it.
      // ⚠️ THE FORMER TEXT SAID «it plays for the 20 types that have no recording» - that is
      // now false and was removed rather than left standing, by the canon's own rule.
      // ⚠️⚠️ THE PROCEDURAL «BLOOP» WAS LOWERED 0.45 -> 0.19 (the owner's edit
      // «align the loudness of the sounds»), and it WAS THE LOUDEST SOUND OF A MATCH: -16.2 dB
      // against -21.4…-35.7 for the recordings. To align the recordings with each other
      // and leave it as is would mean not finishing the job: exactly those 20 types would
      // stick out.
      // ⛔ RAISING THE RECORDINGS UP TO IT WAS IMPOSSIBLE — we would have hit the peak of
      // `plush` (-1.0 dBFS), therefore we align downward, to the common target -22.8 dB.
      // ⚠️ THE NUMBER WAS DERIVED BY A SIMULATION OF THIS VERY FORMULA, not picked by ear:
      // peak 0.131 gives short-term -26.1 dB with a group of 3 — exactly the level of the
      // recordings at the master. The staircase by group size is preserved bit-for-bit.
      // ⛔⛔ THE FIRST EDITION OF THIS NUMBER (0.19) WAS WRONG, AND THE MISTAKE IS
      // INSTRUCTIVE: I took the multiplier of the recordings' path as `(0.5+0.06n)·√2` =
      // -0.3 dB. But √2 here is NOT A BOOST — it RETURNS what the panning ate
      // (see the big comment at `playBuf` some lines above), and together with
      // the equal-power 0.707 it cancels IDENTICALLY. The real multiplier with
      // a group of 3 is 0.68, that is -3.35 dB, and the «bloop» stayed louder than the
      // recordings by +2.0…+3.3 dB across all group sizes.
      // ⚠️⚠️ A CLASS OF MISTAKE, NOT A TYPO: A CLIPPING multiplier was reused
      // as a LOUDNESS one. For the headroom before overload √2 MUST be taken into account
      // (with hard panning the per-channel peak contains it), for loudness it MUST NOT.
      // ⚠️ And the symptom was visible without measurements: my comment contradicted
      // THE NEIGHBORING one in this same file. **When you edit a number — grep the file
      // for the word, not only for the symbol.**
      // ⚠️ VERIFIED EMPIRICALLY, NOT DERIVED: rendering mono through
      // `√2 → StereoPanner` gives EXACTLY the same level as without panning, at
      // pan 0 / 0.3 / 1 — all three -9.031 dB.
      // ⛔ ONLY THE MATCH IS TOUCHED: `tone` is shared, and editing its parameter here
      // does not affect `tick`, `miss` or the others — they have their own calls.
      const pitch = 1 + 0.06 * Math.min(10, k);
      const t = ctx.currentTime, base = (380 + Math.min(4, n)*60) * pitch;
      for (let i=0;i<Math.min(n,4);i++) tone(base*Math.pow(1.25, i), 'sine', t + i*0.055, 0.008, 0.16, MATCH_PROC_PEAK);
    },
    tick(){ // an alarm at the edge of the streak window (tempo batch): a dry short «tk»,
            // quiet — a peripheral signal, not an event
      const t = ctx.currentTime; tone(1250, 'sine', t, 0.002, 0.035, 0.10); },
    // ⚠️ THE SAME SHAPE AS `ui`: the recording if it decoded, the former two square blips if it
    // did not. The fallback is a PRESENCE check on the buffer and not a list of names, so a
    // sample that fails to decode degrades to the old sound instead of to silence.
    miss(){ if (!playBuf('miss', 0.55)){ const t = ctx.currentTime; tone(150, 'square', t, 0.005, 0.12, 0.16); tone(110, 'square', t+0.07, 0.005, 0.12, 0.13); } },
    // THE FOUR SCREENS THE SOUND INVENTORY LISTED AS MUTE (the owner's drop 2026-09-01). They
    // have no procedural fallback on purpose: there was no sound here at all, so silence is the
    // honest degradation rather than a synthesised stand-in nobody chose.
    newobj(){  playBuf('newobj',  0.62); },   // the reveal screen - the biggest reward, and silent
    upgrade(){ playBuf('upgrade', 0.55); },   // a type's multiplier went up a tier
    fill(){    playBuf('fill',    0.42); },   // the intro pour; quieter - it is a bed, not an event
    toast(){   playBuf('toast',   0.45); },   // the game's ONLY refusal channel
    shake(){ noise(ctx.currentTime, 0.35, 0.45, 500); },
    grind(){ // the grinding sample (3 variants, the owner's spec) with a procedural fallback
      if (playBuf('grind' + (1 + Math.floor(Math.random()*3)), 0.8)) return;
      const t = ctx.currentTime; noise(t, 0.45, 0.5, 300); tone(70, 'sawtooth', t, 0.01, 0.4, 0.22); },
    crunch(n){ // the «crunch» of a hard pack splitting (brick/pirate -> shards).
      // THE SPECTRUM IS HIGHER than the rumble of grind (that one is low, cutoff 300 +
      // 70 Hz) — on a common pile they do not mask each other: the rumble of the blades
      // below, the crack of the split above. The body is short filtered noise, with a
      // couple of dry clicks on top (the split «tk»). A bit harsher with a big group
      // (n shards), cap 12.
      const t = ctx.currentTime, k = Math.min(1, (n || 7)/12);
      noise(t, 0.10 + 0.05*k, 0.30 + 0.12*k, 2600);   // the sharp upper split
      noise(t + 0.015, 0.09, 0.18, 1300);             // the body of the crunch
      tone(190, 'square', t,        0.002, 0.05, 0.13);
      tone(130, 'square', t + 0.03, 0.002, 0.06, 0.10); },
    ui(){ if (!playBuf('ui', 0.5)){ const t = ctx.currentTime; tone(900, 'sine', t, 0.004, 0.05, 0.15); } },
    combo(){ // a «power-up»: a rising glissando + a spark; the start is delayed
             // so as not to mask the match «bloop» that sounds on the same tap
      const t = ctx.currentTime + 0.06;
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(420, t);
      o.frequency.exponentialRampToValueAtTime(1260, t + 0.18);
      o.connect(env(t, 0.01, 0.22, 0.4));
      o.start(t); o.stop(t + 0.3);
      tone(1568, 'sine', t + 0.16, 0.005, 0.12, 0.3);  // a spark on top
      tone(2093, 'sine', t + 0.22, 0.005, 0.14, 0.22);
    },
    chain(){ // «the reactor has started»: a low glissando + a swoosh + a fanfare spark
      const t = ctx.currentTime + 0.05;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(180, t);
      o.frequency.exponentialRampToValueAtTime(720, t + 0.35);
      o.connect(env(t, 0.02, 0.4, 0.3));
      o.start(t); o.stop(t + 0.5);
      noise(t + 0.05, 0.35, 0.3, 1200);
      [784, 1047, 1568].forEach((f,i)=>tone(f, 'triangle', t + 0.3 + i*0.07, 0.008, 0.2, 0.32));
    },
    surprise(){ const t = ctx.currentTime; [523, 659, 784, 1047].forEach((f,i)=>tone(f, 'triangle', t + i*0.09, 0.01, 0.25, 0.38)); },
    win(){ const t = ctx.currentTime; [523, 659, 784, 1047, 1319].forEach((f,i)=>tone(f, 'triangle', t + i*0.12, 0.01, 0.3, 0.38)); },
    lose(){ const t = ctx.currentTime; [330, 262, 196].forEach((f,i)=>tone(f, 'sine', t + i*0.15, 0.01, 0.35, 0.32)); },
  };
  // THE EXTERNAL MUTE IS INDEPENDENT OF CFG.sound (a request from INTEGRATION 2026-07-23).
  // Two different owners of silence: CFG.sound is the PLAYER's choice (the settings
  // toggle), extMuted is a requirement of the ENVIRONMENT (an ad spot, the platform sent
  // AUDIO_STATE_CHANGED). They must not be mixed: «save and restore»
  // CFG.sound is a race with the player, who can open the settings during a spot
  // and get his choice overwritten. We mute with the master gain, not with a flag: the
  // already sounding samples are cut off too, otherwise the tail of a sound would climb
  // over the ad.
  let extMuted = false;
  // THE PLAYER'S VOLUME 0..1 (the Sound slider in the settings, 85-hud/applySoundVol).
  // ⚠️ ADDED BY INTERFACE 2026-07-30 following the owner's complaint «the Sound slider
  // does not save its state»: before that the state of the sound was ONLY the boolean
  // CFG.sound, and a 0..100 slider physically could not save anything — there was no
  // volume in the path at all. THE BASE MASTER LEVEL 0.5 (headroom for clipping) IS
  // PRESERVED: at playerVol=1 the gain is exactly 0.5, as it was before the edit,
  // bit-for-bit.
  // ⚠️ THE EXTERNAL MUTE IS STRONGER: extMuted=true mutes to 0 at any volume —
  // otherwise a player who moved the slider during an ad would start the sound over the spot.
  let playerVol = 1;
  function applyGain(){ if (master) master.gain.value = extMuted ? 0 : 0.5 * playerVol; }
  return {
    unlock,
    loaded(){ return Object.keys(buffers); }, // debug: which samples are decoded
    // ⚠️⚠️ THE TRIO FOR THE LOUDNESS GUARD, AND IT IS LOAD-BEARING. It takes THE BUFFER
    // ITSELF, computes the short-term RMS over it and multiplies by THE SAME trim that
    // the live code applies — that is, it checks the RESULT of the alignment, not the
    // agreement of the test with a copy of the table. Removing this = quietly removing
    // the only check that the recordings sound equally loud.
    trimTable(){ return sfxTrimTable(); },
    procPeak(){ return sfxProcPeak(); },
    bufferOf(name){ return sfxBufferOf(name); },
    setMuted(on){ extMuted = !!on; ensure(); applyGain(); return extMuted; },
    setVolume(v){ playerVol = Math.max(0, Math.min(1, +v || 0)); applyGain(); return playerVol; },
    volume(){ return playerVol; },
    // diagnostics for the guards: the REAL master gain (volume() returns only
    // playerVol and does not see a divergence with the engine — that is what the gap above lived on)
    gain(){ return master ? master.gain.value : null; },
    isMuted(){ return extMuted; },
    play(name, arg){
      if (!CFG.sound || extMuted) return;
      ensure();
      if (!ctx || ctx.state !== 'running') return;
      try { fxMap[name](arg); } catch(e){}
    },
  };
})();
function vibrate(ms){ if (CFG.sound && navigator.vibrate){ try { navigator.vibrate(ms); } catch(e){} } }
