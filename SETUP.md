# Setup — owner steps, in order

These are the things only the owner can do. ~15 min if you have a Twilio account ready.

The app deploys without any of this — it just won't persist state and won't text drivers. Do these in order; you can stop after step 2 and have a working PWA, or stop after step 3 and have a working PWA with SMS.

## 1. Admin passcode (required) — 1 min

Vercel project → Settings → Environment Variables → Add:

```
ADMIN_PASSCODE = something-only-you-know
```

Production scope. Redeploy. This unlocks `/admin`.

## 2. Upstash Redis (recommended) — 3 min

Without this the queue and settings die on every serverless cold start. Free tier is plenty.

Vercel project → Storage → Create Database → **Upstash Redis** (under Marketplace). Click Connect. Vercel auto-sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`. Redeploy.

Verify: `/admin` should let you save a setting (e.g. capacity) and have it survive a refresh.

## 3. Twilio SMS (recommended) — 5 min

Drivers don't get pinged without this.

1. twilio.com → buy a US local number. ~$1/month + $0.0079 per SMS. A busy Saturday is maybe 30 texts → $0.24.
2. Twilio Console → Account Info → copy **Account SID** and **Auth Token**.
3. Vercel env vars:

```
TWILIO_ACCOUNT_SID = AC...
TWILIO_AUTH_TOKEN  = ...
TWILIO_FROM        = +15085551234   (the number you bought, E.164 format)
```

Redeploy. `/admin` "SMS alerts" toggle should now enable.

## 4. Bouncie webhook (recommended once dongle is installed) — 3 min

Until the OBD-II dongle is in the combi, drivers can hit "Broadcast my phone's GPS" on `/driver`. That's fine for opening week. When you add Bouncie:

1. Make up a long random string. Set in Vercel:

```
BOUNCIE_WEBHOOK_SECRET = whatever-long-random-string
```

2. Bouncie Developer Portal → Webhooks → add:

```
URL: https://nomansdrive.com/api/bouncie/webhook?secret=<same-string>
Events: location
```

3. Optional — if you have other Bouncie vehicles on the same account, also set:

```
SHUTTLE_VEHICLE_ID = <VIN or IMEI of the combi>
```

So pickups from the wrong vehicle are ignored.

## 5. NoMans pin — 30 sec (any time) or 2 min on-site

Three ways to set it, in order of accuracy:

1. **Address search (when `GOOGLE_PLACES_API_KEY` is set — see step 7).** `/admin` → NoMans pin → Search field → type "Nomans Oak Bluffs" → pick the suggestion → Save.
2. **On-site current location.** At the bar's front door, `/admin` → NoMans pin → **Use my current location** → Save. Most precise.
3. **Manual paste.** Lat/lng from Google Maps → paste into the two fields → Save.

## 6. Add drivers — 1 min per driver

`/admin` → Drivers → enter name + phone (E.164 like `+15085551234`) → Add. Each driver gets an `NM-XXXXXX` code that's their `/driver` passcode. Text them the code.

Flip them On shift when they start their shift; flip back when they leave. Only on-shift drivers with a phone number get SMS.

## 7. Google Places API (optional) — 1 min

Lights up address search inside `/admin` → NoMans pin so you can pick the bar's coord by name. Without this, the lat/lng + "Use my current location" buttons still work.

In Vercel env vars:

```
GOOGLE_PLACES_API_KEY = <key from Google Cloud Console, restricted to "Places API (New)">
```

Restrict the key by API (Places API only) and by HTTP referrer or IP. The key never leaves the server — Next.js API routes (`/api/places/autocomplete`, `/api/places/details`) proxy it. Cost: ~$17/1000 sessions, trivial at shuttle scale.

## What "working" looks like end-to-end

- A guest opens the deployed URL on their phone → taps Request Pickup → sees ETA card.
- On-shift drivers' phones light up with an SMS within ~3s.
- The driver opens `/driver`, unlocks with their NM code, sees the pickup in the queue, taps Mark en route → Picked up.
- `/admin` shows the ride in "Today's rides" and decrements the on-board count when the dropoff completes.

If any of that breaks, check `/admin` → Service status — the row tells you whether SMS is configured, whether alerts are enabled, and last GPS time.
