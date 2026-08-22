# Stripe for a game on its own domain — instructions for the owner (2026-07-31)

Verified against docs.stripe.com / stripe.com, July 2026. We sell 4 one-time
products: $4.90 / $9.90 / $19.90 + «Remove Ads Forever» $4.90 (also one-time —
«forever» is remembered by the game itself).

## 0. COUNTRY: PORTUGAL (the owner's word 2026-08-01) — the path is direct

Portugal is in the EU → Stripe directly, a natural person (Individual) is
allowed; NIF is your tax number in the form; a bank account in EUR in your name.
The section about the CIS/Atlas below is NOT NEEDED — it is kept for reference.
Fees are the EU branch (~1.5% + €0.25 for EEA cards). VAT: the threshold for
cross-border sales to EU consumers is €10,000/year, beyond that OSS registration
(or turn on Stripe Tax collection earlier voluntarily); turn on threshold
monitoring from day one — it is free.

## 0-bis. For reference: the general choice by country (the original version)

- **The EU (all 27), the UK, Norway, Switzerland** → Stripe directly,
  registration is possible as a natural person (Individual / Sole proprietor),
  a legal entity is not required.
- **The CIS (Russia, Kazakhstan, Armenia, Georgia and others) → Stripe is NOT
  supported.** The options: (a) Merchant of Record — Xsolla (specializes in
  games), Paddle: they are the legal seller, they pay the taxes worldwide
  themselves, they take ~5% instead of ~1.5-3%; at small turnovers this is
  CHEAPER than an accountant; the geography of sellers is wider — check your
  own country on their sites; (b) Stripe Atlas — a US company for $500 + annual
  US tax reporting: for a start I do NOT advise it.

## 1. What to do by hand (the order matters)

1. **The site BEFORE activation**: the game's domain must be live and carry — a
   description of the products with prices and currency, Terms of Service,
   Privacy Policy, **Refund Policy**, a support contact (a real email), HTTPS.
   Stripe checks the site at activation; «under construction» will not pass.
   I will write the drafts of the pages — publish them before applying.
2. **Registration**: dashboard.stripe.com → account → «Activate payments».
   You will need: full name, date of birth, address, tax/ID number (they may
   ask for a photo of the document), a business description («virtual goods in
   an online browser game»), the site URL, a **bank account** for payouts (a
   personal account in your name is allowed for a natural person), statement
   descriptor = the name of the game (5-22 characters — what the player will
   see in the statement; an unclear one = chargebacks).
   Turn on 2FA (passkey, not SMS).
3. **Products**: Product catalog → 4 products, Pricing = Flat rate → **One
   time** (NOT subscription), USD 4.90/9.90/19.90/4.90; it is desirable to add
   EUR prices to the same products (Europeans without conversion). First in
   sandbox, after checking — the «Copy to live mode» button.
4. **Hand over to me through the password manager** (not into the chat): the
   `pk_test_` / `sk_test_` keys right away; `pk_live_` / `sk_live_` after
   activation (the live secret is shown ONCE); 4 Price IDs (`price_…`) — the
   test and the live sets.
5. **Stripe Tax**: at a minimum — turn on the free threshold monitoring; tax
   collection (0.5%/transaction) — when a VAT registration appears. For the EU:
   virtual goods = electronically supplied services, the threshold for
   cross-border sales is €10,000/year, beyond that OSS. The exact moment is a
   question for a tax consultant.
6. To know in advance: the fee of an EU account is ~1.5% + €0.25 (EEA cards;
   higher for international ones, +2% conversion). A refund is 2 clicks, but the
   payment fees are not returned. **A chargeback = a €20 fee** — for a $4.90
   product there is no point in disputing: refund the suspicious ones yourself
   before escalation.

## 2. What I then do (development)

1. A server endpoint «create a Checkout Session» (hosted Stripe Checkout,
   mode=payment, success/cancel URL back into the game) + the purchase buttons.
   Checkout itself solves PCI, 3DS/SCA, Apple/Google Pay, localization.
2. A `checkout.session.completed` webhook with signature verification — on it
   the game grants the product (not on the player returning to the
   «thank-you» page).
3. A run in sandbox with the test card 4242… → go-live checklist → a live test.

Key links: docs.stripe.com/get-started/account/activate ·
…/get-started/checklist/website · …/keys · …/payments/online-payments ·
…/products-prices/manage-prices · stripe.com/pricing · docs.stripe.com/tax ·
…/disputes/how-disputes-work · …/webhooks · stripe.com/global · stripe.com/atlas
