# Sound inventory — every sound in the game, and every place there isn't one

⛔⛔ **THIS DOCUMENT IS A SNAPSHOT OF 2026-08-31 AND ITS THREE HEADLINE NUMBERS ARE NOW FALSE.**
It did its job: the owner read it, and on 2026-09-01 he sent two drops of recordings that closed
almost every gap it names. The state in force is in `CLAUDE.md`, batches 2026-09-01 / -b / -v.

| this document says | in force now |
|---|---|
| nine embedded samples | **sixteen** |
| five of the ten material voices have a recording | **all ten again** — his renaming took five away on -b, he asked for them back on -d |
| — | ⚠️ four of those five are ALIASES of a sample already in the bank, so wood currently sounds like a car and meat like animals; he is recording replacements |
| the NEW OBJECT reveal, every toast, the tier-up and the pour are mute | **all four now speak** |
| «33 item types merge with the synthesised arpeggio» | the arpeggio no longer plays on an ORDINARY merge at all — what reaches it is the bowl-shatter collect-all and a detonated charge, which pass no material |
| `mat_glass` «IS A RECORDING NOBODY WILL EVER HEAR» | ⚡ **it has carriers again** — `propswater` and `propswineglass`, 2026-09-01-g |

⚠️ **WHAT IS STILL TRUE AND IS WHY THE FILE IS KEPT:** the method (a four-lens sweep, each lens
handed to an adversarial verifier), the shape of the engine, the two defects in «Two defects, not
taste» — the keyboard-only player still gets no sound, because `Sound.unlock()` is still bound to
`pointerdown` alone — and the whole «Where there is no sound at all» census, most of which is
still unanswered.
⛔ Do NOT read the tables below as the current bank. Re-run the sweep before trusting a count.


The owner's order 2026-08-31: «sdelay mne tablitsu vsekh zvukov v igre, vklyuchaya ui
knopki. Khochu ponyat kakikh zvukov eshche nekhvataet i kakie zamenit» — a table of every
sound in the game, UI buttons included, so he can see what is missing and what to replace.

Method: a four-lens sweep of `src/` (interactive controls, game events, material voices,
sample provenance), each lens then handed to an adversarial verifier whose job was to REFUTE
it. Numbers below are what survived that pass, re-checked by hand at the load-bearing points.
Nothing here is inferred from memory — every row carries a `file:line`.

## The shape of the system in three facts

1. **Twelve named sounds**, all on one IIFE (`Sound`, `75-audio.js`). Nine of them are
   synthesised on the fly (oscillators + noise); only three reach for a sample.
2. **Nine embedded samples** (`74-sfx-data.js`): the interface click, three grinding
   variants, and five material voices. Plus a tenth audio asset that is NOT part of this
   engine at all — `music.mp3`, streamed by `<audio id="bgm">` (`shell.html:3905`).
3. **The whole interface runs on ONE delegated listener** (`90-input.js:775`):
   ```js
   document.addEventListener('click', e => {
     if (e.target && e.target.closest && e.target.closest('button')) Sound.play('ui');
   }, true);
   ```
   ⚠️⚠️ **THIS SINGLE LINE IS THE ANSWER TO HIS «WHAT TO REPLACE».** It means the interface has
   exactly ONE sound and no vocabulary at all: confirm, cancel, refuse, buy and close are the
   same 93 ms click. It also means the rule for whether a control speaks is not «is it a
   control» but **«is it a `<button>`»** — and several of the most-pressed controls in the
   game are not.

## The twelve sounds

| sound | how it is made | source | fires at |
|---|---|---|---|
| `match` | **sample** if the material has a voice, else a procedural arpeggio | owner's WAVs | merge `80-gameplay.js:280`; bowl collect-all `:601`; charge detonated `:677` |
| `grind` | **sample**, 3 variants picked uniformly at random, no anti-repeat | Kenney, m4a | mixer bite `80-gameplay.js:1244`; finale grind `:1265` |
| `ui` | **sample** | Kenney `click1.ogg` | every `<button>` click, `90-input.js:775` |
| `crunch(n)` | procedural, scales with `n` | — | bowl crack `:508`; ice credited `:379`; ice broken `:386`; shards `70-fx.js:547`; saw `70-fx.js:1045` |
| `miss` | procedural, two square blips | — | wrong tap `70-fx.js:1623`; ice tapped early `80-gameplay.js:355` |
| `shake` | procedural noise burst | — | shake `80-gameplay.js:1318`; bomb `:441` |
| `combo` | procedural glissando + spark | — | combo window opens `:78` |
| `chain` | procedural glissando + swoosh + fanfare | — | turbo entered `:135`; bowl shatters `:530` |
| `tick` | procedural dry «tk» | — | streak window about to expire `99-main.js:676` |
| `surprise` | procedural 4-note arpeggio | — | treasure collected `:901`; purchase OK `90-input.js:714`; boost bought `:729` |
| `win` | procedural 5-note arpeggio | — | level cleared `80-gameplay.js:814` |
| `lose` | procedural 3-note descent | — | no moves left `:835` |

## The nine samples

| key | format | source file | length | peak | trim |
|---|---|---|---|---|---|
| `ui` | m4a | `Audio/ui-audio/click1.ogg` | 0.093 s | −1.33 dB | 1.0 |
| `grind1` | m4a | Kenney pack | 1.452 s | −1.84 dB | 1.0 |
| `grind2` | m4a | Kenney pack | 1.475 s | −0.90 dB | 1.0 |
| `grind3` | m4a | Kenney pack | 1.536 s | −0.64 dB | 1.0 |
| `mat_juicy` | wav | owner | 0.086 s | −16.21 dB | 4.422 |
| `mat_plush` | wav | owner, `Fruit.wav` | 0.798 s | −0.96 dB | 0.858 |
| `mat_metal` | wav | owner, `metal.wav` | 0.498 s | −4.99 dB | 0.566 |
| `mat_plastic` | wav | owner | 0.504 s | −5.39 dB | 0.765 |
| `mat_glass` | wav | owner, `glass.wav` | 0.485 s | −21.69 dB | 4.401 |

