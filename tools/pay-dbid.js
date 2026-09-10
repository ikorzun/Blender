// Write the D1 database id of `blendo-pay` into server/pay/wrangler.toml.
// Run: `node tools/pay-dbid.js` (after `npx wrangler d1 create blendo-pay`).
//
// ⚠️ IT EXISTS TO REMOVE A COPY-PASTE, AND THAT IS NOT TIDINESS: a mistyped uuid does not
// complain — it fails at DEPLOY time with a message about a database that does not exist, and in a
// 36-character string a 0 and an O are the same shape. This is the «compare, never retype» rule the
// Playgama token was reconciled by (2026-08-07), applied to the one id nobody can check by eye.
//
// ⚠️ IT ONLY READS from Cloudflare (`wrangler d1 info`) and only writes ONE line of the toml. It
// creates nothing: creating a resource in the owner's account is his command, not a tool's.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const TOML = path.join(__dirname, '..', 'server', 'pay', 'wrangler.toml');
const NAME = 'blendo-pay';
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function ask() {
  let out = '';
  try {
    // ⛔ NO `--config` HERE, AND IT IS MEASURED: with the config wrangler resolves the database by
    // the id ALREADY IN THE FILE — i.e. by the placeholder this tool exists to replace, and the
    // answer is «the database PLACEHOLDER-… could not be found». By NAME it is looked up honestly.
    out = execFileSync('npx', ['wrangler', 'd1', 'info', NAME, '--json'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    out = (e.stdout || '') + '\n' + (e.stderr || '');
    // ⚠️ A FAILURE IS REPORTED WITH WRANGLER'S OWN WORDS: «the database does not exist» and «you are
    // not logged in» need two different actions, and a tool that flattens them into «not found»
    // sends the reader to the wrong one.
    if (!UUID.test(out)) {
      console.error('⛔ wrangler could not answer about the database `' + NAME + '`:\n' + out.trim());
      process.exit(1);
    }
  }
  // The JSON shape is wrangler's, not ours: take the uuid wherever it sits, and fall back to the
  // raw text (an older wrangler prints a table) rather than depending on a field name.
  try {
    const j = JSON.parse(out);
    const found = (function walk(v) {
      if (typeof v === 'string') return UUID.test(v) && v.length === 36 ? v : null;
      if (Array.isArray(v)) { for (const x of v) { const r = walk(x); if (r) return r; } return null; }
      if (v && typeof v === 'object') {
        if (typeof v.uuid === 'string' && UUID.test(v.uuid)) return v.uuid;
        for (const k of Object.keys(v)) { const r = walk(v[k]); if (r) return r; }
      }
      return null;
    })(j);
    if (found) return found;
  } catch (e) {}
  const m = out.match(UUID);
  if (!m) { console.error('⛔ no database id in the answer:\n' + out.trim()); process.exit(1); }
  return m[0];
}

const id = ask();
const src = fs.readFileSync(TOML, 'utf8');
const line = /^database_id = "([^"]*)"$/m;
const cur = src.match(line);
if (!cur) { console.error('⛔ no `database_id` line in ' + TOML + ' — the file has drifted, fix it by hand'); process.exit(1); }
if ((src.match(/^database_id = /gm) || []).length !== 1) {
  console.error('⛔ more than one `database_id` line — refusing to guess which one is the ledger');
  process.exit(1);
}
if (cur[1] === id) { console.log('the id is already in place: ' + id); process.exit(0); }
fs.writeFileSync(TOML, src.replace(line, 'database_id = "' + id + '"'));
console.log('database_id: ' + (cur[1] || '(empty)') + '\n         -> ' + id);
console.log('now: npx wrangler d1 execute ' + NAME + ' --remote --file server/pay/schema.sql --config server/pay/wrangler.toml');
