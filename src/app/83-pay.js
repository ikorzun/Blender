// ===== THE WEB PAYMENT PROTOCOL — the client of pay.blendo.monster (2026-09-10-e) =====
// The third way to pay, beside the portal's wallet and the wrapper's StoreKit, and the only one
// that works on our own domain. It owns the PROTOCOL only; the seam that turns it into a provider
// lives in 78-ads beside the other two (the canon's zone rule: protocol code belongs to whoever
// owns the protocol, and 82-lb owns the leaderboard's the same way).
//
// ⚠️⚠️ THE THREE FACTS THIS FILE IS BUILT ON, AND EACH IS A DEFECT IF IGNORED:
//   1. A BROWSER NEVER SEES A PAYMENT. It sees a redirect it could type by hand. So nothing here
//      grants anything: the server writes the entitlement when Stripe's signed webhook arrives,
//      and this file only ASKS what is owed and marks it taken.
//   2. THE REDIRECT BEATS THE WEBHOOK. Stripe returns the player to us at once and delivers the
//      event a moment later — reading `/v1/mine` a single time on return would find nothing about
//      half the time. Hence the poll below, and hence the pending mark, so a tab closed mid-flow
//      finishes on the next launch instead of losing the purchase.
//   3. THE IDENTITY IS THE LEADERBOARD'S OWN — `guestId()` and the key behind `lbSign` (Save.lk).
//      ONE key, one derivation: a second copy would drift, and the drift would look like theft
//      (the server would refuse a signature made with the other copy).
// ⚠️ The key is trust-on-first-use on the server's side too, in its OWN table: two services must
// not be able to lock each other out of a player. It is sent EXACTLY on the first contact — a
// secret on the wire is a secret on the wire — and again only if the server says it forgot us.

// ⚠️ THE OVERRIDE IS HONOURED ON A LOCAL HOST ONLY, and the reason is 82-lb's word for word: on a
// real host a crafted `?pay=https://evil` would hand a stranger the player's id AND the key that
// owns his purchases. `lbHostIsLocal` is the same pure function the leaderboard's send-gate is
// proven on — file:, localhost, 127/8, .local, RFC1918.
const PAY_BASE = (function () {
  try {
    const local = (typeof lbHostIsLocal === 'function') && lbHostIsLocal(location.protocol, location.hostname);
    if (local) {
      const q = new URLSearchParams(location.search).get('pay');
      if (q) return q === '1' ? (typeof PAY_URL === 'string' ? PAY_URL : '') : q;
    }
  } catch (e) {}
  return (typeof PAY_URL === 'string' && PAY_URL) ? PAY_URL : '';
})();

const PAY_TIMEOUT_MS = 8000;
const PAY_PENDING_LS = 'mixer_pay_pending';   // a payment was started and not yet accounted for
const PAY_REG_LS = 'mixer_pay_reg';           // the gid whose key this server already knows
// The redirect beats the webhook, so the first answer is not the last word. Measured against
// nothing yet — these are the delays Stripe's own guidance implies and they cost nothing while the
// player is looking at the screen he came back to.
const PAY_POLL_MS = [0, 1000, 2000, 4000, 8000];

// ⛔ NOT MERELY «is there an address»: the ORIGIN decides, because `success_url` is fixed on the
// server. See the note at PAY_SITE in 00-config.
function payHostOk() {
  try {
    if (!PAY_BASE) return false;
    if (window.top !== window.self) return false;      // the portal pays with its own wallet
    if (location.origin === (typeof PAY_SITE === 'string' ? PAY_SITE : '')) return true;
    const local = (typeof lbHostIsLocal === 'function') && lbHostIsLocal(location.protocol, location.hostname);
    return !!(local && new URLSearchParams(location.search).get('pay'));
  } catch (e) { return false; }
}

