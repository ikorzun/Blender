# Sound and music of the "Mixer": what exists, what is silent, what to do

Compiled 2026-07-29 by a run of the audio path over the code (not by ear — every
"there is"/"there is not" was verified against the calls, each item has a
file:line reference in the sources). Split into four blocks, as you asked.

## 0. How it is built now

- **Effects are procedural**, synthesized by WebAudio on the fly (`src/app/75-audio.js`),
  plus a few base64 samples (`74-sfx-data.js`, m4a format — Safari cannot do
  ogg). They take up almost no weight.
- **Music is one external file** `music.mp3` (4.4 MB), pulled lazily after the
  first touch (the iOS autoplay policy), volume in the settings.
- Total sounds in the path: 12. Of them `surprise` serves **four** different
  meanings, `match` — the tap on the eyes as well.

---

## 1. Interface

Right now all the buttons sound with **a single click** through a common
interceptor — that is good, no need to hook them up separately. The problems are
elsewhere.

| Event | Now | Proposal | Priority |
|---|---|---|---|
| **Any refusal**: no shakes, no hints, too few stars, the purchase did not go through, the ad is unavailable (8 places) | **silent** — the click sounds the same both when it worked and when it did not | `deny`: two short notes down 220→165 Hz, ~0.14 s, quiet. Hooked up with **one line inside toast()** — covers all 8 places at once. ⚠️ Do not reuse the miss sound: that one already means "lost points" | **important** |
| **The hint fired** | silent (only the common click) | `hint`: two notes up 1175→1568 Hz, ~0.24 s, starting +40 ms so that it does not smear together with the click. The only paid mechanic without its own sound | **important** |
| **Tap on the empty field of the Play card** | **silent** — the interceptor catches only buttons, while the whole card is clickable (that is its main area) | widen the selector to `button, .ms-play, .msc` — a single edit | **important** |
| **Turning the sound on with the slider** | silent until the next tap — the toggle looks broken | one line: play the click when turning on, it is itself the proof | **important** |
| **Closing a screen** (Resume, the crosses, Museum) | sounds **the same as opening** | the same sound lower and quieter (680 Hz instead of 900) — pulls in no new bytes | desirable |
| **Purchase** of a bundle and of Boost | the treasure sound `surprise` | its own "coin" chime ~0.25 s. Right now the treasure, the bundle purchase, the boost purchase and the multiplier growth are **one and the same sound**, this devalues the find | desirable |
| **Tap on the mixer's eyes** | ✅ CLOSED in v186: the tap became a PROVOCATION of the grinding (the owner's spec 2026-07-30), the lying 'match' is removed — the grinding itself sounds | — | ~~important~~ |

---

## 2. Gameplay

| Event | Now | Proposal | Priority |
|---|---|---|---|
| **Countdown to the grinding, the last 3 s** | silent | a ticking countdown, rising in volume. The player must hear that time is running out **without looking at the timer** | **important** |
| **Start of the blades** (the mixer got going) | silent — only the grinding itself is audible | a short spin-up "whine" on the transition | **important** |
| **Final clean-up** | sounds **like a punishment** | separate it: the clean-up is already a victory, not a penalty. Otherwise the finale feels like a punishment | **important** |
| **Bomb explosion** | takes the shake sound | its own low hit with body — the most spectacular event of the game currently sounds secondary | **important** |
| **Rising hum of the threat** | silent | a continuous bed in sync with the reddening sky (the driver is already computed, see §4) | desirable |
| **End of turbo** | silent | a fall-off — the player does not understand that the mode has ended | desirable |
| **Deadlock and the bail-out kicking in** | silent | a separate signal: right now it is unclear why the mixer suddenly started working by itself | desirable |
| **Combo steps 2..5** | silent (only the ignition sounds) | a rise in pitch per step — the radius growth is not audible | desirable |
| **Tap on a rock** | the ordinary miss sound | a "knock on stone" — a rock is not a miss but a special object with a double penalty | desirable |
| **Tap on an occluded item** | the miss sound | a dull "thud" — different reasons for a refusal sound the same | desirable |
| **The surprise became reachable** | silent | a quiet echo of "something glinted" | later |

---

## 3. Objects: a table by type and by matching

Right now **all types sound the same when matched** — the `match` arpeggio, where
only the number of notes changes with the group size. Visually the packs already
differ (juice for food, sparks for cars, little stars for animals, shards for
bricks and pirate ones) — the sound did not follow the visuals.

