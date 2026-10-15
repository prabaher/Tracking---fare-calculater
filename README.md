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

## 📍 GPS & distance (anti-drift odometer)

All GPS decisions live in one place — `createGpsOdometer()` in `src/utils/geoUtils.js` — and the
UI only reacts to its verdicts. A fix is evaluated in this order:

| # | Rule | Behaviour |
| --- | --- | --- |
| 1 | **Accuracy gate** | A fix worse than **±30 m** (`maxAccuracyMeters`) is rejected outright — never measured with, never used as the reference point. The status shows `Locating...` until a usable fix arrives. |
| 2 | **Ordering gate** | Duplicate, out-of-order and >5 Hz burst fixes are dropped, so a late fix can never re-measure ground already counted. |
| 3 | **Position smoothing** | Each candidate is blended with the previous accepted position (`α = 0.5`), which removes most positional jitter before any distance is computed. |
| 4 | **Movement floor** | `max(accuracy × 0.6 + 3 m, 1.2 km/h × interval, accuracy × 0.06 × interval)`, using the **best accuracy seen in the run** and the real gap between fixes. A ±5 m receiver at 1 Hz needs 6 m; a ±24 m receiver needs ~17 m. |
| 5 | **Plausibility** | Movement faster than `max(220 km/h, reported speed × 2.5)` is treated as a GPS relocation: it is **not billed**, but the odometer re-baselines so tracking recovers instead of freezing. |
| 6 | **Stale-signal reset** | After a **60 s** gap the reference point is dropped, so the re-acquired fix starts a new segment and adds **zero** distance instead of a phantom jump. |

Rejected fixes never advance the reference point and never touch the accumulated distance, so the
fare cannot absorb GPS noise. Because the reference point is *kept* on rejection, genuine slow
movement still accumulates: it is compared against the last trusted fix until it clears the floor.

Other tracking rules:

- `navigator.geolocation.watchPosition` with `enableHighAccuracy: true`, `maximumAge: 1000`,
  `timeout: 15000`. A timeout only reports an error — the watch keeps running and the accumulated
  distance is never reset.
- The first measured fix of a trip (or after a resume / stale reset) is a **baseline** and
  contributes exactly zero distance.
- Pausing, resuming, stopping and resetting all start a fresh measurement segment, so movement
  during a pause is never charged and the first fix after a resume adds nothing.
- Fixes that arrive after a stop / pause / reset are ignored.
- **Fare is always `validated distance × rate`** — computed in a single place from the same
  distance the meter displays, so no screen can price a different value.

### Verification

`npm run test:logic` drives the real odometer through the drift scenarios (stationary jitter, slow
systematic drift, noise, genuine travel, slow traffic, signal loss, pause/resume/stop, inaccurate
fixes, duplicates, teleports) and asserts both the distance **and** the fare stay consistent.

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
npm run test:logic # dependency-free checks for the timer + GPS + fare maths
```
