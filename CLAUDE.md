# NoMans Combi — Project Brief

On-demand "ping for pickup" shuttle dispatch for **NoMans Restaurant**,
Oak Bluffs, Martha's Vineyard. Guests open the site on a phone, tap a
button to request the combi, and the on-shift driver gets a push notification plus a
live queue on a dashboard. Live at **https://nomansdrive.com**
(Vercel project `nomans-parkinf`, `nomans-parkinf.vercel.app` still
resolves as an alias). Owner manages everything from `/admin`
without redeploying.

Stack: Next.js 14 (App Router) · React 18 · Leaflet · Vercel KV
(Upstash Redis) · Web Push (VAPID) · Bouncie OBD-II webhook for live GPS.
Deployed on Vercel.

---

## Run it

```bash
npm install
cp .env.example .env.local   # fill in ADMIN_PASSCODE at minimum
npm run dev                  # http://localhost:3000
npm run build                # production build (verifies typecheck)
```

Branch convention: development happens on
`claude/nomans-combi-shuttle-app-dJQ2F`. There is no `main` yet — that
branch IS the trunk. Vercel auto-deploys on push. If you start a new
Claude Code session, ask the owner whether they want a new branch +
PR or continued work on this one.

---

## Page map

| Route | Who | What |
|-------|-----|------|
| `/` | Passengers | Mobile-first ping-for-pickup. Geolocation → POST `/api/ping`. Shows ETA card + live shuttle on map. |
| `/driver` | Drivers | Passcode-gated queue + actions. Audio chime + screen flash on new pings (primed on Unlock for iOS Safari). "Broadcast my phone's GPS" toggle for pre-Bouncie operation. |
| `/admin` | Owner | Drivers, NoMans pin, service-area bounds, capacity, online/offline toggle, push alerts on/off, today's rides. |

## API map

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/ping` | POST · DELETE | POST creates pickup + dropoff stops (linked by `rideId`) + dispatches alerts. DELETE `?stopId=` is passenger self-cancel — clears both legs from the queue (409 if already picked up). | none (stopId is the capability token) |
| `/api/state` | GET | Public feed: shuttle position, active stops, online state, NoMans pin. `?stopId=` adds ETA. `?driver=<code>` unmasks names. | optional driver |
| `/api/stops` | POST | Two modes: `{action:"accept"\|"decline", rideId}` claims/releases a whole ride (both legs, by `rideId`); `{id, status}` advances a single stop (queued → accepted → enroute → picked-up → dropped-off / cancelled). 409 if accepting a ride another driver already claimed. | driver |
| `/api/driver/location` | POST | Driver-phone GPS broadcast | driver |
| `/api/driver/shift` | POST | Driver flips their own on/off shift | driver (real row only — legacy passcode rejected) |
| `/api/places/autocomplete` | POST | Google Places (New) Autocomplete proxy (bias = NoMans coord, 8km circle) | none (server-side key) |
| `/api/places/details` | GET | Resolve a placeId → lat/lng/label | none (server-side key) |
| `/api/bouncie/webhook` | POST | Bouncie OBD-II location push | secret (query `?secret=` or `X-Bouncie-Secret` header) |
| `/api/admin/state` | GET | Settings + drivers + today's stops + push config status | admin |
| `/api/admin/settings` | POST | Update nomans / bounds / capacity / online / alertsEnabled | admin |
| `/api/admin/drivers` | POST · PATCH · DELETE | Manage drivers (name, phone, onShift) | admin |

---

## Code layout

```
app/
  layout.tsx, globals.css, icon.png      # shell + favicon
  page.tsx                                # passenger
  driver/page.tsx                         # driver
  admin/page.tsx                          # admin
  api/                                    # all route handlers
components/
  Map.tsx                                 # Leaflet map (dynamic import, no SSR)
