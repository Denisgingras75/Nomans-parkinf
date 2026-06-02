# NoMans Combi — Manager Guide

A one-page cheat sheet for running the shuttle. You manage everything from
your phone or laptop — no app to install, nothing to redeploy.

**Live site:** https://nomansdrive.com

There are three screens. A bar at the top of every page lets you switch
between them: **Passenger · Driver · Admin**. You'll mostly live in the
**Admin** (Manager) screen.

| Screen | Who opens it | Address |
|--------|--------------|---------|
| **Passenger** | Guests | `nomansdrive.com` |
| **Driver** | On-shift drivers | `nomansdrive.com/driver` |
| **Admin** | You | `nomansdrive.com/admin` |

---

## 1. Logging in

Open **nomansdrive.com/admin** and enter your **manager code** (looks like
`MGR-XXXXXX`). Your code is created by the owner and saved on your phone after
the first login, so you normally won't retype it. You can also scan your
manager QR code to log straight in.

> Keep your code private — anyone with it can change settings.

---

## 2. Opening & closing the combi (the daily routine)

At the top of the Admin screen is **Service status**.

- **Go online** — guests can now request rides. Tap it at the start of service.
- **Take offline** — guests see "the combi is off duty" and can't ping. Tap it
  at the end of the night.

If you've set **Service hours**, the combi flips online/offline on its own
during that window — the button is just a manual override.

**Each shift, before guests start pinging:**
1. Tap **Go online**.
2. Make sure at least one driver is **on shift** (Drivers section — see below).
3. Confirm **Push alerts** are on, and that each driver has tapped **Enable
   phone alerts** on their own phone.
4. Tap **Send test push** to confirm alerts land.

---

## 3. Drivers

Driver alerts are **phone push notifications — no texts.** Each driver enables
them once on their own phone (see below).

In the **Drivers** section you can:

- **Add a driver** — type their name + mobile number, save. The app generates a
  private login code (`NM-XXXXXX`) and a QR code for them. (The phone number is
  used so the *guest* can call the driver — alerts themselves are push.)
- **Send them their code/QR** — they open `nomansdrive.com/driver` and enter it
  (or scan the QR). It stays logged in on their phone. (A wrong or retired code
  is now **rejected with "not recognized"** instead of half–logging them in.)
