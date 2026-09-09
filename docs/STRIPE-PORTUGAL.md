# STRIPE IN PORTUGAL — opening the account and wiring it into Blendo

Written 2026-09-09 on his word «3. stripe portugal — a full instruction for opening it and
integrating it». Everything marked ✅ was read off a primary source on that date (linked at the
end); everything marked ⚠️ is a judgement or a question for his accountant, and it is marked so he
can tell the two apart. Prices and tax rules move — re-read the two Stripe links before acting.

---

## 0. THE ONE PAGE, IF HE READS NOTHING ELSE

1. **The €0.25 is the enemy, not the percentage.** On a €1.99 boost Stripe takes **€0.28** (14%)
   from an EEA card and **€0.31** (16%) from an American one — almost all of it the FIXED fee. On a
   €9.99 pack the same fee is 3.5%. If web payments are to be worth their compliance, the catalogue
   needs at least one bigger item; the price is his call, the arithmetic is in §5.
2. **Stripe is not the seller — he is.** Stripe moves money; the VAT on every European sale is his
   to compute, collect, declare and pay. That is the real cost of this route, and it is not money,
   it is a monthly obligation. A merchant of record (Paddle, Lemon Squeezy, Polar) takes ~5% + $0.50
   and becomes the seller, i.e. buys the whole problem — at €1.99 that is ~30% of the sale.
3. **The account itself is easy** once the Portuguese paperwork exists: NIF + an open activity at
   Finanças + an IBAN + ID. A day of forms, not a project.
4. **The game side is nearly done already.** `payApi()` in `src/app/78-ads.js` already picks a
   provider (the iOS wrapper, else Playgama). Stripe becomes the third, behind the same four
   methods. The game's grant path (`buyBundle`) does not change at all.
5. **The one thing that must be built properly is the ledger** — a server that remembers who paid.
   Today a purchase lives in `localStorage` and dies with a cleared browser (batch 2026-09-04-a).
   The leaderboard Worker already has the exact identity machinery to reuse.

---

## 1. THE DECISION BEFORE THE ACCOUNT: Stripe or a merchant of record

|  | Stripe | Merchant of record (Paddle / Lemon Squeezy / Polar) |
|---|---|---|
| fee, EEA card | ✅ 1.5% + €0.25 | ~5% + $0.50 |
| fee, US card | ✅ 3.15% + €0.25 (+2% if converted) | the same ~5% + $0.50 |
| on a €1.99 sale | €0.28 – €0.35 | ~€0.60 |
| who is the seller | **he is** | **they are** |
| EU VAT | his: registration, rates per country, returns | theirs |
| US sales tax | his, if a state's threshold is ever crossed | theirs |
| invoices to customers | his (and in Portugal that means certified software — §3) | theirs |
| payout | 2-7 days to his IBAN | usually monthly, on request |
| control of the checkout | total | limited |

⚠️ **THE HONEST RECOMMENDATION, AND IT DEPENDS ON ONE NUMBER HE HAS AND I DO NOT: how much does he
expect to sell in a year?** Under a few thousand euro the VAT machinery costs more attention than
Stripe's lower fee saves, and a merchant of record is the calmer choice. Past that, Stripe plus an
accountant is cheaper and he keeps the customer relationship. The rest of this document is the
Stripe route, as he asked.

---

## 2. OPENING THE STRIPE ACCOUNT IN PORTUGAL — the sequence

**What must exist BEFORE Stripe.** Stripe is a payment company, not a business registry: it will
ask who is selling, and Portugal must already know.

1. **NIF** — his Portuguese tax number. He has one if he is resident.
2. **An open activity at Finanças** (*início de atividade*). Two shapes:
   - **ENI / self-employed** (*empresário em nome individual*, «recibos verdes») — free, done online
     at the Portal das Finanças, no share capital, no accountant strictly required below the
     organised-accounting thresholds. The natural start for one game.
   - **Lda** (a company) — a notary/online *Empresa na Hora*, ~€360, a certified accountant (TOC)
     obligatory, corporate tax instead of IRS. Worth it when the revenue justifies it or when he
     wants liability separated from himself.
   - ✅ There is no nationality restriction and the minimum age is 18. A sole trader uses his
     **personal NIF** — there is no separate business number to obtain.
   - The activity code (CAE/CIRS) should describe software or digital services. ⚠️ The exact code is
     the accountant's call and it affects both IRS and VAT.
3. **A bank account with an IBAN** in his own or the company's name. A Portuguese IBAN is simplest;
   any SEPA IBAN in the same legal name works.
4. **ID** — Cartão de Cidadão or passport, and proof of address if asked.

**Then Stripe itself**, ~30 minutes:

5. Create the account at `dashboard.stripe.com/register`, **country = Portugal**. ⛔ The country
   cannot be changed later — a wrong choice means a new account.
6. Business type: *Individual / sole proprietor* or *Company*, matching step 2.
7. Fill in: legal name exactly as at Finanças, NIF, address, date of birth, the activity
   description («in-game purchases in a browser game»), the website (`https://blendo.monster`), and
   the **statement descriptor** that will appear on the card statement — make it `BLENDO`, because a
   descriptor a player does not recognise is the single biggest cause of chargebacks.
8. Bank account (IBAN) for payouts, and the payout schedule (daily/weekly).
9. Identity verification — upload the document; usually minutes, sometimes a day.
10. **Turn on the payment methods that matter for a game**: cards, **Apple Pay and Google Pay**
    (one tap on a phone, and this game is played on phones), Link, and — for Portugal specifically —
    **MB WAY** and Multibanco if he wants local buyers. Apple Pay needs the domain verified: Stripe
    hands over a file to host at `/.well-known/apple-developer-merchantid-domain-association`. The
    site Worker serves whatever is in `site/`, but that folder is assembled by an EXPLICIT list —
    `tools/site-pack.py` would need `.well-known` added to `DIRS`, or the file will simply not be
    there and Apple Pay will stay off with no error anywhere.
11. Test mode first: everything below can be built and proven end-to-end with test keys before the
    account is even fully verified.

⚠️ **WHAT STRIPE WILL ASK FOR AND HE SHOULD PREPARE:** a live URL where the product is visible, a
refund policy, terms and a privacy page. A game with a single €1.99 item and no visible terms is a
common reason for a review hold. Three short pages on blendo.monster remove the risk.

---

## 3. TAX — the part that is actually work, and where Portugal is special

✅ **Stripe is not a merchant of record.** It never becomes the seller, so every obligation below is
his. Stripe Tax (✅ 0.5% per transaction where he is registered) can CALCULATE the right rate and
produce the reports; it does not make him not liable, and in most countries it does not file.

**VAT inside the EU, B2C digital services (which a game boost is — «TBE» in EU language):**
- ✅ Below **€10,000** a year of cross-border B2C digital sales to other EU countries, he may charge
  **Portuguese** VAT and report at home.
- ✅ Above it, the place of supply is the customer's country: German VAT for a German player, and so
  on, declared through **OSS** — one quarterly return filed in Portugal covering all 27.
- ✅ Since 1 January 2025 there is also the **cross-border SME scheme**: EU-wide turnover under
  **€100,000** and under each country's own national threshold, an **EX** number, one quarterly
  report — an exemption instead of OSS. ⚠️ Whether it may be used for digital services in his case
  is exactly the question for the accountant; the EU's own page does not settle it.
- ✅ Domestically, **Article 53** exempts him from charging VAT under **€15,000** of turnover in 2026
  (with a 25% tolerance, so it is lost immediately above €18,750). ⚠️ The exemption is domestic and
  does not by itself solve cross-border sales.

**Outside the EU** (US, UK, Brazil…): outside EU VAT. The UK has its own rules from the first sale;
US states have thresholds a small game will not reach for a long time. ⚠️ Named so he knows it
exists, not because it is urgent.

⛔⛔ **THE PORTUGUESE SPECIFIC THAT CATCHES EVERYONE, AND STRIPE DOES NOT DO IT: INVOICES.**
- Every sale needs an invoice issued under Portuguese rules, with **ATCUD and a QR code**, and the
  **SAF-T (PT) billing file** submitted monthly by the 5th.
- ✅ Certified software is mandatory above **€50,000** of turnover — **and, crucially, if he uses ANY
  software to issue invoices, that software must be AT-certified**, whatever the turnover. Stripe's
  receipts are not Portuguese invoices.
- ✅ From **1 January 2027** a qualified electronic signature is required on electronic invoices.
- ⚠️ **THE PRACTICAL ANSWER:** a Portuguese invoicing service with an API (InvoiceXpress, Vendus,
  Moloni are the usual three) called from the same Worker that grants the purchase, so every Stripe
  payment produces a legal invoice automatically. Budget ~€10–20/month. This is the piece people
  discover after the first sale; better to plan it now.

---

## 4. WIRING IT INTO BLENDO — what exists, what to build

### 4.1 The game already has the seam
`src/app/78-ads.js`: `payApi()` returns `nativePayments() || bridgePayments()`, and a provider is
just four methods — `getCatalog()`, `purchase(id)`, `getPurchases()`, `consumePurchase(id[, orderId])`.
`buyBundle(id)` in `77-save.js` is the GRANT and is provider-independent. So Stripe is **a third
provider in the same chain**, and the game's economy code does not move:

```
function payApi(){ return nativePayments() || webPayments() || bridgePayments(); }
```

⚠️ **THE ORDER IS THE WHOLE DESIGN.** The wrapper must keep StoreKit (Apple requires it for an app),
and the portal must keep Playgama (their platform, their rules). `webPayments()` returns non-null
**only on our own domain, outside the portal's iframe and outside the wrapper** — the same three
questions the service worker's registration already asks.

### 4.2 The server: a fourth Worker, `server/pay/`
The project already runs three Workers, and the fourth follows their pattern exactly.

**Why a server at all, and not a bare Payment Link:** because someone must decide that a payment
happened. A browser cannot be trusted to say so, and today a purchase exists only in `localStorage`
— a cleared browser loses it. This is the hole named in batch 2026-09-04-a, and Stripe is the reason
to close it.

**The table** (D1, the leaderboard's shape):
```sql
CREATE TABLE IF NOT EXISTS pay (
  gid TEXT NOT NULL,        -- Save.gid, the player key the leaderboard already uses
  sid TEXT PRIMARY KEY,     -- Stripe checkout session / payment intent id -- idempotency lives here
  item TEXT NOT NULL,       -- 'bundle5'
  cents INTEGER NOT NULL,
  cur TEXT NOT NULL,
  t INTEGER NOT NULL,       -- unix sec
  used INTEGER NOT NULL DEFAULT 0   -- 1 once the game has consumed it
);
CREATE INDEX IF NOT EXISTS ix_pay_gid ON pay(gid, used);
```

**Three endpoints:**
- `POST /v1/checkout` — body `{ gid, item, sig }`. Creates a Stripe **Checkout Session** with
  `client_reference_id = gid`, `metadata.item`, `success_url` back to the game, and returns the
  session URL. ⚠️ The price lives in **Stripe**, never in the request: a client that names its own
  price is a shop that sells for one cent.
- `POST /v1/webhook` — Stripe calls it on `checkout.session.completed`. **Verify the signature**
  (`Stripe-Signature`, the endpoint secret) and then write the row. ⛔ This, not the browser, is what
  grants: a player who closes the tab after paying must still get the boost.
- `GET /v1/entitlements?gid=…&t=…&sig=…` — what the game asks at start. Returns the unused rows.

**The signature is the one the game already has.** `Save.lk` is an HMAC key registered TOFU by the
leaderboard (`server/leaderboard`, batch 2026-09-06-e), and `Save.gid` merges to the oldest id across
devices. Signing `/checkout` and `/entitlements` with it costs nothing new and means a purchase
**follows the player to his other device** — the thing localStorage cannot do.
⚠️ It is not strong protection (the key sits in the save), and it does not need to be: the money is
verified by Stripe's webhook signature. The HMAC only stops a stranger reading or spending someone
else's entitlement.

### 4.3 The client provider, in the same four methods
- `getCatalog()` → the item list with prices, fetched from the Worker (or hard-coded and confirmed
  by it — the price must never be authored in the client).
- `purchase(id)` → POST `/v1/checkout`, then `location.href = url`. ⚠️ Stripe Checkout is a REDIRECT
  away from the game and back. The game must therefore survive being left and re-entered — which it
  does, because the save is written on every commit — and `success_url` should carry `?paid=1` so
  the restore pass can run at once instead of on the next launch.
- `getPurchases()` → GET `/v1/entitlements`; called by the SAME restore pass that already exists
  (`restorePurchases()` in 78-ads) — the mechanism that makes an interrupted purchase heal itself.
- `consumePurchase(sid)` → POST that marks the row `used = 1`, called after `buyBundle` has granted.
  ⛔ **Grant first, consume second, exactly as the wrapper does:** consuming first and crashing loses
  the player's money.

### 4.4 The failure modes to build for, because they all happen
| what | what must happen |
|---|---|
| the player pays and closes the tab | the webhook wrote the row; the next launch's restore pass grants |
| the webhook is late (seconds) | the return page polls `/v1/entitlements` for ~10 s, then gives up quietly — the next launch grants |
| the player pays twice | `sid` is the primary key; the second write is a no-op |
| a refund / chargeback | `charge.refunded` and `charge.dispute.created` set `used = 2` and the game stops honouring it. ⚠️ Refunds on a consumable are a policy question, and having none is what makes disputes |
| a card fails | Stripe shows it, the game never learns; nothing to do |
| the Worker is down | `purchase()` returns `{ ok:false, reason:'failed' }`, which the HUD already renders |

### 4.5 The guards this project would require
- `server/pay/test/run.js` + `break.js` — the site/video Worker pattern: a signature that does not
  verify is refused; a replayed webhook writes once; an entitlement of another gid is never returned;
  a refund revokes. Each sabotage red on its own arm.
- A suite section (`⟦WEBPAY-SECTION⟧`): `payApi()` picks the web provider **only** off-portal and
  off-wrapper (the arm that proves the order in §4.1); a granted entitlement is consumed exactly once;
  the price is never read from the client.
- ⚠️ **Never a live Stripe call in the suite.** Stripe's test mode is a network dependency and the
  canon already forbids the suite touching the production leaderboard; the Worker's own test uses a
  fake Stripe, and the live path is smoked by hand with a test card.

---

## 5. WHAT IT COSTS — on a €1.99 boost

| card | Stripe fee | he keeps (VAT aside) |
|---|---|---|
| EEA | €0.28 (1.5% + €0.25) | €1.71 — **86%** |
| UK | €0.30 (2.5% + €0.25) | €1.69 |
| US / other non-EEA | €0.31 (3.15% + €0.25) | €1.68 — **84%** |
| the same, paid in USD and converted | €0.35 (+2%) | €1.64 — **82%** |

With Portuguese VAT inside the price at 23%: €0.37 is the state's, so **€1.34 of €1.99 is his — 67%**.
Add Stripe Tax at 0.5% (€0.01) and an invoicing service (~€15/month, i.e. €0.15 per sale at 100
sales/month, €0.015 at 1000).

⚠️ **AND THE COMPARISON THAT MATTERS:** Apple takes 15% (small business programme) or 30% in the
wrapper; Playgama takes its own share on the portal. Stripe on his own domain, before VAT, is the
cheapest channel he has — and the only one where the fixed €0.25 makes a cheap item expensive.
**Selling a €9.99 or €19.99 pack alongside the €1.99 one is worth more than any fee negotiation.**

Fixed costs: ✅ no setup fee, no monthly fee, standard payouts free. Disputes ✅ €20 each, refunded
if won — at €1.99 a dispute costs ten sales, which is why the statement descriptor and a visible
refund policy are not decoration.

---

## 6. THE ORDER OF WORK

1. **His decision** on §1 (Stripe or a merchant of record) and on the catalogue (§5 — one item or
   three).
2. His paperwork: activity at Finanças → IBAN → Stripe account in test mode.
3. **Then** the code, in one batch: `server/pay/` with its two test files, `webPayments()` in
   78-ads, the return page, and the guards. The estimate is a day, because the seam and the identity
   machinery already exist.
4. A smoke with a Stripe test card, end to end, on blendo.monster.
5. The invoicing integration (§3) before the first real euro, not after.
6. Live keys, one real €1.99 purchase from his own phone, refunded to himself.

---

## 7. WHAT I VERIFIED, AND WHAT IS NOT MINE TO ANSWER

✅ Verified 2026-09-09 against primary sources: Stripe's Portuguese pricing page (all the rates in
§5, Stripe Tax 0.5%, disputes €20, no monthly fee); the EU's own SME-scheme page (€100,000, the EX
number, the quarterly report); the €10,000 TBE threshold and OSS; Portugal's Article 53 limit of
€15,000 for 2026 and the 25% tolerance; the certified-software rule (mandatory above €50,000 and for
any software-issued invoice), ATCUD/QR/SAF-T, and the qualified signature from 1 January 2027.

