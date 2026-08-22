# BLENDO — brief for drawing the comic with a neural net (v1, 2026-07-31)

The owner's request: «write the story out so it can be handed to a neural net for a comic».
Replacing my flat SVG drafts (86-story.js) with drawn panels is an
option explicitly provided for by docs/STORY-SPEC.md §3 («NARRATIVE draft →
GRAPHICS polish», drawn/AI panels at the owner's wish).

⚠️ There are EXACTLY EIGHT panels, they already live in the game and are tied to triggers. The new
art replaces them one-for-one; changing the set = changing the code. Aspect ratio
**3:2** (in the game viewBox 360×230, shown up to 460px wide).

---

## 1. The story in two paragraphs

The Blender is obsessed with the **Great Recipe** — a smoothie of everything that exists. Fruit, animals,
cars, and at the end of the list — the Earth. To him the world is ingredients, and he works through
the sections, section by section.

The main device is **dramatic irony**. He is certain that the player is his best
helper: merging objects in front of his eyes looks like destruction (things
burst into dust, juice and sparks fly), he is delighted by the combos and DOES NOT KNOW that
the objects teleport into the player's museum. The player knows more than the villain from the very first
minute. Midway through the journey the blender begins to suspect something, and then sees
the museum shelf — intact, contented things he «ground up» — and flies into a rage.
From this point on the whole difficulty escalation reads as his countermeasures.

---

## 2. The comic's canon — what to demand from the neural net

1. **WORDLESS.** No letters, no lines, no onomatopoeia. This is an invariant:
   the game is not localized, and a panel must read in any country. The meaning is carried by
   the eyes, the thought bubble and pictograms.
2. **One panel = one beat.** Do not pack two events into a frame. If you want
   «both this and that» — then two panels are needed, and their number is fixed.
3. **A panel reads in 1–2 seconds.** Check: squint — does the
   meaning read from the silhouettes? If not, the panel is overloaded.
4. **Shot size changes across the arc.** A wide shot (hero + object) for the setup,
   a medium one for the action, a CLOSE-UP on the eyes — for the emotional hit. Shock and
   rage must be close-ups, otherwise the twist will not work.
5. **The 180° rule.** In every panel the hero looks in THE SAME direction (for us —
   left to right, at the object of his attention). If he «jumps» to the other
   side of the frame, the reader will decide it is a different character.
6. **Empty space is a pause.** The background is simple, without details; there is air around the key
   object. A mobile screen does not forgive noise.
7. **The silhouette decides.** The character must be recognizable as a black silhouette: a jar +
   two round eyes. No arms, legs, mouth or eyebrows — they do not exist in the game.
8. ⚠️ **THE MAIN PROBLEM OF AI COMICS IS THE HERO'S INCONSISTENCY.** The only cure is
   that the «character lock» block (below) is inserted into EVERY prompt verbatim,
   without rewording, and the first successful panel is used as a reference
   for the rest.

---

## 3. Style block (insert into every prompt, English)

```
STYLE: casual mobile 3D game render, soft matcap-like shading, no textures,
chunky rounded low-poly shapes, thick clean silhouettes, flat bright lighting,
no photorealism, no gritty detail. Wide 3:2 panel, simple uncluttered
background, generous negative space, subject centered-left.
PALETTE: sky gradient periwinkle #6e86ff to pale turquoise #ccfff8 (day) or
deep blue #031d83 to magenta #ff2fdc (night); ink #1d1c26; pure white; lime
accent #c0ff47; candy-saturated object colors (high saturation, medium
lightness).
MOOD: bright, playful, friendly-villain comedy. Silent comic panel, absolutely
no text, no letters, no numbers, no speech bubbles with words.
```

## 4. Character lock (verbatim into every prompt)

```
CHARACTER: "the Blender" — a chunky transparent glass blender jar, slightly
tapered, thin light outline, empty inside. It has NO face, NO mouth, NO
eyebrows, NO arms or legs. Its entire expression comes from TWO LARGE WHITE
CIRCULAR EYES with big black round pupils, floating over the front of the jar
like googly eyes. The eyes are the character. Same jar proportions and same
eye size in every panel.
```

Eye moods (change ONLY the pupils and the eyelids, the shape of the whites is constant):
| Panel | Mood | How to draw it |
|---|---|---|
| P1 | calm, businesslike | pupils centered, slightly down — checking against the list |
| P2 | dreamy | pupils raised upward |
| P3 | adoration | pupils opened wide across the whole white |
| K2 | doubt | pupils shifted to the side, the jar tilted slightly |
| K3 | sly | pupils down-and-to-the-side, upper eyelids half closed |
| K4a | neutral, has not understood yet | pupils centered |
| K4b | shock | whites enlarged, pupils tiny |
| K4c | rage | «eyebrows» cut the top-inner corners of the whites with a wedge |

---

## 5. Storyboard — 8 prompts

### PROLOGUE (shown ONCE before the first game)

**P1 — «The Recipe».** Setup: he is going to grind up everything in the world.
```
[STYLE] [CHARACTER LOCK]
The Blender stands at the left, calm businesslike eyes, looking right at a
large open recipe book floating beside it. The book's left page shows a
vertical checklist of icons: an apple with a bright lime checkmark next to it,
below it an animal head, below it a small car. The right page shows three
small dots and, under them, a big planet Earth globe drawn as a simple line
sphere. The order reads top to bottom, ending on the planet.
```

**P2 — «The Dream».** The scale of the plan: a smoothie made of the planet.
```
[STYLE] [CHARACTER LOCK]
The Blender at the lower left, eyes rolled upward, dreaming. A large rounded
thought bubble occupies the right two thirds of the panel, connected to the
jar by two small circles. Inside the bubble: a blender jar exactly like the
character's, and inside that jar sits planet Earth. Nothing else in the bubble.
```

**P3 — «The Helper».** The irony is established: he thinks the player is helping him.
```
[STYLE] [CHARACTER LOCK]
The Blender at the lower left, eyes wide with adoration (pupils huge), two
small lime hearts floating above it. A thought bubble at the upper right
shows a simple sequence: a finger-tap ripple icon, an arrow pointing right,
and a puff of scattered dust particles. The bubble reads left to right.
```

### MILESTONES (arrive during play)

**K2 — «Where to?..».** The first doubt. Arrives when the player first accumulates
the first type up to an accumulation tier.
```
[STYLE] [CHARACTER LOCK]
The Blender at the lower left, eyes shifted to the side in suspicion, jar
tilted very slightly. A thought bubble at the upper right shows an apple on
the left, a faded arrow in the middle, and a large white question mark on the
right where the apple should have arrived. The question mark is a drawn
symbol, not a typographic character.
```

**K3 — «Section two».** The plan is going to plan — he is still sure he is winning.
```
[STYLE] [CHARACTER LOCK]
The Blender at the lower left, sly narrowed eyes (upper lids half closed,
pupils down-left). To the right, a tall recipe page: at the top an apple with
a bright lime checkmark, a downward arrow below it, and at the bottom an
animal head circled with a thin white ring as the next target.
```

**K4a — «The Shelf».** The twist, panel 1: he sees what he did not expect.
```
[STYLE] [CHARACTER LOCK]
Wide establishing shot. The Blender small at the lower left, neutral eyes,
looking right. Across the panel a long simple shelf. Standing on the shelf,
intact and pristine: an apple, an animal, a small car — the very things he
believes he destroyed. Small lime sparkles float above them. Everything is
calm and tidy, like a museum display.
```

**K4b — «Shock».** The twist, panel 2: CLOSE-UP.
```
[STYLE] [CHARACTER LOCK]
Close-up. The Blender fills the center of the panel, much larger than in
previous panels. Its eyes are enormous with tiny shrunken pupils — pure shock.
Behind it, blurred and small, the same shelf with the intact apple, animal and
car. All attention is on the eyes.
```

**K4c — «Rage».** The twist, panel 3: he has understood everything.
```
[STYLE] [CHARACTER LOCK]
Close-up. The Blender centered, eyes narrowed into an angry wedge shape —
angled dark brows cutting the top inner corners of the white eyes. Five
stylized flames surround the jar, rising from the sides and one above:
orange-red #ff5a3c outer flame with a lighter #ffc247 inner core. No smoke,
no debris, clean shapes.
```

---

## 6. Negative prompt

```
NEGATIVE: text, letters, words, numbers, captions, speech bubbles with
writing, watermark, signature, photorealism, gritty realism, horror, human
characters, hands, faces, mouth on the jar, eyebrows as hair, cluttered
background, busy patterns, motion blur, heavy shadows, dark moody lighting.
```

## 7. Practice: how to get a consistent hero

1. First generate **P1** and iterate until the hero looks right.
2. Hand the successful panel in as an **image reference / style reference** to all
   the other seven prompts — without this the jar and the eyes will «drift».
3. Check the series TOGETHER, not one at a time: lay the eight panels side by side and
   look for where the hero changed proportions.
4. Panels K4a → K4b → K4c must read as ONE scene: the same shelf,
   the same camera angle, only the shot size and the emotion change.
5. Hand the finished PNGs to GRAPHICS — swapping the SVGs for images in 86-story.js
   is trivial (a panel is a function that returns markup).
