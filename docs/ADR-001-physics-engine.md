# ADR-001: Physics foundation for the move from prototype to game development

Status: ACCEPTED by the owner and IMPLEMENTED (three.js + Rapier)
Date: 2026-07-17; migration carried out the same day

## Results (after the migration)

- Spike: 185 bodies, world step ~0.7-1.1 ms (6% of the 60 FPS frame budget);
  in calm, world.step() is not called at all (global sleep) -> 0 ms.
- The rapier3d-compat bundle (wasm inlined): 2.24 MB; resulting index.html 2.92 MB.
- Item poses are honest (cubes on their faces, cylinders on their sides, cones
  toppled over), no visible interpenetration, stillness at rest — bit-for-bit.
- Full headless run of test.js green with no edits to expectations (except PAIRS).
- PAIRS recalibrated 92 -> 70 (honest volumes pack higher than sphere clusters).
- Rapier's auto-sleep is slow because of round shapes rolling to a stop (there is
  no rolling friction) — on top of it OUR global sleep scheme works (calm judged
  by body velocities / force after 3 s; wake wakes all bodies). Per-body
  force-sleep is HARMFUL (cascading wake-ups) — do not do it.
Context: the prototype is confirmed; the owner recorded two fundamental
problems and asked to choose a technology foundation (current stack vs Godot).

## Problem 1: object physics (boundaries, weight, fall speed, complexity)

What exists now (in-house engine, src/app/50-physics.js):

| Aspect | Current state | Diagnosis |
|---|---|---|
| Boundaries | Sphere clusters (8 corners of a cube, 6 spheres for a torus...) | An approximation: there are no flat faces -> items rock on «invisible balls», gaps and sinking of up to ~5-10% of the size cannot be eliminated |
| Weight | THERE IS NO MASS AT ALL: everything pushes 50/50 | A big cube and a small pill are equals -> «weightlessness». Mass ∝ r³ can be added to the current engine in ~20 lines, but that does not cure the rest |
| Fall speed | G=22 units/s², dt clamp 0.033 | g itself looks fine by eye; the unnaturalness of the fall — because of the ABSENCE OF ROTATIONAL DYNAMICS (see below) |
| Rotation | Purely visual, damped (`ang`) | The key defect: items do not finish rotating into stable poses, do not roll, and land «as if stuck in place» |
| Polygons | The render meshes are fine; physics does not see them | The «coarseness» in the frame — that is the coarseness of the CONTACTS, not of the render |

## Problem 2: interaction (penetration, jitter, realism)

| Aspect | Current state | Diagnosis |
|---|---|---|
| Penetration | Positional correction, 1 pass/substep | In a pile of 185 bodies (stacks of 8+) the corrections conflict -> residual overlaps. A naive solver, iterations do not really cure it |
| Jitter | The eternal fight «gravity vs correction» | We HID it with global sleep (physAwake), but during the settling after a match it is visible. warm starting / contact caching are needed — the things that exist only in real engines |
| Friction | Crude damping of velocities | There is no friction model -> items «drift» down the sloped wall |
| Sleep | Global + forced by timer | A hack. Real engines sleep per body |
| «Reflect color» | — | This is RENDER, not physics: the lacquer already reflects the environment; reflections of neighbors = env-probes/SSR in three.js, a separate task, not a blocker |

Verdict: the ceiling of the in-house technology is REACHED. Honest angular
dynamics + a stable solver + convex colliders «from scratch» = months of
work with a result worse than the off-the-shelf engines.

## Foundation options

### A. three.js + Rapier (WASM) — I RECOMMEND
- Rapier (Rust->WASM, dimforge): convex hull straight from our geometries,
  compound colliders, mass from density, honest friction/restitution,
  per-body sleeping, CCD, stable stacks, a live project, official
  examples of integration with three.js.
- ~90% of the codebase is preserved: THE WHOLE render (lacquer/chrome/glass/
  environment — everything the owner approved), HUD, sound, gameplay, Playgama
  Bridge, Playwright tests, the __game API. Only 50-physics changes + the layer
  that syncs bodies with meshes.
- Weight: ~1.5-2 MB compat build (wasm inlined as base64) — laid alongside,
  like playgama-bridge.js, or inlined into index.html.
- A bonus for the «weight of the items»: densities per material (chrome cubes
  are HEAVY, plastic is light) — exactly that «work out the weight».
- Risks: +2 MB to the download; re-tuning the feel (mass/friction/bounce);
  ~3-5 sessions until parity with the current behavior.
- Alternatives in the same branch: cannon-es (pure JS, 150 KB, but the solver
  is weaker and the project is frozen — stacks of 185 bodies will jitter),
  Jolt-physics.js (top quality, the engine of Godot 4.4, but ~2.5 MB and a
  lower-level API). Rapier — the golden mean.

### B. Moving to Godot (+ Godot MCP)
- Pros: physics out of the box (Jolt in 4.4), an editor, the official
  Playgama Bridge plugin (bridge-godot), MCP for agentic development.
- Cons, critical for OUR channel (web portals, mobile web):
  - Godot 4 web export: 30-50 MB against our 0.7 MB. Time-to-first-play
    on a mobile network — tens of seconds; the portals penalize that.
  - A multithreaded export requires SharedArrayBuffer => COOP/COEP headers
    that WE DO NOT CONTROL on other people's portals; single-threaded — slow.
    iOS Safari — historically the most problematic platform of Godot web.
  - The whole written base is lost (the render with all the approved decisions,
    UI, sound, Bridge integration, autotests) and the «do not bring back»
    decisions accumulated in CLAUDE.md would have to be rediscovered.
- When Godot is justified: if the game grows into a «big» one with native
  builds for the stores. For a casual game on web portals — overkill with
  real distribution risks.

### C. Stay on the in-house physics + patches (mass r³, more iterations)
- Cheap, but the ceiling is close by: without angular dynamics you cannot get
  «like in the real world». Only suitable as a temporary measure until the migration.

## Decision (proposed)

Foundation: **three.js + Rapier**. Both fundamental problems are closed
entirely; the distribution channel (portals) keeps its main advantage —
instant loading; all the design work of the prototype moves over as is.

## Migration plan (after the owner's «yes»)

1. Spike (half a day): rapier3d-compat + 185 convex bodies from our geometries,
   an FPS measurement on desktop/mobile, a measurement of the build size.
2. 50-physics -> a Rapier wrapper: bodies, convex hulls (simplified down to
   30-60 vertices), densities by material type, gravity, sleeping events.
3. Tuning the feel: densities (chrome 4x plastic), friction 0.4-0.6,
   restitution 0.05-0.15; shake/blade vibration through applyImpulse.
4. genLevel settling by Rapier steps; sleep automatic (per body).
5. A run of the existing test.js (the __game API does not change) + adjust
   PAIRS/FLOOR_REST for the new packing.

Estimate: 3-5 working sessions until parity, then only tuning.
