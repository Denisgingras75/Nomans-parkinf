# Handoff — pick up here

**Last updated:** 2026-05-29, end of long working session.

## State of the world

- **Production URL:** https://nomansdrive.com (Vercel project still literally named `nomans-parkinf` — rename is cosmetic, can wait)
- **Trunk branch:** `claude/nomans-combi-shuttle-app-dJQ2F` (no `main`; Vercel auto-deploys on push)
- **Bootstrap admin passcode:** `Rummrunner2026` (rotated this session; ADMIN_PASSCODE env var on Vercel)

## Shipped this session

Everything below is deployed and live:

1. **Live Bouncie GPS** — webhook configured at bouncie.dev pointing to `/api/bouncie/webhook?secret=…`. Real position updates appear at `/api/state.shuttle.position`. (KV had a cold-start bug that took an hour to debug — see "Quirks" below.)
2. **Map upgrade** — Leaflet with a directional chevron + breadcrumb trail (last 24 fixes, fading rust polyline), tooltips show mph, palette pulled from CSS vars. Tile layer is CartoDB Dark Matter by default, switches to **Google Maps** automatically when `NEXT_PUBLIC_GOOGLE_MAPS_KEY` is present (it is). Owner needs to enable Maps JavaScript API on the key in Google Cloud Console for the swap to render.
3. **NoMans pin** — set to the real 41.4399 / -70.5568 (15 Island Inn Rd, Oak Bluffs) via the new Places Autocomplete in `/admin`.
4. **Web Push (PWA / VAPID)** — `/driver` is now an installable PWA with a service worker that fires OS-level notifications on new pickups. Replaces Twilio for active drivers. iOS users must Add to Home Screen first; Android works in-tab. Twilio still fires in parallel as a fallback (currently silent — toll-free not verified, see below).
5. **Manager logins** — bar staff get their own `MGR-XXXXXX` codes via `/admin → Managers`. Same powers as the bootstrap admin EXCEPT they can't see or revoke other managers. Bootstrap is the only thing that can mint/revoke managers (`isBootstrap()` gate). Managers stored in KV under `nomans:managers:v1`.
6. **QR-code onboarding** — every driver + manager row in `/admin` shows a scannable QR that encodes `/driver?code=NM-XXXX` or `/admin?code=MGR-XXXX`. New people point their phone camera at it, the deep link auto-fills the passcode and unlocks them. Solves the "no SMS to send codes" problem.
7. **Passenger phone capture + driver tel/sms/Navigate** — passenger optional phone field; driver queue shows `tel:` and `sms:` links + a Google Maps `Navigate` button per stop.
8. **SMS test button** in `/admin` Service status card — fires a `🚐 TEST PING` to every on-shift driver with a phone, returns per-driver status.

## Owner-pending (Denis-only — can't be done from code)

- [ ] Verify Twilio toll-free OR buy a local 508 number to replace the un-verified `+1855…` (currently SMS doesn't deliver, error 30032).
- [ ] Drive the van so Bouncie pushes real coords (current shuttle position is a probe from debugging).
- [ ] Set a $20/month billing cap on Google Cloud for the Maps key.
- [ ] (Optional) Rename the Vercel project `nomans-parkinf → nomans-parking` to drop the typo in any non-aliased URLs.

## Where to pick up next session

In rough order of leverage:

1. **Smoke-test the QR codes on a real iPhone.** Should pre-fill and unlock. The deep-link handler is in `app/driver/page.tsx` (`?code=NM-...` branch in the first useEffect) and `app/admin/page.tsx` (`?code=MGR-...`).
2. **Decommission Twilio once Push is verified working at the bar.** Either remove the SMS fan-out from `app/api/ping/route.ts` or hide it behind a feature flag. Cuts the monthly bill.
3. **Real cancel from passenger.** Today's "Cancel this ride" only clears localStorage — server-side queue still has the stop. Hit `/api/stops` with `cancelled` status. (~15 min.)
4. **"I'm stuck +10 min" driver affordance** from the review backlog.
5. **Active rides view in /admin** so the owner can see pickups in flight (today's view only shows completed/cancelled rides).

## Env vars (all set in Vercel, all 3 environments)

| Name | Notes |
|---|---|
| `ADMIN_PASSCODE` | `Rummrunner2026` (bootstrap recovery key — keep it offline) |
| `BOUNCIE_WEBHOOK_SECRET` | rotated mid-session; see Vercel for current value |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` / `KV_URL` / `REDIS_URL` / `KV_REST_API_READ_ONLY_TOKEN` | Upstash Redis via Vercel Marketplace integration |
| `GOOGLE_PLACES_API_KEY` | server-side, for `/api/places/*` |
| `NEXT_PUBLIC_GOOGLE_MAPS_KEY` | browser-side, for Google Maps tile load (currently same value as Places key — see security note below) |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM` | toll-free `+1855…`, NOT YET VERIFIED — SMS fails with error 30032 |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web Push |
| `SHUTTLE_VEHICLE_ID` | not set — only needed when multiple Bouncie-equipped vans on the account |

## Quirks worth knowing

1. **`@vercel/kv` lazy-init was racing Vercel's env-var injection on cold starts.** Fix: `lib/store.ts` now calls Upstash REST directly via `fetch()` instead of using `@vercel/kv`. Don't re-introduce `import { kv } from "@vercel/kv"` in `lib/store.ts` — it'll bring the bug back.
2. **`useKV()` is a function, not a const.** Same reason — env reads must happen at request time, not module-load time. Don't "simplify" it back to a const.
3. **Hardcoded hex in `app/layout.tsx`** (`themeColor: "#0a1525"`) is intentional. `<meta name="theme-color">` is parsed before stylesheets exist so CSS vars don't resolve there. Keep it in sync with `--bg` in `globals.css` if you change the theme.
4. **Hardcoded `#ffffff` background in `CodeQR`** is intentional. QR scanners need high-contrast white background; a dark themed var breaks scanning reliability.
5. **Google Maps key is shared between server-side Places and browser Maps.** This means the key is exposed in the JS bundle (anyone can scrape it). API restrictions are set to Maps JavaScript + Places only, but no HTTP referrer restriction (would break the server-side calls). Billing cap is the safety net. Long-term fix: split into two keys.
6. **Single-shuttle assumption.** `state.shuttle` is singular. Multi-van means `SHUTTLE_VEHICLE_ID` filtering or a real refactor.

## Decisions to NOT re-litigate (see `CLAUDE.md` for the full list)

Bounding-box geofence (not polygon), plaintext driver codes in KV, awaited SMS dispatch, operational state in KV settings (not env), store is async, manual offline kill-switch always wins over the schedule, brand card stays white.

## Quick test commands

```bash
# Health check
curl -s https://nomansdrive.com/api/state | python3 -m json.tool

# Admin state (replace passcode if rotated)
curl -s -H 'x-admin-passcode: Rummrunner2026' https://nomansdrive.com/api/admin/state | python3 -m json.tool

# Send a fake Bouncie event (replace secret with current value)
curl -s -X POST "https://nomansdrive.com/api/bouncie/webhook?secret=<BOUNCIE_WEBHOOK_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"location":{"lat":41.4561,"lng":-70.5602,"heading":270,"speed":12}}'
```
