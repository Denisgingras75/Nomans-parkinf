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
  (or scan the QR). It stays logged in on their phone.
- **Driver enables push** — on `/driver` they tap **"Enable phone alerts."**
  **On an iPhone they must first** tap Share → **Add to Home Screen**, then open
  the combi from that home-screen icon, then Enable. (Android: just tap Enable.)
- **On shift / off shift** — flip a driver on at the start of their shift so
  they receive new-ride pushes and show up to take rides. Drivers can also flip
  themselves off from their own screen.
- **🔔 alerts on** tag — shows next to a driver who's on-shift while push alerts
  are enabled. (It means the system will *try* to push them; they still need to
  have tapped "Enable phone alerts" on their device.)
- **Revoke** — removes a driver's code so they can no longer log in.

---

## 4. What the driver sees (so you can coach them)

When a guest pings, on-shift drivers get a **push notification (sound + vibrate)
even with the page closed**, plus a chime + screen flash if `/driver` is open.
Each request is a card with the guest's name, party size, and any note. The
**newest ping is highlighted and badged 🆕 NEW** at the top of the queue. On a
card the driver can:

- **✅ Accept & navigate** — claims the ride and opens Google Maps directions to
  the pickup. The guest immediately sees "*[driver] is on the way*" along with
  the driver's name and a **Call driver** button.
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
5. They can **close the page and come back** — their ride status/ETA is
   remembered on their phone and reloads automatically.
6. They can **cancel** themselves any time before they're picked up.

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
| **Vehicles** | Name your vans (e.g. "Van 1", "Van 2") — shows on the map. |
| **Service hours** | Auto online/offline window (Eastern time). |
| **Push alerts** | Turn driver push notifications on/off. |
| **Managers** | Add or revoke other managers. |

Changes save instantly and take effect everywhere — no redeploy.

---

## 8. Quick troubleshooting

| Problem | Check |
|---------|-------|
| Guests can't request a ride | Is it **online**? Are they inside the **service area**? (Tap **Reset to Oak Bluffs** if the box looks wrong.) |
| Driver isn't getting requests | Are they **on shift**? Logged in? Did they tap **Enable phone alerts** (and on iPhone, **Add to Home Screen** first)? |
| No push alerts | **Push alerts** on + driver **on shift** + they tapped **Enable phone alerts**. Use **Send test push**. |
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
- [ ] **Push alerts** are **on**.
- [ ] Each driver has tapped **Enable phone alerts** on their phone (iPhone: Add
      to Home Screen first).
- [ ] Tap **Send test push** — confirm drivers get it.
- [ ] Have each driver tap **Unlock** on their screen so the chime works.
- [ ] **Live GPS (Bouncie)** shows the van reporting in (or driver is broadcasting phone GPS).

### ■ CLOSING (end of night)

- [ ] All rides in the queue are **Finished** (queue is empty).
- [ ] **Service status → Take offline.**
- [ ] Drivers flip themselves **off shift** (or you do it in Drivers).
- [ ] Glance at **Today's rides** for the night's count.

### ⚠ IF SOMETHING'S OFF

- **Guests can't request** → check **online** + they're inside the **service area**.
- **Driver gets no requests** → on **shift**, logged in, and tapped **Enable phone alerts**.
- **No push** → **Push alerts on** + driver **on shift** + alerts enabled on their phone; try **Send test push**.
- **No chime** → driver taps **Unlock** once; test with **Driver chime test**.
- **Van missing from map** → check **Live GPS**, or driver turns on **Broadcast my phone's GPS**.

*Anything you can't fix here → call the owner.*