lib/
  types.ts                                # shared types (LatLng, Stop, Driver, Settings, ServiceHours...)
  store.ts                                # ALL persistence — KV or in-memory (state, settings, drivers, ride archive)
  auth.ts                                 # isAdmin + findDriver + findFullDriver
  geofence.ts                             # inBounds, distance, etaMinutes, defaults
  schedule.ts                             # isOnlineNow, onlineReason, DEFAULT_HOURS, parseHHMM (America/New_York)
  sms.ts                                  # phone normalization only (driver alerts are Web Push — see push.ts)
  push.ts                                 # Web Push (VAPID) sender — driver alerts on new pings
  chime.ts                                # createChimeContext + playChime (shared by /driver and /admin)
public/
  nomans-logo.png                         # brand wordmark
```

See `SETUP.md` for the owner runbook (Upstash, Twilio, Bouncie, NoMans pin, drivers).

---

## Environment variables

**Required:**
- `ADMIN_PASSCODE` — unlocks `/admin`. Bootstrap secret; can't be rotated from the UI by design.

**Recommended for production:**
- `BOUNCIE_WEBHOOK_SECRET` — verifies Bouncie webhook calls
- `KV_REST_API_URL`, `KV_REST_API_TOKEN` — auto-set when the Upstash Redis integration is added in Vercel Marketplace
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` — Web Push (VAPID) for driver alerts. Driver alerts are **push-only** (no SMS). Generate a key pair with `npx web-push generate-vapid-keys`; `VAPID_SUBJECT` is a `mailto:` URL.

**Optional escape hatches:**
- `DRIVER_PASSCODE` — legacy single shared driver code; useful as skeleton key if every driver loses their NM-code
- `SHUTTLE_VEHICLE_ID` — Bouncie VIN/IMEI filter so other vehicles in the same account are ignored
- `GOOGLE_PLACES_API_KEY` — server-side key for `/api/places/*` proxies; lights up the address-search input in `/admin` → NoMans pin. Falls back gracefully when absent.

Without KV the app still runs — state lives in process memory and dies on serverless cold starts. Without the VAPID keys the app still runs — push calls silently no-op, so on-shift drivers just won't get notified (they still see the live queue when `/driver` is open).

---

## Storage model

`lib/store.ts` is the single source of truth. Three keyed namespaces in KV:

- `nomans:state:v1` — `{ shuttles[], capacity, onboard, stops[] }` (live per-van positions + fleet seat pool + active queue)
- `nomans:settings:v1` — `{ nomans, bounds, capacity, online, alertsEnabled }`
- `nomans:drivers:v1` — `Driver[]`

Pattern: read-modify-write per mutation. Concurrent writes are rare at our scale; if traffic grows, switch to per-field Redis ops or a CAS loop. **Don't split this into multiple files** — single-file abstraction is intentional.

Settings getter merges stored partials over defaults, so adding new Settings fields auto-migrates existing installs.

---

## Decisions to NOT re-litigate

1. **Bounding-box geofence** (not polygon). Polygon was considered and skipped — bounding box is enough for Oak Bluffs and is editable in `/admin`. If you ever need surgical boundaries (e.g. exclude the bridge to East Chop), add a polygon editor; until then the box is correct.
2. **Driver codes are plaintext in KV.** Auto-generated `NM-XXXXXX` (32^6 ≈ 1B combinations, no `0/O/1/I`). Not hashed. Appropriate at this scale; if you scale up by 10× consider a hash.
3. **Driver alerts are Web Push only — no SMS.** `/api/ping` fans out via `sendPushToDrivers` (`lib/push.ts`) to on-shift drivers who enabled push on `/driver`. SMS/Twilio was removed (owner asked for push, not texts); `lib/sms.ts` is now just `normalizePhone` for tap-to-call. The dispatch is awaited (push send is fast); don't re-add Twilio or `waitUntil`.
4. **Everything operational lives in KV settings**, not env vars. NoMans coordinate, geofence, capacity, online state, alerts-enabled. Env vars are for secrets and integration credentials only.
5. **Store API is async.** Don't try to make it sync again. Every consumer awaits.
6. **Brand:** logo lives at `public/nomans-logo.png` and `app/icon.png`. White card header containing the wordmark + a small tag below. Don't replace with text branding without asking the owner.
7. **Multi-shuttle, keyed by vehicle id.** `state.shuttles[]` holds one positional `ShuttleState` per van, keyed by `id` (Bouncie VIN/IMEI, or `phone:<driverId>` for phone broadcast). The Bouncie webhook and `/api/driver/location` **upsert** by id (`upsertShuttle`) so two vans on one Bouncie account don't clobber each other. Seat capacity/onboard is still a **fleet-wide pool** on `AppState` (not per-van) — `remainingCapacity()` has a TODO for that. `readState()` migrates the old singular `{ shuttle }` shape on read.

