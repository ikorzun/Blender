# «Mixer» story — the villain blender's bible (v1, 2026-07-22)

Direction NARRATIVE, track [story]. The owner's task (2026-07-22):
«reveal the details of the blender that wants to destroy all objects on earth,
gradually. Probably in the form of comics. Simple, clear and casual,
not knocking the game's pace off too much».

## 0. Invariants

- **Wordless.** Not a single line: pictograms, thought bubbles, emotions.
  The roadmap invariant «zero story text» is fully observed, localization
  is not needed at all.
- **Zero gameplay edits.** The story is a layer on top: the character's existing
  behavior (EYES-CHARACTER-SPEC) does not change, it is RE-READ through the lore.
- **The pace is untouchable:** vignettes only between levels, skip with a single
  tap, auto-dismiss ≤4 s, never — before the session's first tap (the <20 s trump card).

## 1. Story core: «The Great Recipe» + the deceived villain

**Who he is.** The blender is obsessed with the Great Recipe — a smoothie of EVERYTHING THAT EXISTS.
Fruit, vegetables, animals, cars — by his book everything in the world is an ingredient.
The plan is simple: grind the world up section by section, section after section (the owner's
gradualness = the recipe's chapters = model packs = the museum's future halls).

**Dramatic irony (the main move).** The blender is certain that the PLAYER is his
best helper. A match before his eyes looks like destruction: objects
burst into dust, juice and sparks (our own effects!). He is delighted by your
combos — «how fast you grind them up!». He does not know that things
teleport into the museum. From the first minutes the player knows more than the villain —
classic casual irony (Tom the cat, Gru, Wile E. Coyote), understandable
without a single word.

This move is FREE: all the implemented eye emotions already play it out (§2),
the final sweep («what was not saved») is his rightful prey, the grinding is
his impatience, fire and the red sky are his rage.

## 2. Existing eye states in the lore (NO code edits)

| State (the canon, §3 EYES-SPEC) | Reading in the lore |
|---|---|
| calm, wandering gaze | checking against the Recipe, choosing the next ingredient |
| rolled back (boredom) | «the helper is slacking» — irritation half-and-half with boredom |
| sly (≤3 s before the grinding) | anticipating: he is about to grind it himself |
| angry + bowl scan (grinding) | HUNTING — looking for something to devour |
| fire + red sky | the rage of hunger: «too slow! I want EVERYTHING!» |
| pupil growth → turbo rolling → eyes-5 | the ecstasy of destruction: the helper outdid himself |
| sadness on a miss (eyelids) | disappointed by the helper's clumsiness |
| kind on a win | bliss: the bowl is empty = «everything is ground up» (he thinks) |
| wide open on a treasure | «A GOLDFISH! A delicacy!» — and it is taken away from under his nose |
| a wink on a tap | «you and I are a team, helper» (irony at its peak) |

## 3. Format: wordless comic vignettes

- **A vignette = 1 panel** (the prologue and the twist — up to 2–3). Composition: the blender
  (his eyes = a ready-made expressive language) + a thought bubble with
  pictograms + at most one arrow/check mark. Reads in 1–2 seconds.
