#!/usr/bin/env node
// LEADERBOARD STARTER BOTS (the owner's word 2026-08-10: «fill the
// leaderboard with 15 players as an example, let them be starter bots»).
//
// ⚠️⚠️ THE BOTS ARE CREATED THROUGH THE PUBLIC API, NOT BY WRITING TO THE DATABASE. The reason is not
// the absence of access (there really is none), but that this way is more honest:
// the row appears exactly by the path a live player creates it (TOFU —
// the first submission carries the key). So the bots cannot «know how» to do what a
// player cannot do, and no special branch in the server is created for them.
//
// ⚠️ IDs WITH THE `bot-` PREFIX — SO THAT THEY CAN BE FOUND AND REMOVED. The player
// does not see the id anywhere (on screen there are only the name, the avatar and the score), while we need it as
// the only marker: «this is a seed, not a human».
//
// ⚠️ THE SCORE LADDER STARTS LOW DELIBERATELY. A level gives ~600-800 points in
// the denomination of the wallet, therefore THE VERY FIRST victory must lift a newcomer above
// a couple of bots. A seed of strong players would read as «I can never get in here».
// ⚠️⚠️ A SHORTCOMING OF THE FIRST RUN, I RECORD IT HONESTLY: the script DID NOT SAVE
// the `k` keys of the bots it created. The consequence — their rows can no longer be
// updated or deleted BY THE PROTOCOL (`/v1/del` requires a signature with the same key);
// what remains is `/admin/hide` or a direct edit of the database. Below the keys are written to a file
// alongside; the ids of the first batch are saved in `lb-seed-bots.ids.txt`.
const fs = require('fs');
const crypto = require('crypto');

const BASE = process.argv[2] || 'https://lb.blendo.monster';
const names = ['Otter','Falcon','Lynx','Heron','Marten','Puffin','Ibex','Quokka',
               'Serval','Narwhal','Kestrel','Wombat','Caracal','Stoat','Osprey'];
const avatars = [4, 11, 19, 27, 33, 7, 41, 15, 22, 36, 48, 2, 29, 44, 9];
const scores  = [240, 480, 760, 1120, 1560, 2080, 2700, 3450, 4300,
                 5300, 6500, 7900, 9600, 11800, 14500];

const hex = (n) => crypto.randomBytes(n).toString('hex');
const sign = (kHex, msg) =>
  crypto.createHmac('sha256', Buffer.from(kHex, 'hex')).update(msg, 'utf8').digest('hex');

(async () => {
  const results = [];
  for (let i = 0; i < names.length; i++) {
    const id = 'bot-' + hex(6), k = hex(32);
    const s = scores[i], q = 1, t = Math.floor(Date.now() / 1000);
    const payload = { id, k, n: names[i], a: avatars[i], s, q, t,
                      sig: sign(k, id + '.' + s + '.' + q + '.' + t) };
    let reply = null, code = 0;
    try {
      const r = await fetch(BASE + '/v1/score',
        { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(payload) });
      code = r.status; reply = await r.json().catch(() => null);
    } catch (e) { reply = { err: String(e && e.message || e) }; }
    // ⚠️ «The body parsed» ≠ success: we have soft degradation, and the refusal lives
    // in the `err` FIELD, not in the response code. We read exactly that one.
    const ok = !!(reply && reply.ok && !reply.err);
    results.push({ name: names[i], score: s, id, k, code, ok, err: reply && reply.err });
    console.log((ok ? '  ✅' : '  ⛔') + ' ' + names[i].padEnd(9) + String(s).padStart(6) +
                '  ' + id + (ok ? '' : '  ' + code + ' ' + JSON.stringify(reply)));
    await new Promise(r => setTimeout(r, 120));   // we do not hammer the worker in one volley
  }
  // KEYS TO DISK RIGHT AWAY — without them the batch becomes undeletable (see the header).
  fs.writeFileSync(__dirname + '/lb-seed-bots.keys.json', JSON.stringify(results, null, 1));
  console.log('\nkeys written: tools/lb-seed-bots.keys.json (do NOT commit)');
  const good = results.filter(x => x.ok).length;
  console.log('\nCREATED: ' + good + ' of ' + results.length);
  if (good !== results.length) process.exitCode = 1;
})();