// ⚠️⚠️ A «SIMPLE» REQUEST BY CORS RULES: a text/plain body and NO custom headers, or the browser
// spends a preflight round trip on every call. The worker parses the body with `.json()`, which
// does not look at the content type — the same contract the leaderboard is written to.
async function payFetch(path, body) {
  const ctl = (typeof AbortController === 'function') ? new AbortController() : null;
  const timer = setTimeout(() => { try { ctl && ctl.abort(); } catch (e) {} }, PAY_TIMEOUT_MS);
  try {
    const opts = { signal: ctl && ctl.signal };
    if (body !== undefined) { opts.method = 'POST'; opts.body = JSON.stringify(body); }
    const res = await fetch(PAY_BASE + path, opts);
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch (e) {}
    return { status: res.status, json: json };
  } catch (e) {
    return { status: 0, json: null };
  } finally { clearTimeout(timer); }
}

const payRegistered = (gid) => { try { return localStorage.getItem(PAY_REG_LS) === gid; } catch (e) { return false; } };
const payMarkReg = (gid) => { try { localStorage.setItem(PAY_REG_LS, gid); } catch (e) {} };
const payClearReg = () => { try { localStorage.removeItem(PAY_REG_LS); } catch (e) {} };

// The signed string is always `gid.what.t` — the worker's own rule, and `what` carries the
// endpoint's own payload so a signature for one call can never be replayed on another.
async function paySigned(what, extra) {
  const gid = (typeof guestId === 'function') ? guestId() : '';
  const t = Math.floor(Date.now() / 1000);
  const sig = (typeof lbSign === 'function') ? await lbSign(gid + '.' + what + '.' + t) : '';
  const b = Object.assign({ id: gid, t: t, sig: sig }, extra || {});
  // ⚠️ THE KEY GOES OUT ONLY WHEN THE SERVER CANNOT KNOW IT YET. `payCall` sends it a second time
  // if the server answers `nokey` — that is the leaderboard's «door B»: retention deletes a row,
  // the browser still believes it is registered, and every call would be refused for ever.
  if (!payRegistered(gid) && typeof lbKey === 'function') b.k = lbKey();
  return b;
}

async function payCall(path, what, extra) {
  if (!payHostOk()) return null;
  const gid = (typeof guestId === 'function') ? guestId() : '';
  let r = await payFetch(path, await paySigned(what, extra));
  if (r.json && r.json.err === 'nokey') {           // the server forgot us — offer the key once
    payClearReg();
    r = await payFetch(path, await paySigned(what, extra));
  }
  if (r.json && r.json.ok === 1) payMarkReg(gid);
  return r.json;
}

// ===== THE FOUR CALLS =====
function payPrice() { return payFetch('/v1/price').then((r) => (r.json && r.json.ok === 1) ? r.json : null); }
function payMine() { return payCall('/v1/mine', 'mine'); }
function payClaim(sids) {
  const list = (sids || []).filter((s) => typeof s === 'string' && s);
  if (!list.length) return Promise.resolve(null);
  // ⚠️ THE SIGNED STRING CARRIES THE SESSIONS THEMSELVES, SORTED: the order of a JSON array is not
  // a contract, and a signature for one claim must not be replayable to close another row.
  return payCall('/v1/claim', 'claim.' + list.slice().sort().join(','), { sids: list });
}
function payCheckout() { return payCall('/v1/checkout', 'checkout.bundle5'); }

// ===== THE RETURN FROM STRIPE =====
const payPending = () => { try { return localStorage.getItem(PAY_PENDING_LS) || ''; } catch (e) { return ''; } };
const payMarkPending = (sid) => { try { localStorage.setItem(PAY_PENDING_LS, sid || '1'); } catch (e) {} };
const payClearPending = () => { try { localStorage.removeItem(PAY_PENDING_LS); } catch (e) {} };