- **Style:** flat SVG silhouettes in the language of the existing character (whites/
  pupils as in the game); objects — recognizable silhouettes of the packs' models.
  The first implementation — a DOM/SVG overlay (kilobytes, stylistically matching
  #face). Drawn/AI panels — an option of the visuals stage (GRAPHICS), if
  the owner wants it richer.
- **Weight:** ≤3 KB per panel, the budget of the whole v1 story ≤30 KB (does not touch
  the ~1 MB trump card).
- **Display:** an overlay on the win screen BEFORE the rewards (panel → tap →
  stars/the «Next» button as usual) or as a separate insert between
  levels — to be decided with INTERFACE at implementation time. Skip by tap at any
  moment; cadence ≤1 vignette per 2 levels; milestones outrank the queue.

## 4. v1 chapter arc (the first ~20 levels)

| # | Code name | Trigger milestone | Panels | What it reveals |
|---|---|---|---|---|
| C0 | «Recipe» | AFTER the first win | 2 | The recipe book: pictograms fruit→animals→cars→…→EARTH; a dream bubble: a glass with the WHOLE world inside. The setup: he wants to grind everything, in order |
| C1 | «Helper» | 2nd–3rd win | 1 | He looks at the player with adoration: a bubble «tap → dust → applause». The setup of the irony |
| C2 | «Where to?..» | the first closed museum exhibit | 1 | A bubble: the object disappears →«?». The first doubt (the twist's setup) |
| C3 | «Section two» | a change of the dominant pack / a new hall | 1 | The recipe checklist: garden ✓ → ANIMALS. Sly eyes: the plan is on track |
| C4 | «A museum?!» | the first FULL museum set | 2–3 | He SEES the shelf with the «ground up» ones — whole and content. Shock (wide open) → FURY (angry + fire). Onward, narratively, «his countermeasures» = difficulty escalation, Hard challenges, the future v1.2 mutators |
| C5+ | «Countermeasures» | per halls/milestones after the twist | 1 | His «schemes»: a turbo motor, fog and so on — every future mutator gets an introduction panel for free |

Until C4 the running gag «the deceived villain» is at work; the twist is late — the first
sessions live on the irony, not on the conflict. If the owner prefers
NOT to reveal it (eternal irony) — C4/C5 are replaced by a cycle of gags
(see §9, question 2).

## 5. Micro-beats (reactive, without panels — candidates)

- The player's defeat: on the defeat screen the blender contentedly licks
  its blades (one pose). Cheap, sells the villainy.
- The «perfect level» (everything saved, zero grindings): bewildered, he peers
  into the empty bowl — «and where is my smoothie?».
- The black bomb ball: a CANDIDATE for the lore — «a little gift from the blender»: what is blown up
  by the bomb counts as DESTROYED (not saved, does not go to the museum — consistent
  with the «no points» mechanic). A temptation from the villain: fast, but at the cost of
  the collection. A question for the owner (§9.4).

## 6. Pace rules (hard)

1. Never show before the session's first tap.
2. A panel ≤4 s on its own, a tap = an instant skip, a skip is not punished.
3. ≤1 vignette per 2 levels; if a milestone and the queue coincide — the milestone, the rest
   burns off (do not accumulate a debt of displays).
4. The comic adds no screens to the «win → Next» loop: it is nested
   into the existing win screen, an interstitial does not stack with it.

## 7. Data and the save

A bitmask of shown chapters `st` in the save (v2, a field next to the museum ones):
monotonic, OR merge — a chapter is not shown twice, losing the save =
a repeat from C0 (harmless). The reactive beats (§5) — without a save, pure
functions of state.

## 8. Production and zones

| Piece | Zone |
|---|---|
| Panel script, trigger milestones, lore | NARRATIVE (this chat) |
| Panel SVG assets (silhouettes, bubbles) | NARRATIVE draft → GRAPHICS polish |
| The display overlay in shell.html + skip | INTERFACE (a cross-zone request at implementation time) |
| The st bitmask in 77-save | NARRATIVE |
| Sprites of blender poses beyond the eyes (licking the blades and the like) | GRAPHICS, at the visuals stage |

Estimate (buffer ×2): script + storyboard of all the C0–C4 panels — 1 session;
an SVG prototype of C0–C1 in the build — 1 session; the full set of panels + milestones +
the save bitmask — 2 sessions. Implementation — AFTER the v1 metrics, together with the museum
(the comic and the museum share the milestones).

## 9. Open questions for the owner

1. **The «Great Recipe» motivation** (a smoothie of everything that exists, the world = ingredients)
   — do we approve it? An alternative: the revenge of a discarded appliance (more dramatic,
   but requires more panels for the explanation).
2. **The twist «he finds out about the museum» (C4)** — do it? Options: (a) a late
   twist as in the table — I recommend it; (b) he never finds out — eternal irony.
3. **Panel style:** flat SVG in the language of the eyes (cheap, consistent,
   I recommend it for v1) or drawn panels (richer, weight + the visuals stage)?
4. **The bomb = «a gift from the blender»** and its victims do not go to the museum — accept?
   (Does not change the mechanic: the bomb is already without points; this is purely a rule for crediting
   the collection + one introduction panel.)
5. Vignette display: inside the win screen (I recommend it) or as a separate
   insert before it?