- **They pick their van** — right after the code, the driver taps **🚐 Van 1**
  or **🚐 Van 2** (the van they're physically in). This is how two phones stay
  separate, and it drives who gets pinged first (see §3a). Their pick is
  remembered; they can **Switch van** anytime from the status card.
- **Driver enables push** — on `/driver` they tap **"Enable phone alerts."**
  **On an iPhone they must first** tap Share → **Add to Home Screen**, then open
  the combi from that home-screen icon, then Enable. (Android: just tap Enable.)
- **On shift / off shift** — flip a driver on at the start of their shift. On-shift
  drivers are the **fallback** who get pinged when no van has alerts enabled (see
  §3a). You control this here from Admin; the driver's own screen now shows
  **Switch van** in place of a self shift toggle.
- **🔔 alerts on** tag — shows next to a driver who's on-shift while push alerts
  are enabled. (It means the system will *try* to push them; they still need to
  have tapped "Enable phone alerts" on their device.)
- **Revoke** — removes a driver's code so they can no longer log in.

### 3a. How a new ride is routed (Van 1 first)

When a guest pings, the app picks who to alert in this order:

1. **Van 1** — if its phone has alerts enabled and it isn't already on a ride.
2. **Van 2** — if Van 1 is busy (or off), Van 2 gets it.
3. **Both** — if both vans are busy, both are pinged so whoever frees up first
   grabs it.
4. **On-shift drivers** — if *no* van has alerts enabled, it falls back to any
   driver you've flipped **on shift**.

A van counts as "in service" the moment that phone taps **Enable phone alerts** —
so at open, make sure each van's phone has alerts on.

---

## 4. What the driver sees (so you can coach them)

When a guest pings, the alerted van/driver gets a **push notification (sound +
vibrate) even with the page closed**, plus a chime + screen flash if `/driver`
is open. Each request is a card with the guest's name, party size, any note, and
**how far the pickup is from the driver** (e.g. "📍 0.4 mi away" / "right here")
so they can judge accept vs. decline at a glance. The **newest ping is
highlighted and badged 🆕 NEW** at the top of the queue. On a card the driver can:

- **📍 View on map** — peek at where an unclaimed pickup is *without* claiming it.
- **✅ Accept & navigate** — claims the ride first, and **only opens Google Maps
  if the claim wins** (so if two drivers tap at once, the one who didn't get it
  isn't sent driving to someone else's pickup). The guest immediately sees
  "*[driver] is on the way*" along with the driver's name and a **Call driver**
  button.
- **📞 Call / 💬 Text the guest** — one tap (phone is required when guests ping,
  so there's always a number).
- **Mark en route → Picked up → Dropped off** — optional step-by-step status.
- **✓ Finished — clear** — one tap to close the whole ride and clear it from the
  queue. The guest sees "*You've arrived 🎉*."
- **Decline / Pass to another driver** — the driver picks a reason (**Too far
  away · Too busy · Busy area · Done for the day**). The ride leaves *their*
  queue and is **pushed to the next available driver**. "Done for the day" also
  flips that driver **off shift**. If every available driver passes, the ride is
  cancelled and the guest is told to ping again. (Reasons show in **Today's
  rides** so you can see why a ride bounced.)

Only one driver can hold a ride at a time — once claimed, other drivers see it
locked.

---

## 5. What the guest sees

1. Opens `nomansdrive.com`, allows location.
2. Picks **To NoMans** or **From NoMans**, enters **name + phone** (both
   required), party size, optional note.
3. Taps to request → gets a live **ETA card** and watches the van move on a map
   (the map stays zoomed to Oak Bluffs).
4. Once a driver accepts, the card shows the **driver's name + a Call driver
   button**.
5. If their driver **passes the ride** to someone else, the card shows
   "*Finding you another driver…*" instead of looking like it glitched back to
   the queue. Their queue number counts only the rides ahead that **no driver
   has picked up yet**.
6. They can **close the page and come back** — their ride status/ETA is
   remembered on their phone and reloads automatically.
7. They can **cancel** themselves any time before they're picked up.

Guests outside the Oak Bluffs service area are told they're out of range.

---

## 6. Keeping an eye on things

- **Top counters** — On board now · Stops today · Last GPS fix.
- **Today's rides** — a running log of every request today (live + completed),
  including any **decline reasons** (e.g. "↩ Mike: too far away").
- **Live GPS (Bouncie)** — confirms the van's tracker is reporting in.
- **Send test push** — sends a test notification to on-shift drivers who've
  enabled alerts, so you can confirm push works before service.
- **Driver chime test** — plays the new-ride sound so a driver can confirm their
  phone volume is up.

---

## 7. Settings you can change anytime

| Setting | What it does |
|---------|--------------|
| **NoMans pin** | The restaurant's exact location (pickup/dropoff anchor + map center). |
| **Service area** | The box guests must be inside to request a ride. Has a one-tap **"Reset to Oak Bluffs"** button that fills + saves the full-town box. |
| **Capacity** | Total seats available across the fleet. |
| **Vehicles** | Name your vans (e.g. "Van 1", "Van 2") — the labels drivers pick at sign-in and that show on the map. |
| **Service hours** | Auto online/offline window (Eastern time). |
| **Push alerts** | Turn driver push notifications on/off. |
| **Managers** | Add or revoke other managers. |

Changes save instantly and take effect everywhere — no redeploy.

---

## 8. Quick troubleshooting

| Problem | Check |
|---------|-------|
| Guests can't request a ride | Is it **online**? Are they inside the **service area**? (Tap **Reset to Oak Bluffs** if the box looks wrong.) |
| Driver code says "not recognized" | The code is wrong or was **revoked** — re-send the current `NM-` code/QR from **Drivers**. |
| Driver isn't getting requests | Did they **pick a van** and tap **Enable phone alerts** (iPhone: **Add to Home Screen** first)? New rides go to **Van 1 first** — if Van 1's phone has alerts on, Van 2 only gets pinged when Van 1 is busy. With no van's alerts on, only **on-shift** drivers are pinged. |
| No push alerts | **Push alerts** on + the van/driver tapped **Enable phone alerts** (on-shift drivers are the fallback when no van has alerts on). Use **Send test push**. |
| Driver hears no chime | Have them tap **Unlock** on their screen once (phones need a tap before they'll play sound), and use **Driver chime test**. |
| Van not on the map | Check **Live GPS (Bouncie)**; a driver can also use "**Broadcast my phone's GPS**" on their screen as a backup. |

---

*Questions or changes you can't make here (new manager codes, billing, the push
notification keys / GPS setup) go to the owner.*

---

# Open / Close Checklist

*Print this page. Tap through it at the start and end of every shift.*

### ▶ OPENING (start of service)

- [ ] Open **nomansdrive.com/admin** and log in with your manager code.
- [ ] **Service status → Go online.**
- [ ] At least one driver shows **on shift** (Drivers section).
- [ ] Each driver has logged in and **picked their van** (🚐 Van 1 / Van 2).
- [ ] **Push alerts** are **on**.
- [ ] Each driver has tapped **Enable phone alerts** on their phone (iPhone: Add
      to Home Screen first) — Van 1's phone especially, since it gets pinged first.
- [ ] Tap **Send test push** — confirm drivers get it.
- [ ] Have each driver tap **Unlock** on their screen so the chime works.
- [ ] **Live GPS (Bouncie)** shows the van reporting in (or driver is broadcasting phone GPS).

### ■ CLOSING (end of night)

- [ ] All rides in the queue are **Finished** (queue is empty).
- [ ] **Service status → Take offline.**
- [ ] Flip any **on-shift** drivers **off** in the Drivers section.
- [ ] Glance at **Today's rides** for the night's count.

### ⚠ IF SOMETHING'S OFF

- **Guests can't request** → check **online** + they're inside the **service area**.
- **Driver gets no requests** → logged in, **picked a van**, and tapped **Enable phone alerts** (Van 1 gets new rides first; Van 2 only when Van 1 is busy).
- **No push** → **Push alerts on** + driver **on shift** + alerts enabled on their phone; try **Send test push**.
- **No chime** → driver taps **Unlock** once; test with **Driver chime test**.
- **Van missing from map** → check **Live GPS**, or driver turns on **Broadcast my phone's GPS**.

*Anything you can't fix here → call the owner.*
