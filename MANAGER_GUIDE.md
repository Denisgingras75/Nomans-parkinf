# NoMans Combi — Manager Guide

A one-page cheat sheet for running the shuttle. You manage everything from
your phone or laptop — no app to install, nothing to redeploy.

**Live site:** https://nomansdrive.com

There are three screens. You'll mostly live in the **Manager** screen.

| Screen | Who opens it | Address |
|--------|--------------|---------|
| **Passenger** | Guests | `nomansdrive.com` |
| **Driver** | On-shift drivers | `nomansdrive.com/driver` |
| **Manager** | You | `nomansdrive.com/admin` |

---

## 1. Logging in

Open **nomansdrive.com/admin** and enter your **manager code** (looks like
`MGR-XXXXXX`). Your code is created by the owner and saved on your phone after
the first login, so you normally won't retype it. You can also scan your
manager QR code to log straight in.

> Keep your code private — anyone with it can change settings.

---

## 2. Opening & closing the combi (the daily routine)

At the top of the Manager screen is **Service status**.

- **Go online** — guests can now request rides. Tap it at the start of service.
- **Take offline** — guests see "the combi is off duty" and can't ping. Tap it
  at the end of the night.

If you've set **Service hours**, the combi flips online/offline on its own
during that window — the button is just a manual override.

**Each shift, before guests start pinging:**
1. Tap **Go online**.
2. Make sure at least one driver is **on shift** (Drivers section — see below).
3. Confirm **SMS alerts** are on if you want drivers texted on each request.

---

## 3. Drivers

In the **Drivers** section you can:

- **Add a driver** — type their name + mobile number, save. The app generates a
  private login code (`NM-XXXXXX`) and a QR code for them.
- **Send them their code/QR** — they open `nomansdrive.com/driver` and enter it
  (or scan the QR). It stays logged in on their phone.
- **On shift / off shift** — flip a driver on at the start of their shift so
  they receive new-ride alerts and show up to take rides. Drivers can also flip
  themselves off from their own screen.
- **Phone number matters** — a driver with no number won't get SMS alerts.
  You'll see a 🔔 **alerts on** tag next to drivers who are fully set up.
- **Revoke** — removes a driver's code so they can no longer log in.

---

## 4. What the driver sees (so you can coach them)

When a guest pings, on-shift drivers get a **chime + screen flash** (and an SMS
if alerts are on). Each request shows up as a card with the guest's name, party
size, and any note. On a card the driver can:

- **✅ Accept & navigate** — claims the ride and opens Google Maps directions to
  the pickup. The guest immediately sees "*[driver] is on the way*."
- **📞 Call / 💬 Text** — one tap to reach the guest (phone is required when they
  ping, so there's always a number).
- **Mark en route → Picked up → Dropped off** — optional step-by-step status.
- **✓ Finished — clear** — one tap to close the whole ride and clear it from the
  queue. The guest sees "*You've arrived 🎉*."
- **Cancel ride** — cancels the request. It clears from every driver's queue and
  the guest is told "*Ride cancelled — no driver was able to take this one*,"
  with a button to ping again.

Only one driver can hold a ride at a time — once claimed, other drivers see it
locked.

---

## 5. What the guest sees

1. Opens `nomansdrive.com`, allows location.
2. Picks **To NoMans** or **From NoMans**, enters **name + phone** (both
   required), party size, optional note.
3. Taps to request → gets a live **ETA card** and watches the van move on a map.
4. Can **cancel** themselves any time before they're picked up.

Guests outside the Oak Bluffs service area are told they're out of range.

---

## 6. Keeping an eye on things

- **Top counters** — On board now · Stops today · Last GPS fix.
- **Today's rides** — a running log of every request today (live + completed),
  so you can see volume and who's riding.
- **Live GPS (Bouncie)** — confirms the van's tracker is reporting in.
- **Send test SMS** — fires a test text to on-shift drivers so you can confirm
  alerts are working before service.
- **Driver chime test** — plays the new-ride sound so a driver can confirm their
  phone volume is up.

---

## 7. Settings you can change anytime

| Setting | What it does |
|---------|--------------|
| **NoMans pin** | The restaurant's exact location (pickup/dropoff anchor + map center). |
| **Service area** | The box guests must be inside to request a ride. |
| **Capacity** | Total seats available across the fleet. |
| **Vehicles** | Name your vans (e.g. "Van 1", "Van 2") — shows on the map. |
| **Service hours** | Auto online/offline window (Eastern time). |
| **SMS alerts** | Turn driver text alerts on/off. |
| **Managers** | Add or revoke other managers. |

Changes save instantly and take effect everywhere — no redeploy.

---

## 8. Quick troubleshooting

| Problem | Check |
|---------|-------|
| Guests can't request a ride | Is it **online**? Are they inside the **service area**? |
| Driver isn't getting requests | Are they **on shift**? Is their phone **logged in**? |
| No SMS alerts | Is **SMS alerts** on, the driver **on shift**, and do they have a **phone number**? Use **Send test SMS**. |
| Driver hears no chime | Have them tap **Unlock** on their screen once (phones require a tap before they'll play sound), and use **Driver chime test**. |
| Van not on the map | Check **Live GPS (Bouncie)**; a driver can also use "**Broadcast my phone's GPS**" on their screen as a backup. |

---

*Questions or changes you can't make here (new manager codes, billing, the
Twilio/GPS setup) go to the owner.*

---

# Open / Close Checklist

*Print this page. Tap through it at the start and end of every shift.*

### ▶ OPENING (start of service)

- [ ] Open **nomansdrive.com/admin** and log in with your manager code.
- [ ] **Service status → Go online.**
- [ ] At least one driver shows **on shift** (Drivers section).
- [ ] **SMS alerts** are **on** (if you text drivers on each request).
- [ ] Tap **Send test SMS** — confirm drivers get it.
- [ ] Have each driver tap **Unlock** on their screen so the chime works.
- [ ] **Live GPS (Bouncie)** shows the van reporting in (or driver is broadcasting phone GPS).

### ■ CLOSING (end of night)

- [ ] All rides in the queue are **Finished** or **Cancelled** (queue is empty).
- [ ] **Service status → Take offline.**
- [ ] Drivers flip themselves **off shift** (or you do it in Drivers).
- [ ] Glance at **Today's rides** for the night's count.

### ⚠ IF SOMETHING'S OFF

- **Guests can't request** → check **online** + they're inside the **service area**.
- **Driver gets no requests** → check they're **on shift** and **logged in**.
- **No texts** → **SMS alerts on** + driver **on shift** + has a **phone number**.
- **No chime** → driver taps **Unlock** once; test with **Driver chime test**.
- **Van missing from map** → check **Live GPS**, or driver turns on **Broadcast my phone's GPS**.

*Anything you can't fix here → call the owner.*

