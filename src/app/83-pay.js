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
const PAY_RETURN_LS = 'mixer_pay_return';     // the paying TAB says «I am back» to the game tab
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

// ⚠️ ONE POLL, THREE CALLERS (the startup pass, the paying tab's signal, a return to this tab), and
// the flag is what stops them running over each other: three overlapping passes would ask the same
// question three times and could grant on two of them before the first writes the ledger.
let payPolling = false;
function payPollGrant(restore) {
  if (payPolling) return Promise.resolve({ ok: true, busy: true });
  payPolling = true;
  let i = 0;
  return new Promise((done) => {
    const step = () => {
      Promise.resolve(restore()).then((r) => {
        if (r && r.restored > 0) { payClearPending(); payPolling = false; done({ ok: true, restored: r.restored, tries: i }); return; }
        if (++i >= PAY_POLL_MS.length) {
          // ⚠️ THE MARK SURVIVES A FRUITLESS ROUND, AND THAT IS DELIBERATE: a delayed method (MB
          // WAY, a bank debit) pays MINUTES later, so the next launch must ask again. It is cleared
          // only by a grant or by a cancel.
          payPolling = false; done({ ok: true, restored: 0, tries: i }); return;
        }
        setTimeout(step, PAY_POLL_MS[i]);
      });
    };
    setTimeout(step, PAY_POLL_MS[0]);
  });
}

// ⚠️⚠️ THE GAME TAB LISTENS WHILE THE PLAYER PAYS IN THE OTHER ONE. Two signals, because neither
// alone covers the flow: the `storage` event fires in OTHER tabs of the same origin the moment the
// paying tab writes its mark (instant, even unfocused), and `visibilitychange` catches the player
// coming back by any other road — he closed the payment tab himself, the browser refused to close
// it, or he simply switched.
// ⚠️ BOTH ARE GATED ON THE PENDING MARK, so an ordinary tab switch costs nothing.
let payWatching = false;
function payWatch(restore) {
  if (payWatching || !payHostOk() || typeof restore !== 'function') return;
  payWatching = true;
  const kick = () => { if (payPending()) payPollGrant(restore); };
  try { window.addEventListener('storage', (e) => { if (e && e.key === PAY_RETURN_LS) kick(); }); } catch (e) {}
  try { document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); }); } catch (e) {}
}

// The one entry point the seam calls at startup. `restore` is 78-ads's own restorePurchases — the
// grant, the ledger and the claim all live there; this only decides HOW MANY TIMES to ask.
function payWebBoot(restore) {
  if (!payHostOk() || typeof restore !== 'function') return Promise.resolve({ ok: false });
  payWatch(restore);
  const back = payReturnParam();
  const pending = payPending();
  // ⛔ A CANCEL IS NOT A PURCHASE: the player pressed «back» on Stripe's page. Clearing the mark is
  // the whole handling — polling for a payment that was never made would just cost five requests.
  if (back === 'cancel') { payClearPending(); try { payHandBack(''); } catch (e) {} return Promise.resolve({ ok: true, cancelled: true }); }
  // ⛔⛔ THE PAYMENT CAME BACK INTO ITS OWN TAB, AND THE GAME IS IN THE OTHER ONE. Granting here
  // would write the boost into a COPY of the game that is about to close, while the tab the player
  // is actually looking at holds the pre-purchase save IN MEMORY and would overwrite it on its next
  // commit — the purchase would vanish in front of him. So this tab only says «I am back» and goes.
  // ⚠️ If the browser refuses to close it, the fallback below grants here after all: a tab the
  // player is left staring at must not be the one without the boost.
  if (back && window.opener && !window.opener.closed) {
    payHandBack(back);
    try { window.close(); } catch (e) {}
    return new Promise((done) => setTimeout(() => {
      payPollGrant(restore).then((r) => done(Object.assign({ handed: true }, r)));
    }, 600));
  }
  if (!back && !pending) return Promise.resolve(restore()).then(() => ({ ok: true, single: true }));
  // We are back from a payment (or the tab died mid-flow): the webhook may still be in the air.
  return payPollGrant(restore);
}

// ⚠️ THE VALUE CARRIES A TIMESTAMP because a `storage` event only fires when the value CHANGES:
// two payments of the same session id in one browser lifetime would otherwise be silent the second
// time. The game tab reads nothing out of it — its presence is the whole message.
function payHandBack(sid) {
  try { localStorage.setItem(PAY_RETURN_LS, (sid || '') + ':' + Date.now()); } catch (e) {}
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
    // ⚠️⚠️ THE TAB IS OPENED SYNCHRONOUSLY, INSIDE THE CLICK, AND POINTED AT THE ADDRESS LATER.
    // `window.open` after an `await` has lost the user activation, and Safari and Chrome block it —
    // the player would press Buy and nothing at all would happen. A blank tab opened now is still
    // inside the gesture; the address arrives half a second later and it is simply steered there.
    let win = null;
    try { win = window.open('', '_blank'); } catch (e) { win = null; }
    return payCheckout().then((r) => {
      if (!r || !r.url) { try { win && win.close(); } catch (e) {} throw new Error('failed'); }
      // ⚠️⚠️ THE MARK IS WRITTEN BEFORE THE PLAYER LEAVES, or a tab closed on Stripe's page leaves
      // nothing behind to say a payment was ever started.
      payMarkPending(r.sid);
      if (win && !win.closed) {
        try { win.location.href = r.url; } catch (e) { win = null; }
      }
      if (!win || win.closed) {
        // ⛔ THE POPUP WAS BLOCKED — and the player has already decided to buy. Sending THIS tab is
        // worse than a new one (the game reloads on the way back) but infinitely better than a
        // button that silently does nothing.
        location.href = r.url;
        throw new Error('redirect');
      }
      // ⚠️ 'opened': the game stays where it is, the payment happens elsewhere, and the boost
      // arrives here through the watcher above. Silent at the call site, like a cancel.
      throw new Error('opened');
    });
  },
};
function payWebApi() { return payHostOk() ? PAY_WEB_API : null; }
