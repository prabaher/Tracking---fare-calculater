# 🚖 KiloFare — Kilometer & Fare Calculator

A mobile-first React (Vite) app that measures a trip with live browser GPS (or a manual
kilometer entry), prices it with an editable per-kilometer tariff, and keeps a local trip
history with real route maps.

Designed for a phone screen first (verified at 320 / 360 / 375 / 390 / 412 px and up), with
light & dark themes and an Android-style fixed bottom navigation.

---

## 🧭 Four sections (fixed bottom navigation)

| Section | Purpose |
| --- | --- |
| **Home** | Trip dashboard: distance, fare rate, duration, total fare, start/stop locations, Start / Pause / Resume / Stop / Save controls |
| **Distance & GPS** | Distance meter, manual distance entry, GPS accuracy / fix count / status, route location fields |
| **Fare Rate** | Price per km, quick rate shortcuts, live `Distance × Rate = Total Fare` breakdown |
| **History** | Saved trips grouped by date with route previews, per-trip delete, clear all, and a full trip detail view with an interactive map |

Switching sections never resets an active trip or interrupts tracking — all trip state lives
in one place above the screens.

---

## ⏱️ Trip timing (the important part)

Duration is **never** a counter incremented by `setInterval`. The app records timestamps for
trip start, pause, resume and stop, and derives the duration from them:

```text
active ms = accumulatedActiveMs + (Date.now() - currentSegmentStartedAt)
```

Consequences:

- Locking the phone screen, backgrounding the tab or timer throttling cannot desync the
  duration — the value is recomputed from timestamps the moment the app returns to the
  foreground (`visibilitychange` / `focus` / `pageshow`).
- Paused time is stored separately and excluded from the active duration.
- Duration keeps rendering as `HH:MM:SS`.

## 📍 GPS & distance

- Uses `navigator.geolocation.watchPosition({ enableHighAccuracy: true })`.
- Fixes worse than ±50 m accuracy are discarded.
- Movement is accepted only once it exceeds a threshold derived from the reported accuracy
  (`min(max(3, accuracy × 0.8), 15)` meters), so a stationary phone cannot slowly manufacture
  distance. Rejected fixes do **not** move the reference point, so genuine slow movement is
  still counted on the next accepted fix.
- Implausible jumps (> 220 km/h) are re-baselined instead of billed as travelled distance.
- Pausing and resuming resets the reference point, so movement during a pause is not charged.
- Fixes that arrive after a stop / pause / reset are ignored.

## 💾 Trip persistence

- Saved trips and the in-progress session are stored in `localStorage` (`kilofare_saved_trips`
  / `kilofare_active_session`); no account or backend is required.
- An active (or stopped-but-unsaved) trip is restored after a refresh, including distance,
  timestamps and route — the duration is recomputed immediately from the stored timestamps.
- Route geometry is sampled and rounded (≤ 400 points, ~1 m precision) before storage, and
  storage degrades oldest routes first if the browser quota is reached.
- History starts empty — the app never invents sample trips, addresses or routes.

## 🗺️ Route maps

Route previews on history cards and the interactive map in the trip detail view use
[Leaflet](https://leafletjs.com/) with OpenStreetMap raster tiles (free, no API key). Map data
is © OpenStreetMap contributors. If a trip has no route coordinates, the UI clearly shows a
"route unavailable" fallback instead of drawing a fake route.

## ⚠️ Mobile browser limitation

A web page cannot guarantee continuous background GPS. When the screen is locked or the
browser suspends the tab, the OS may stop delivering location updates. KiloFare keeps the
**duration** correct in that situation (it is timestamp based) and resumes GPS on return to
the foreground, but distance travelled while the page was suspended can only be recovered if
the browser delivered the fixes. True always-on background tracking would require a native
Android build with a foreground location service.

---

## 🚀 Running the project

```bash
npm run dev        # dev server
npm run dev -- --host   # test from a phone on the same network
npm run build      # production build
npm run preview    # preview the production build
npm run lint       # oxlint
npm run test:logic # dependency-free checks for the timer + GPS maths
```
