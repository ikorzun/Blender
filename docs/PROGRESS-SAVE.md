# Progress saving — the decision and the reality across platforms

The owner's decision 2026-07-23: **«to save progress, use the platform's and
the bridge's technologies where that is logical»** — that is, do NOT build
Google authentication, but lean on the platform's cloud through Bridge. This
document records what of that ALREADY works and where the holes remain.
Zone: INTEGRATION AND PUBLISHING.

## What is already done (no code needs to be added)

Cloud save via `bridge.storage` is implemented and **confirmed on the live SDK**
(measurement 2026-07-23 on live Pages): `commitSave` (77-save) writes progress
into the platform's cloud, `bridgeSyncSave` (78-ads.init) pulls it up and merges
it at startup — ABOVE the rewarded gate, so it works on platforms without ads
too. The merge is monotonic (max over keys, gen-epoch), there is no dupe and no
rollback of spends. This is exactly «the platform's and the bridge's technology».

## Why NOT Google authentication (bundle research 2026-07-23)

1. On a portal the game lives in an IFRAME on a third-party domain. Google OAuth
   there runs into third-party cookies / X-Frame-Options / FedCM — «sign in
   with Google» may simply not work.
2. On platforms where player authentication exists, it already identifies the
   player WITHOUT Google (see the table) — Google would duplicate what Bridge gives.
3. ⚠️ THE MAIN POINT: «sign in with Google» BY ITSELF does not save progress.
   OAuth is only «who you are». For progress to travel between devices under
   this id, we need OUR OWN backend (database, endpoints, GDPR). That is
   incomparably more than a sign-in button and is justified only for
   standalone hosting (Pages), where there is no iframe.

## Reality across platforms (from the vendored playgama-bridge.js v2.0.0)

Adapters taken apart along class boundaries; «no» = the base class returns `false`.

| Platform | player authentication | cloud save in the adapter | bottom line for progress |
|---|---|---|---|
| **Playgama** | yes (internal flag), `userService.authorizeUser` | **YES** — `cloudSaveApi.getState/setItems` | ✅ the cloud works |
| **Yandex** | **yes** | via the platform's player-API | ✅ the cloud works |
| **CrazyGames** | conditionally (`isUserAccountAvailable`) | no special calls → base `data.*` (local) | ⚠️ no cross-device one |
| **Poki** | **NO** (adapter: only init/commercialBreak/rewardedBreak) | **no** | ⚠️ progress only in localStorage |
| GameDistribution | no | no | ⚠️ the same |

The base implementation of `getDataFromStorage`/`setDataToStorage` (for platforms
without a cloud of their own) goes to `platformSdk.data` — this is the browser's
local storage, NOT a cross-device one.

## Open items (honestly — so as not to pass off wishes as facts)

- **Poki and GameDistribution: there is NO cross-device saving** — neither with
  Google (the iframe will not let it in), nor without. This is a limitation of the
  PLATFORM, not our oversight. On Poki progress lives in localStorage and is lost
  on a device change / cleanup. The wording for the player/owner: «on Poki progress
  is local» — do not promise a cloud where there is none.
- **CrazyGames**: authentication is conditional (the account may be unavailable),
  there is no cloudSave call of its own in the adapter — check on the smoke
  whether the save lands in their cloud or stays local.
- **Standalone (Pages)**: there is no iframe, Google is technically possible, but
  it requires a backend of our own for storage. A separate task, not part of «the
  platform's technologies». To be taken on only if the owner wants cross-device
  progress SPECIFICALLY on our hosting.

## Conclusion

On Playgama/Yandex progress is saved by the platform's own forces — the code is
already in place and verified, there is nothing to do. On Poki/CrazyGames there is
no cross-device cloud by the platform's very construction; Google does not fix that.
Google sign-in makes sense ONLY for standalone and drags a backend behind it — a
separate decision by the owner.