---

## Punch list (future work, not blocked on owner)

- Polygon geofence editor in `/admin` (bbox already works; only worth doing if you need surgical exclusions like the bridge to East Chop).
- Per-van seat capacity — currently a fleet-wide pool (`remainingCapacity()` TODO). Only worth it if overbooking one van becomes real.
- Driver↔vehicle mapping (`Driver.vehicleId`) so a *claimed ride's ETA* uses that driver's Bouncie van (not just nearest). Van **labels** are already done (`Settings.vehicleLabels`, owner-editable in `/admin` → Vehicles); this remaining piece is only the ETA refinement for Bouncie-claimed rides (phone-broadcast claims already use the assigned van).
- Real routing (Mapbox Directions / OpenRouteService) instead of haversine + 18 mph ETA — needs API key from owner.
- Driver "I'm stuck" affordance (still en-route, just delayed — distinct from off-shift, which already exists).

### Done

- Per-vehicle map labels — `Settings.vehicleLabels` (id→name) edited in `/admin` → Vehicles; map dots show "Van 1 / Van 2" (permanent tooltip) instead of "Combi".
- Multi-shuttle positions + ride claiming — `state.shuttles[]` keyed by vehicle id (decision #7); driver Accept/Decline claims a whole ride, other vans see it locked, passenger sees "X is on the way". Seat pool still fleet-wide.
- Passenger self-cancel — `DELETE /api/ping?stopId=` clears both legs (`rideId`-linked); 409 once picked up.
- Service hours schedule — `Settings.hours` with America/New_York evaluation, kill-switch semantics; disabled by default.
- Persistent ride archive — `nomans:rides:YYYY-MM-DD` survives state wipes; `/admin` "Today's rides" merges live + archive.
- Driver off-shift toggle — `/driver` self-service via `POST /api/driver/shift`.
- Audible-chime test button — Service status card in `/admin`. Audio extracted to `lib/chime.ts`.

---

## Owner-only blocked work

The owner needs to:
1. Survey the real NoMans coordinate (currently `41.4541, -70.5605` — approximate) and set it via `/admin` → NoMans pin → "Use my current location" at the front door.
2. Add the Upstash Redis integration in Vercel Marketplace (Storage tab → Create Database → Upstash) so state persists across cold starts.
3. Generate VAPID keys (`npx web-push generate-vapid-keys`) and set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` to enable push alerts. Each driver then taps "Enable phone alerts" on `/driver` (on iPhone: Add to Home Screen first).
4. Add per-driver phone numbers and toggle on-shift in `/admin` before texting works.

---

## How to add features

| Want to add… | Edit |
|---|---|
| A new page | `app/<route>/page.tsx` — client component, `"use client"` at top |
| A new API endpoint | `app/api/<route>/route.ts` — `runtime = "nodejs"`, `dynamic = "force-dynamic"` |
| A shared type | `lib/types.ts` |
| Anything persistent | Extend `lib/store.ts` (don't add new persistence layers) |
| Auth gate | Import from `lib/auth.ts` |
| Driver push alert | Extend `lib/push.ts` (Web Push / VAPID) |
| Brand styling | `app/globals.css` — uses CSS custom properties (`--accent`, `--panel`, etc.) |
