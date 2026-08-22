# GAM prices on the Playgama platform (research 2026-07-31)

Verified against wiki.playgama.com (the IAP guide), the Bridge SDK API docs for
payments and the source of `PlaygamaPlatformBridge.ts` (github.com/playgama/bridge).

## The mechanism — in short

- **The rate is fixed: 1 GAM = $0.10** (10 GAM = $1). Officially: «1 Gam
  equals $0.1 USD», the example from the guide: an item at $3.99 ≈ 40 Gam.
- **There is NO auto-conversion.** The developer himself converts dollars into an
  INTEGER number of GAM and writes it into `playgama-bridge-config.json` → the
  `payments` array → `"playgama": { "amount": N }`. The dashboard does NOT set
  the price on the platform — the price lives in the config, which sits in the game build.
- **getCatalog on playgama is assembled LOCALLY from the config** (without a request to
  the server): `price` = the string «49 Gam», `priceCurrencyCode` = 'Gam',
  `priceValue` = a number, `priceCurrencyImage` = the fennec coin (it may be
  shown next to the price). There are no dollars in the catalog at all.
- The purchase: the platform debits the GAM from the player itself; the JWT verification carries
  only orderId/externalId, there are no amounts in it.

## Our four items (written into the config in v212)

| id | Price USD | amount (GAM) | The player will see |
|---|---|---|---|
| bundle5 | $4.90 | 49 | «49 Gam» |
| bundle3 | $9.90 | 99 | «99 Gam» |
| bundle2 | $19.90 | 199 | «199 Gam» |
| noads_forever | $4.90 | 49 | «49 Gam» |

⚠️ CONSEQUENCE FOR THE UI: on playgama the player pays in GAM — buttons with a
hard-wired «$4.90» are obliged to take the price from `bridge.payments.getCatalog()`
(price/priceValue + priceCurrencyCode). The noads_forever button already does so
(v212: the fetch happens before the rewarded gate); the bundle buttons are Monday's task
(Interface #31 + Integration).

## Open questions (there are no public answers — ask the colleagues at Playgama)

1. Is the $0.10 rate used when calculating the developer's Net Revenue as well, and
   do players have bonus/regional GAM packs (in which case the actual
   dollar amount for 49 GAM may differ from $4.90)?
2. Is there a duplicating catalog of items in the developer.playgama.com dashboard
   (the «New In-Game Purchase» form is there — how does it relate to the config)?
   The guide refers you to the Developer Success Manager for base pricing.
