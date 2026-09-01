// Coverage of the material→voice map against the live pool.
//
//     node tools/material-map-check.js
//
// ⛔⛔ THIS TOOL USED TO CARRY ITS OWN COPY OF THE MAP AND CHECKED NOTHING (found by the audit of
// 2026-09-01-o, which RAN it: it printed «in pool: 105 | mapped: 120», listed all 19 props types as
// NOT MAPPED although every one of them is in MATERIAL_OF, and counted one glass carrier while the
// live pool has two). It never opened 73-material.js. The inverse failure was worse: a type present
// in its private copy but MISSING from the real table would have printed green.
// ⚠️⚠️ THREE DOCUMENTS POINT AT THIS FILE AS THE COVERAGE GUARD (73-material.js's own header,
// docs/MATERIAL-SOUND-MAP.md, WORKSTREAMS.md), which is why it was repaired rather than deleted -
// a tool that lies is worse than no tool, and the next editor was being sent here by name.
// ⚠️ BOTH SIDES ARE NOW PARSED OUT OF THE SOURCE. There is no table in this file, so there is
// nothing here that can go stale; the canon's own rule about a copy of a mapping standing next to
// the working one is what this file exists to stop violating.
// ⚠️ Real coverage is ALSO guarded live in test.js (a census over `g.materialOf` asserting
// `missing === 0`), so this tool is the fast local answer, not the last line of defence.
const fs = require('fs');
const path = require('path');

const root = path.dirname(__dirname);
const pool = fs.readFileSync(path.join(root, 'src/app/30-shapes.js'), 'utf8');
const mats = fs.readFileSync(path.join(root, 'src/app/73-material.js'), 'utf8');

// the live pool: every entry of TYPES
const all = [...pool.matchAll(/^\s*\{\s*name:\s*'([a-z0-9]+)'/gm)].map(m => m[1]);
// the live map: every `name: 'voice',` inside MATERIAL_OF
const body = mats.match(/const MATERIAL_OF\s*=\s*\{([\s\S]*?)\n\};/);
if (!all.length || !body) {
  console.error('could not parse TYPES or MATERIAL_OF — the shape of a source file changed');
  process.exit(2);
}
const map = new Map(
  [...body[1].matchAll(/^\s*([a-z0-9]+)\s*:\s*'([a-z]+)'/gm)].map(m => [m[1], m[2]]));

const missing = all.filter(n => !map.has(n));                 // in the pool, no voice
const orphan = [...map.keys()].filter(n => !all.includes(n)); // a voice for a type that is gone
const byVoice = {};
for (const n of all) { const v = map.get(n); if (v) (byVoice[v] = byVoice[v] || []).push(n); }

console.log('pool:', all.length, '| mapped:', map.size, '| carriers counted below are LIVE only');
console.log('NO VOICE:', missing.length ? missing.join(', ') : 'none');
console.log('MAPPED BUT NOT IN THE POOL:', orphan.length ? orphan.join(', ') : 'none');
console.log('---');
for (const v of Object.keys(byVoice).sort())
  console.log(v.padEnd(9), String(byVoice[v].length).padStart(3));
// ⚠️ A voice with a recording and no live carrier is the `mat_glass` disease: 64.5 KB shipped that
// literally nobody could hear, for fifteen days. The suite states this as a census; here it is a
// one-line reminder next to the counts.
const voicesWithNoCarrier = [...new Set(map.values())].filter(v => !byVoice[v]);
if (voicesWithNoCarrier.length)
  console.log('\n⚠ VOICES WITH NO LIVE CARRIER (they ship and nobody hears them):',
              voicesWithNoCarrier.join(', '));
process.exitCode = missing.length ? 1 : 0;