// ⚠️ THE PARAMETER IS STRIPPED THE MOMENT IT IS READ (`replaceState` touches no history entry and
// no layout): otherwise a reload would replay the return, and the address bar would carry a
// session id the player has no business seeing.
function payReturnParam() {
  try {
    const u = new URL(location.href);
    const v = u.searchParams.get('paid');
    if (v === null) return '';
    u.searchParams.delete('paid');
    history.replaceState(null, '', u.pathname + (u.search || '') + (u.hash || ''));
    return v;
  } catch (e) { return ''; }
}

// The one entry point the seam calls at startup. `restore` is 78-ads's own restorePurchases — the
// grant, the ledger and the claim all live there; this only decides HOW MANY TIMES to ask.
function payWebBoot(restore) {
  if (!payHostOk() || typeof restore !== 'function') return Promise.resolve({ ok: false });
  const back = payReturnParam();
  const pending = payPending();
  // ⛔ A CANCEL IS NOT A PURCHASE: the player pressed «back» on Stripe's page. Clearing the mark is
  // the whole handling — polling for a payment that was never made would just cost five requests.
  if (back === 'cancel') { payClearPending(); return Promise.resolve({ ok: true, cancelled: true }); }
  if (!back && !pending) return Promise.resolve(restore()).then(() => ({ ok: true, single: true }));
  // We are back from a payment (or the tab died mid-flow): the webhook may still be in the air.
  let i = 0;
  return new Promise((done) => {
    const step = () => {
      Promise.resolve(restore()).then((r) => {
        if (r && r.restored > 0) { payClearPending(); done({ ok: true, restored: r.restored, tries: i }); return; }
        if (++i >= PAY_POLL_MS.length) {
          // ⚠️ THE MARK SURVIVES A FRUITLESS ROUND, AND THAT IS DELIBERATE: a delayed method (MB
          // WAY, a bank debit) pays MINUTES later, so the next launch must ask again. It is cleared
          // only by a grant or by a cancel.
          done({ ok: true, restored: 0, tries: i }); return;
        }
        setTimeout(step, PAY_POLL_MS[i]);
      });
    };
    setTimeout(step, PAY_POLL_MS[0]);
  });
}

// ===== THE PROVIDER — the shape 78-ads's seam already speaks =====
// ⚠️ `byOrder` is a CAPABILITY, not an identity check: this provider closes a purchase by the
// SESSION it was paid in, exactly as StoreKit closes by its transaction id, while the Playgama
// bridge closes by the product id. The seam asks the capability instead of asking who we are.
const PAY_WEB_API = {
  kind: 'web',
  byOrder: true,
  getCatalog() {
    return payPrice().then((p) => {
      if (!p) return [];
      const cur = String(p.currency || '').toUpperCase();
      const v = Math.floor(Number(p.cents) || 0) / 100;
      const sign = cur === 'EUR' ? '€' : cur === 'USD' ? '$' : '';
      return [{ id: 'bundle5', price: sign ? sign + v.toFixed(2) : v.toFixed(2) + ' ' + cur,
                priceValue: v, priceCurrencyCode: cur }];
    }).catch(() => []);
  },
  getPurchases() {
    return payMine().then((r) => ((r && r.items) || []).map((it) => ({ id: it.pid, orderId: it.sid })));
  },
  consumePurchase(id, orderId) { return payClaim([orderId]); },
  purchase(id) {
    if (id !== 'bundle5') return Promise.reject(new Error('unavailable'));
    return payCheckout().then((r) => {
      if (!r || !r.url) throw new Error('failed');
      // ⚠️⚠️ THE MARK IS WRITTEN BEFORE THE NAVIGATION, or a tab closed on Stripe's page leaves
      // nothing behind to say a payment was ever started.
      payMarkPending(r.sid);
      location.href = r.url;
      // ⚠️ THE PAGE IS LEAVING, SO THERE IS NO RESULT TO REPORT. 'redirect' is a reason the caller
      // keeps silent about — «Purchase failed» over a page that is opening the payment form would
      // be a lie, and a promise that never settles would leave the button in a state nobody clears.
      throw new Error('redirect');
    });
  },
};
function payWebApi() { return payHostOk() ? PAY_WEB_API : null; }