| Pack | What is in it | Effect on matching (visual) | Sound now | Proposal |
|---|---|---|---|---|
| **food** — fruit, vegetables | 41 types | juice, large drops | the common `match` | **a juicy "splat"**: noise up to 800 Hz + a tone with a glissando down 300→160 Hz, ~90 ms. Low and soft |
| **animal** — animals | 24 types | little stars in a fan | the common `match` | **a cartoon "pop"**: a bend up 420→900 Hz, ~90 ms, without a tail |
| **car** — cars | 12 types | sparks + little part cubes | the common `match` | **a dry metallic "clack"**: two beeps at 1300 and 1900 Hz + a top tick, ~80 ms. Without a noise body — otherwise it will be confused with the bricks |
| **brick** — bricks | 7 types | shards | the common `match` | **`crunch` already exists** (the crackle) — simply start using it, with strength from the group size |
| **pirate** — the pirate set | 8 types | shards | the common `match` | the same `crunch`, but lower — wood against stone |
| **steak** | 1 type | dust | the common `match` | leave the common one — a loner, its own sound does not pay off |
| **rock** (does not match) | special | shards only from the bomb | the miss sound | a "knock on stone" (see §2) |
| **bomb** | special | the explosion + the victims' effects | the shake sound | its own hit (see §2) |
| **goldfish** | surprise | its own radiance | `surprise` | leave it — this is its own sound, but remove it from the purchases |

**Two mechanical remarks, without which the table will not work:**

1. **The pack sound is one per match, not per item.** Right now the effects are
   called in a loop over the items; if the sound is done the same way, a group of
   eight will give eight overlaid "splats" — mush and clipping. The pack sound
   plays once, with strength from the group size.
2. **The arpeggio must tell groups of 4 to 8 apart.** Right now it saturates at
   four — the group cap (8) was introduced, but there is no audible difference
   between "four" and "eight". The base tone must grow with the size.

---

## 4. Music — answers to your questions

### How many tracks and of what length

Right now there is one track. For a casual game of this type the practice is
**2-3 loops of 1.5-2 minutes**: the menu and the game must not sound the same,
otherwise over an hour of play the track becomes stale to the point of
irritation. This is industry practice, not a measurement — it will have to be
checked on players.

### Should the music change when the blender gets angry

**Yes, and everything has already been computed for that** — there is no need to
set up new states. The game has a ready threat driver: a value that grows from
zero to one as the grinding approaches and holds at one while the blades spin
(the sky already reddens from it). It is enough to hang **a filter and volume**
on it: the closer the grinding, the more muffled and anxious the music. This is
cheaper than a track change and does not require a single new file.

Turbo is the same thing, but in the other direction: a short lift.

⚠️ A track change on the anger I **do not recommend**: it gives a pause on the
switch and a second file to download.

### Weight and how to upload

⚠️ **Right now we are overpaying roughly fourfold.** The track sits at 267 kbit/s
stereo — that is quality for listening to music, not for a background loop under
sound effects. A re-export to AAC (.m4a) at 96-112 kbit/s will give **1.5-1.8 MB
instead of 4.4** with no difference audible in the background. The format is
already proven in the project — all the effects are in it.

Since you are replacing the music anyway because of the licence — **do it right
away in m4a at 96-112 kbit/s**, then it will not have to be redone.

### Music defects found

These are not wishes, these are breakages:

1. ⚠️ **The music does not duck during an ad spot** and when the platform demands
   silence. The effects duck, the music plays over the ad. For the portal that is
   a complaint, for the player it is mush.
2. ⚠️ **On iPhone the music does not come back after a phone call or after
   minimising** until the end of the session. Cured with one line: try to resume
   on every touch.
3. ⚠️ **The loop seam**: every 2 minutes 11 seconds there is a hole in the music
   of almost a second and a hard restart. Cured on the re-export — trim the
   trailing silence.
4. ⚠️ **Switching away to another tab**: the game goes on pause, the music keeps
   playing.
5. ⚠️ **The victory and defeat jingles** play over the music at full volume — the
   music has to be ducked for that time.

---

## 5. Order of work

**First what fixes the lie and the silence** (hours of work, zero new files): the
refusals get their own sound, the tap on the eyes stops lying "matched", the main
button stops being silent, the music ducks on the ad and comes back after a phone
call.

**Then the character** (days): the countdown to the grinding, the start of the
blades, its own explosion sound, the separated clean-up — this is what makes the
game "alive" to the ear.

**Then the packs** (days): five matching sounds per the table in §3. Not much
work, but the most noticeable effect — the items stop being interchangeable to
the ear.

**Music** — when you replace the track: right away in m4a at 96-112 kbit/s, with
an even loop, and hang a filter on the threat.

⚠️ **There is not a single sound test in the suite right now** — the 234 checks do
not touch audio at all. When we do the packs, it is worth adding at least "on a
match the sound of the right pack was called", otherwise the next edit will break
it silently.