`VOICE_TRIM` normalises the five voices to one perceived level (measured spread 0.01 dB);
it is deliberately a separate knob from the group gain `0.5 + 0.06·n`, which is about the
size of the matched group.

## The material voices — where the gap actually is

`materialOf()` (`73-material.js:152`) returns one of TEN voice names. Only FIVE have a
recording; the other five fall through to the procedural arpeggio.

| voice | recording | item types | status |
|---|---|---|---|
| `juicy` | ✅ | 26 | live |
| `plush` | ✅ | 26 | live |
| `metal` | ✅ | 25 | live |
| `plastic` | ✅ | 15 | live |
| `glass` | ✅ | **1** | ⛔ **NEVER PLAYS** |
| `wood` | ❌ | 11 | procedural |
| `dough` | ❌ | 9 | procedural |
| `meat` | ❌ | 7 | procedural |
| `paper` | ❌ | 3 | procedural |
| `cream` | ❌ | 3 | procedural |

⛔⛔ **`mat_glass` IS A RECORDING THE OWNER MADE, SHIPPED IN THE BUNDLE, AND NOBODY WILL EVER
HEAR IT.** `Audio/things/glass.wav` (49 538 B) is byte-identical to the embedded sample; it
costs 66 052 base64 characters (~64.5 KB) in `74-sfx-data.js:74`. The glass voice has exactly
one carrier and it is not in the live pool. ⚠️ `paper` is ONE delisting from the same fate —
it has one live carrier left.

**33 item types out of 87 merge with the synthesised arpeggio**, not with a recorded voice.
That is the single largest audible gap in the game.

## Where there is no sound at all — player-facing only

The sweep found 73 silent moments; the verifier killed most of them, because in this codebase
a sound very often fires one line above or below the event (the grant of a charge sits inside
the turbo block that already played `chain`; a free shake is followed immediately by
`performShake`). What survives is the list below. **`85-hud.js` contains ZERO `Sound.play`
calls** — the entire menu / win / collection / reveal layer is mute except where a `<button>`
happens to trip the delegated hook.

| what | where | note |
|---|---|---|
| **NEW OBJECT reveal** | `85-hud.js:2772` | the biggest reward screen after the win — 3D model, glow, «Save it!» — completely mute. Only the dismiss button clicks. |
| **The Play / Resume CARD** | `90-input.js:538` | the most-pressed control in the game. It is a `<section>`, so it is silent — while `#msFloatResume` (`:541`), the SAME action, is a `<button>` and does click. One action, two behaviours. |
| **Every toast** | `85-hud.js:740` | `toast()` writes text and fades opacity. This is the game's ONLY refusal channel: «Not enough coins», «No hints left», «No shakes left» — all mute. |
| Volume sliders | `90-input.js:596` | `#msSound` / `#msMusic` are `<input type=range>`; dragging the SFX volume produces no audition sound at all. |
| Collection cards | `85-hud.js:1978` | built as `div.msc`; tapping one is silent. |
| Leaderboard row | `90-input.js:587` | `<section>` with a handler — opens the table silently. |
| Story / comic panel | `86-story.js:423` | advancing the between-levels comic is silent. |
| Poking the eyes | `90-input.js:402` | silent as a control. ⚠️ In a live run it is not truly mute: the poke advances `level.nextGrind`, so the grinder answers on the next frame. |
| Win-screen rewards | `80-gameplay.js:775-785` | one `win` fanfare covers stars, the score bank, the «+1 hint» and the «+1 shake every 5 levels». Nothing differentiates them. |
| Continue after defeat | `80-gameplay.js:838` | the rewarded revival is silent. |
| Overlay backdrop close | `90-input.js:652` | dismissing stars / leaderboard by tapping outside is silent. |

## Two defects, not taste

⛔ **KEYBOARD-ONLY PLAYERS GET NO SOUND AT ALL.** `Sound.unlock()` — the only caller of
`loadSamples()` (`75-audio.js:150`) — is bound to `pointerdown` and nothing else
(`90-input.js:271`). The game is playable from the keyboard (Space = shake), and on that path
the AudioContext is never resumed and no sample is ever decoded.

⚠️ **`release/music.mp3` HAS DIVERGED** from the shipped `music.mp3`. And two comments still
describe the track as «~4.2 MB» (`shell.html:3902`, `85-hud.js:2116`) — the shipped file is
not that size.

⚠️ Stale scope comments to fix when this area is next touched: `74-sfx-data.js:3-4` still says
«FOR NOW ONLY: the interface click + 3 grinding variants» (there are nine samples), and
`99-main.js:1480-1482` says «only three samples so far» (there are five `mat_*`).

## What to ask the owner for, in order of audible payoff

1. **Five material recordings** — `wood`, `dough`, `meat`, `paper`, `cream`. 33 item types
   stop sounding synthetic. Same form as the ones he already sent: a short WAV per material,
   `Audio/things/`, name it after the VOICE and not the item (that rule has already saved 26
   types once — `74-sfx-data.js:17-22`).
2. **Give `glass` carriers or drop it.** Either mark item types as glass so his recording is
   heard, or delete the sample and save 64.5 KB.
3. **An interface vocabulary instead of one click.** At minimum three: confirm, refuse
   (wire it into `toast()`), and reward. Today all five interface intentions share one 93 ms
   sample.
4. **A reveal sting for the NEW OBJECT screen** — the one screen that is pure reward and pure
   silence.
