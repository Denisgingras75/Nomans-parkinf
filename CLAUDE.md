# NoMans Combi — Project Brief

On-demand "ping for pickup" shuttle dispatch for **NoMans Restaurant**,
Oak Bluffs, Martha's Vineyard. Guests open the site on a phone, tap a
button to request the combi, and the on-shift driver gets an SMS plus a
live queue on a dashboard. Live at **https://nomansdrive.com**
(Vercel project `nomans-parkinf`, `nomans-parkinf.vercel.app` still
resolves as an alias). Owner manages everything from `/admin`
without redeploying.

Stack: Next.js 14 (App Router) · React 18 · Leaflet · Vercel KV
(Upstash Redis) · Twilio SMS · Bouncie OBD-II webhook for live GPS.
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
| `/admin` | Owner | Drivers, NoMans pin, service-area bounds, capacity, online/offline toggle, SMS alerts on/off, today's rides. |

## API map

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/ping` | POST · DELETE | POST creates pickup + dropoff stops (linked by `rideId`) + dispatches alerts. DELETE `?stopId=` is passenger self-cancel — clears both legs from the queue (409 if already picked up). | none (stopId is the capability token) |
| `/api/state` | GET | Public feed: shuttle position, active stops, online state, NoMans pin. `?stopId=` adds ETA. `?driver=<code>` unmasks names. | optional driver |
| `/api/stops` | POST | Advance a stop's status (queued → enroute → picked-up → dropped-off / cancelled). Adjusts on-board count. | driver |
| `/api/driver/location` | POST | Driver-phone GPS broadcast | driver |
| `/api/driver/shift` | POST | Driver flips their own on/off shift | driver (real row only — legacy passcode rejected) |
| `/api/places/autocomplete` | POST | Google Places (New) Autocomplete proxy (bias = NoMans coord, 8km circle) | none (server-side key) |
| `/api/places/details` | GET | Resolve a placeId → lat/lng/label | none (server-side key) |
| `/api/bouncie/webhook` | POST | Bouncie OBD-II location push | secret (query `?secret=` or `X-Bouncie-Secret` header) |
| `/api/admin/state` | GET | Settings + drivers + today's stops + SMS config status | admin |
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
  sms.ts                                  # Twilio sender + phone normalization
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
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` — Twilio SMS (FROM is E.164)

**Optional escape hatches:**
- `DRIVER_PASSCODE` — legacy single shared driver code; useful as skeleton key if every driver loses their NM-code
- `SHUTTLE_VEHICLE_ID` — Bouncie VIN/IMEI filter so other vehicles in the same account are ignored
- `TWILIO_BASE_URL` — override Twilio API endpoint (default `https://api.twilio.com`); used to mock in tests
- `GOOGLE_PLACES_API_KEY` — server-side key for `/api/places/*` proxies; lights up the address-search input in `/admin` → NoMans pin. Falls back gracefully when absent.

Without KV the app still runs — state lives in process memory and dies on serverless cold starts. Without Twilio the app still runs — SMS calls silently no-op.

---

## Storage model

`lib/store.ts` is the single source of truth. Three keyed namespaces in KV:

- `nomans:state:v1` — `{ shuttle, stops[] }` (live position + active queue)
- `nomans:settings:v1` — `{ nomans, bounds, capacity, online, alertsEnabled }`
- `nomans:drivers:v1` — `Driver[]`

Pattern: read-modify-write per mutation. Concurrent writes are rare at our scale; if traffic grows, switch to per-field Redis ops or a CAS loop. **Don't split this into multiple files** — single-file abstraction is intentional.

Settings getter merges stored partials over defaults, so adding new Settings fields auto-migrates existing installs.

---

## Decisions to NOT re-litigate

1. **Bounding-box geofence** (not polygon). Polygon was considered and skipped — bounding box is enough for Oak Bluffs and is editable in `/admin`. If you ever need surgical boundaries (e.g. exclude the bridge to East Chop), add a polygon editor; until then the box is correct.
2. **Driver codes are plaintext in KV.** Auto-generated `NM-XXXXXX` (32^6 ≈ 1B combinations, no `0/O/1/I`). Not hashed. Appropriate at this scale; if you scale up by 10× consider a hash.
3. **SMS dispatch is awaited**, not fire-and-forget. Each Twilio call has a 2.5s timeout via `AbortController`. Don't add `@vercel/functions` `waitUntil` — overkill for this load.
4. **Everything operational lives in KV settings**, not env vars. NoMans coordinate, geofence, capacity, online state, alerts-enabled. Env vars are for secrets and integration credentials only.
5. **Store API is async.** Don't try to make it sync again. Every consumer awaits.
6. **Brand:** logo lives at `public/nomans-logo.png` and `app/icon.png`. White card header containing the wordmark + a small tag below. Don't replace with text branding without asking the owner.
7. **One shuttle assumption.** The store treats `state.shuttle` as singular. Multi-shuttle support would require keying state by shuttle ID — that's a real refactor, not a quick fix.

---

## Punch list (future work, not blocked on owner)

- Polygon geofence editor in `/admin` (bbox already works; only worth doing if you need surgical exclusions like the bridge to East Chop).
- Multi-shuttle support (see decision #7).
- Real routing (Mapbox Directions / OpenRouteService) instead of haversine + 18 mph ETA — needs API key from owner.
- Driver "I'm stuck" affordance (still en-route, just delayed — distinct from off-shift, which already exists).

### Done

- Service hours schedule — `Settings.hours` with America/New_York evaluation, kill-switch semantics; disabled by default.
- Persistent ride archive — `nomans:rides:YYYY-MM-DD` survives state wipes; `/admin` "Today's rides" merges live + archive.
- Driver off-shift toggle — `/driver` self-service via `POST /api/driver/shift`.
- Audible-chime test button — Service status card in `/admin`. Audio extracted to `lib/chime.ts`.

---

## Owner-only blocked work

The owner needs to:
1. Survey the real NoMans coordinate (currently `41.4541, -70.5605` — approximate) and set it via `/admin` → NoMans pin → "Use my current location" at the front door.
2. Add the Upstash Redis integration in Vercel Marketplace (Storage tab → Create Database → Upstash) so state persists across cold starts.
3. Buy a Twilio phone number and set the three `TWILIO_*` env vars to enable SMS alerts.
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
| SMS message | Extend `lib/sms.ts` (Twilio REST, no SDK) |
| Brand styling | `app/globals.css` — uses CSS custom properties (`--accent`, `--panel`, etc.) |
