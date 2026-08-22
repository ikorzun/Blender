# The «Living Environment» package — FIRST UPDATE AFTER THE RELEASE

Approved by the owner 2026-07-31: «do the meta-triple and the daytime pair after
the release». Selected by a panel (17 ideas, 3 judges: perf on weak phones / risk
of distraction / honesty of the meta layer); full digest — in panel output wswcvvxct.
⚠️ DO NOT START BEFORE THE RELEASE: the package is not part of the launch week.

## The meta-triple (all are «hours» of work, 28/30 from the judges)

1. **The dream planet (night)** — the GRAPHICS zone.
   After the K0 vignette a tiny dim disc appears among the night stars —
   the planet from the mixer's dream; with every chapter viewed (K1→K4) it grows
   a little / gains a ring. Built on: the `if (uStars > 0)` branch of the sky
   shader (10-stage), ~4-6 ALU at night only; the uniform changes 4 times over the
   life of a save (the Save.st bits already exist). 0 draw calls, no gate needed by construction.

2. **The sky accumulates stars (night)** — the GRAPHICS zone.
   For a newcomer the night is almost empty; star density grows with the share of
   unlocked types, for every COMPLETE section of the collection — one large star at
   a fixed point. Built in the same place (the star branch is already there, uStars
   turns from 0/1 into a driver); the data — accSnapshot()/Save.ac, already counted.
   ⚠️ The judges killed a DUPLICATE of this idea («Sky-museum») — both would live in
   one shader branch; THIS formulation is implemented, do not invent the second one.

3. **The character remembers a veteran** — the INTERFACE zone.
   On a tier-up the mixer makes a pleased face for a second (faceEvent on
   onAccTierUp — the event is already fired); for a player with a large Save.se the
   idle mood is shifted toward kind/sly. Zero WebGL pixels: the eyes are DOM/SVG,
   already ticking. ⚠️ Canon of the eyes: any edit = an entry in EYES-CHARACTER-SPEC.

## The daytime pair

4. **Idle gestures (day)** — the INTERFACE zone, ~a day of work.
   The mixer at idle gets bored / glances sideways (rare, slow gestures on top of
   the idle wandering of the pupils). Does not compete with signals: gestures only
   AT REST, any gameplay event removes them. The canon of the eyes is mandatory.

5. **Light of the hour (sun/moon)** — the GRAPHICS zone, ~a day of work.
   A soft blurred patch of light in the sky; the azimuth — from the real hour at
   load time (morning — «from the east», evening — «from the west»). +6-8 ALU per
   pixel in an already paid-for pass, the uniforms are static, no gate needed.

## Optional, capacity permitting (was in the recommendation next to the pair)

6. **Procedural ambient sound** — light wind by day, crickets at night, WebAudio
   synthesis (75-audio), zero files. Quiet, below the SFX; muted by the same mute
   rules (ads/the platform take precedence). The judges gave 20/30 — not because
   it is bad, but because it is not meta; the owner did not approve it separately —
   when implementing, show it to him with an off switch.

## Constraints of the package (from the judges' verdicts — DO NOT violate)

- The periphery moves SLOWLY or does not move: «fast small stuff at the edge of
  vision is worse than a slow large form». The killed motes/fireflies/veins
  must not be brought back.
- Nothing eternal in fx[] and nothing that wakes the physics or the shadow gate —
  the sleep savings are untouchable.
- Zero new image assets; everything into the existing sky pass, the DOM or synthesis.
- Every edit of the eyes — through EYES-CHARACTER-SPEC; every edit of the sky remembers:
  the uniforms are raw sRGB, linear interpolation, the three rejected approaches to
  the stars must not be repeated (the canon).
