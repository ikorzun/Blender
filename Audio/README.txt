BLENDO - ALL THE SOUNDS OF THE GAME
============================================================

Everything the game can play lives in this folder. To change a sound: put your file
in place of the one below, KEEPING THE NAME, then run these two commands in the
project folder:

    python3 tools/sfx-pack.py     <- reads this folder into the game
    python3 build.py              <- rebuilds index.html (and copies the music)

THE NAME IS THE ADDRESS. The game finds a sound by the file name, so a renamed file
is a sound the game cannot find - it does not break, it just goes quiet and falls
back to the old synthesised voice. The extension is free: mp3, m4a, ogg and wav all
work. Latin letters only, please - the project carries no Cyrillic anywhere.

mp3 / m4a / ogg / wav up to 96 KB ship exactly as you saved them. Anything bigger,
or any other format, is converted to mono 128k mp3 automatically. Mono on purpose:
the game pans every sound, and panning a stereo file buys nothing and costs double.


1 - INTERFACE
------------------------------------------------------------
  button-tap.*                 any button in the interface
                               button-tap.mp3, 12.7 KB, ships as you saved it
  wrong-tap.*                  a tap that hit nothing / a pairless item
                               wrong-tap.mp3, 11.9 KB, ships as you saved it
  notification.*               the message strip (rewards and refusals)
                               notification.mp3, 13.1 KB, ships as you saved it

2 - MUSIC
------------------------------------------------------------
  background-music.mp3        the track that plays in the game
                              MUST be an .mp3 and MUST keep this name -
                              build.py copies exactly this file to music.mp3.
  original-master-267kbps.mp3 the high-quality master, kept for re-encoding.
                              NOT shipped. Anything else here is ignored too.

3 - OBJECT SOUNDS
------------------------------------------------------------
  pack-cars.*                  every car
                               pack-cars.mp3, 15.5 KB, ships as you saved it
  pack-bricks.*                every brick
                               pack-bricks.mp3, 3.3 KB, ships as you saved it
  pack-animals-1.*             every animal, take 1 of 2 (picked at random)
                               pack-animals-1.mp3, 9.8 KB, ships as you saved it
  pack-animals-2.*             every animal, take 2 of 2
                               pack-animals-2.mp3, 11.9 KB, ships as you saved it
  material-juicy.*             fruit and vegetables
                               material-juicy.mp3, 6.6 KB, ships as you saved it
  material-metal.*             metal that is not a car
                               material-metal.mp3, 12.3 KB, ships as you saved it
  material-plastic.*           plastic that is not a brick
                               material-plastic.mp3, 7.8 KB, ships as you saved it
  material-paper.*             paper and cardboard
                               material-paper.mp3, 11.9 KB, ships as you saved it
  material-glass.*             glass
                               material-glass.wav, 48.4 KB, ships as you saved it
  material-plush.*             soft / plush things
                               material-plush.wav, 68.8 KB, ships as you saved it
  material-wood.*              wood
                               same file as pack-cars today - replace it to give this its own voice
  material-dough.*             dough and bread
                               same file as material-plastic today - replace it to give this its own voice
  material-meat.*              meat
                               same file as pack-animals-1 today - replace it to give this its own voice
  material-cream.*             cream and ice cream
                               same file as pack-animals-2 today - replace it to give this its own voice

4 - GAMEPLAY SOUNDS
------------------------------------------------------------
  new-object-screen.*          the new-object reveal screen
                               new-object-screen.mp3, 31.9 KB, ships as you saved it
  object-level-up.*            an object reached the next multiplier
                               object-level-up.mp3, 17.6 KB, ships as you saved it
  blender-fill.*               the pour at the start of a level
                               blender-fill.mp3, 31.9 KB, ships as you saved it
  blender-grind-1.*            the blender grinding, take 1 of 4 (random)
                               blender-grind-1.m4a, 8.5 KB, ships as you saved it
  blender-grind-2.*            the blender grinding, take 2 of 4
                               blender-grind-2.m4a, 8.6 KB, ships as you saved it
  blender-grind-3.*            the blender grinding, take 3 of 4
                               blender-grind-3.m4a, 8.8 KB, ships as you saved it
  blender-grind-4.*            the blender grinding, take 4 of 4
                               blender-grind-4.mp3, 5.8 KB, ships as you saved it
  eyes-poke-1.*                poking the eyes, take 1 of 2 (random)
                               eyes-poke-1.mp3, 14.7 KB, ships as you saved it
  eyes-poke-2.*                poking the eyes, take 2 of 2
                               eyes-poke-2.mp3, 15.1 KB, ships as you saved it
  level-win.*                  the victory screen
                               NO FILE YET - the game synthesises this; drop a file in and it takes over
  level-lose.*                 the defeat screen
                               NO FILE YET - the game synthesises this; drop a file in and it takes over
  treasure-found.*             the golden fish is dug out
                               NO FILE YET - the game synthesises this; drop a file in and it takes over
  bowl-shake.*                 shaking the bowl
                               NO FILE YET - the game synthesises this; drop a file in and it takes over
  combo-start.*                a series starts
                               NO FILE YET - the game synthesises this; drop a file in and it takes over
  turbo-chain.*                turbo / the chain reaction
                               NO FILE YET - the game synthesises this; drop a file in and it takes over
  shards-crunch.*              a hard thing splitting into shards
                               NO FILE YET - the game synthesises this; drop a file in and it takes over
  timer-tick.*                 the tick at the edge of the series window
                               NO FILE YET - the game synthesises this; drop a file in and it takes over
  merge-generic.*              a mixed harvest with no single material
                               NO FILE YET - the game synthesises this; drop a file in and it takes over


IF YOU ADD A SOUND THAT IS NOT LISTED
------------------------------------------------------------
A file the game does not know about is reported by tools/sfx-pack.py as
"IN THE FOLDER BUT NOT IN THE GAME" - that is almost always a misspelt name.
A genuinely new kind of sound needs one line in tools/sfx-pack.py as well.

(this file is generated by tools/sfx-pack.py - do not edit it by hand)