⚠️ NOT verified and deliberately not asserted: whether the cross-border SME scheme may be used for
digital services in his situation; which CAE/CIRS code fits; whether ENI or Lda is better for him;
the exact behaviour of any particular invoicing API. All four are an accountant's, and they are worth
one paid hour before the first sale, not after.

**Sources:** [Stripe pricing, Portugal](https://stripe.com/pt/pricing) ·
[EU cross-border SME scheme](https://sme-vat-rules.ec.europa.eu/sme-scheme/cross-border-sme-scheme_en) ·
[EU VAT special schemes](https://taxation-customs.ec.europa.eu/taxation/vat/vat-special-schemes_en) ·
[VAT exemptions for SMEs (Your Europe)](https://europa.eu/youreurope/business/taxation/vat/vat-exemptions/index_en.htm) ·
[Article 53 in 2026](https://calculariva.pt/taxas-regras/regime-isencao-art53/) ·
[ATCUD, QR and SAF-T in 2026](https://www.hvrbusinessconsulting.com/pt/blog/atcud-qr-code-saft-guia-2026) ·
[registering as a sole trader in Portugal](https://www.deel.com/blog/sole-proprietorship-portugal/) ·
[OSS threshold](https://amavat.eu/vat-oss-threshold-explained-what-happens-after-e10000/)
