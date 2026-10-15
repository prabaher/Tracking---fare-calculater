// Earth's radius in kilometers for Haversine calculation
export const EARTH_RADIUS_KM = 6371;

// In-memory cache for reverse geocoding results
const geocodeCache = new Map();

/**
 * Automatically resolves human-readable location from latitude & longitude
 * Uses OpenStreetMap Nominatim with fast 3.5s timeout and fallback to GPS coordinates
 */
export async function reverseGeocodeCoords(lat, lon) {
  if (typeof lat !== 'number' || typeof lon !== 'number') return '';
  const cacheKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey);
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
      {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
        },
      }
    );
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const addr = data.address || {};
      const road = addr.road || addr.pedestrian || addr.suburb || addr.neighbourhood || addr.residential;
      const locality = addr.suburb || addr.city_district || addr.locality || addr.neighbourhood;
      const city = addr.city || addr.town || addr.village || addr.state_district;

      const parts = [];
      if (road) parts.push(road);
      if (locality && !parts.includes(locality)) parts.push(locality);
      if (city && !parts.includes(city)) parts.push(city);

      let result = '';
      if (parts.length > 0) {
        result = parts.join(', ');
      } else if (data.display_name) {
        result = data.display_name.split(',').slice(0, 3).map((s) => s.trim()).join(', ');
      }

      if (result) {
        geocodeCache.set(cacheKey, result);
        return result;
      }
    }
  } catch (err) {
    console.warn('Geocoding notice:', err);
  }

  const fallback = `GPS (${lat.toFixed(4)}, ${lon.toFixed(4)})`;
  geocodeCache.set(cacheKey, fallback);
  return fallback;
}

/**
 * Calculates distance between two GPS coordinates using the Haversine formula
 */
export function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const radLat1 = (lat1 * Math.PI) / 180;
  const radLat2 = (lat2 * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(radLat1) * Math.cos(radLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c; // Distance in kilometers
}

/**
 * Formats elapsed seconds into HH:MM:SS
 */
export function formatDuration(totalSeconds) {
  const sec = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;

  const pad = (num) => String(num).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Formats elapsed seconds into duration with 's' suffix matching reference: "01:06:14 s"
 */
export function formatDurationWithUnit(totalSeconds) {
  return `${formatDuration(totalSeconds)} s`;
}

/**
 * Format currency in Indian Rupees format (₹)
 */
export function formatCurrency(amount) {
  const num = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

/**
 * Groups an array of trips by date header (e.g. 'Oct 09, 2026')
 */
export function groupTripsByDate(trips) {
  const groups = {};
  trips.forEach((trip) => {
    const key = trip.dateGroup || trip.date || 'Recent Trips';
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(trip);
  });
  return groups;
}

/* ------------------------------------------------------------------ *
 * GPS odometer
 *
 * The odometer owns every decision about a GPS fix, so the rules live in one
 * place instead of being scattered through the tracking UI:
 *
 *  1. Accuracy gate  — a fix worse than `maxAccuracyMeters` is never measured
 *                      with (and never becomes the reference point).
 *  2. Ordering gate  — stale / duplicate / out-of-order fixes are dropped.
 *  3. Position noise — consecutive fixes are smoothed, which removes most of
 *                      the positional jitter before any distance is computed.
 *  4. Movement floor — the movement threshold adapts to the *recent* accuracy
 *                      (measured at start-up, not just the current fix) and to
 *                      the fix interval, so a phone lying on a table cannot
 *                      slowly manufacture kilometres, while a vehicle crawling
 *                      through traffic still accumulates its real movement.
 *  5. Plausibility   — a jump faster than any real vehicle is treated as a GPS
 *                      relocation: it is not billed, but the odometer
 *                      re-baselines so tracking recovers instead of freezing.
 *  6. Stale reset    — after a long signal loss the reference point is dropped,
 *                      so the re-acquired fix can never create a phantom jump.
 *
 * Rejected fixes never advance the reference point and never touch the
 * accumulated distance, so noise cannot leak into the fare.
 */

export const GPS_ACCURACY_LIMIT_METERS = 30;
const MAX_PLAUSIBLE_KMH = 220;
const MIN_AVG_SPEED_KMH = 1.2;
const MIN_MOVE_METERS = 3;
const STALE_GAP_MS = 60000;
const SMOOTHING_ALPHA = 0.5;
const MAX_FIXES_PER_SECOND = 5;

// Mobile-friendly watch options: request the most accurate fix available, allow
// the browser to reuse a fix up to a second old instead of forcing a fresh (and
// noisier) read on every tick, and give a cold GPS start time to answer. A
// timeout only reports an error — the watch keeps running and the accumulated
// distance is never reset.
export const GPS_TRACKING_OPTIONS = Object.freeze({
  enableHighAccuracy: true,
  maximumAge: 1000,
  timeout: 15000,
});

function isValidFix(fix) {
  return Boolean(
    fix &&
      Number.isFinite(fix.lat) &&
      Number.isFinite(fix.lon) &&
      Math.abs(fix.lat) <= 90 &&
      Math.abs(fix.lon) <= 180
  );
}

/**
 * Linear interpolation between two positions at `t` (0 = previous, 1 = next).
 * Used by the odometer's smoothing pass.
 */
export function interpolatePosition(prev, next, t) {
  if (!isValidFix(prev)) return { lat: next.lat, lon: next.lon };
  return {
    lat: prev.lat + (next.lat - prev.lat) * t,
    lon: prev.lon + (next.lon - prev.lon) * t,
  };
}

/**
 * Deterministic pseudo-random source for the GPS simulations (no Math.random,
 * so every run of the checks produces the same numbers).
 */
export function createSeededRandom(seed = 1) {
  let state = seed >>> 0 || 1;
  return function nextRandom() {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}

/**
 * Movement (in meters) that is large enough to be real rather than noise.
 *
 * Scales with the best accuracy seen so far — a ±5 m receiver is trusted from
 * 3 m onwards while a ±24 m receiver needs ~10 m — and with the gap between
 * fixes, so 1 Hz jitter is filtered more aggressively than 10 s samples. Slow
 * genuine travel is still counted because a rejected fix leaves the reference
 * point untouched: the movement accumulates until it clears the floor.
 */
export function computeMovementFloorMeters({
  accuracyMeters,
  bestAccuracyMeters,
  elapsedMs,
}) {
  const acc = Number(accuracyMeters);
  const best = Number(bestAccuracyMeters);
  const hasAcc = Number.isFinite(acc) && acc > 0;
  const hasBest = Number.isFinite(best) && best > 0;
  const reference = hasAcc ? Math.min(acc, hasBest ? best : acc) : hasBest ? best : 10;

  const elapsedSec = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs / 1000 : 1;
  const noiseMeters = reference * 0.6 + MIN_MOVE_METERS;
  const driftPerSecond = Math.min(1.5, reference * 0.06);
  const travelMeters = (MIN_AVG_SPEED_KMH / 3.6) * elapsedSec;

  return Math.max(noiseMeters, travelMeters, driftPerSecond * elapsedSec);
}

/**
 * Creates an odometer. `defaults` can override the configurable thresholds
 * (accuracy limit, plausibility ceiling, smoothing factor, stale gap).
 *
 * Call `ingest(fix)` for every raw GPS fix. The returned state is either
 * `{ accepted: false, reason }` or `{ accepted: true, position, deltaKm, ... }`.
 * `snapshot()` / `restore()` let the odometer survive a pause, a refresh or a
 * trip restart without ever carrying phantom distance across.
 */
export function createGpsOdometer(defaults = {}) {
  const config = {
    maxAccuracyMeters: GPS_ACCURACY_LIMIT_METERS,
    maxPlausibleKmh: MAX_PLAUSIBLE_KMH,
    minMoveMeters: MIN_MOVE_METERS,
    smoothingAlpha: SMOOTHING_ALPHA,
    staleGapMs: STALE_GAP_MS,
    maxFixesPerSecond: MAX_FIXES_PER_SECOND,
    ...defaults,
  };

  let anchor = null; // last position used as the distance reference
  let lastAccepted = null; // last smoothed, accepted position
  let lastTimestamp = null; // timestamp of the last fix the odometer measured
  let bestAccuracyMeters = null; // best accuracy observed in this run
  let currentAccuracyMeters = null;
  let lastResult = { accepted: false, reason: 'idle', deltaKm: 0 };
  let rejected = 0;
  let accepted = 0;

  function result(payload) {
    lastResult = {
      accuracyMeters: currentAccuracyMeters,
      bestAccuracyMeters,
      acceptedCount: accepted,
      rejectedCount: rejected,
      ...payload,
    };
    return lastResult;
  }

  function ingest(fix) {
    const accuracy = Number(fix && fix.accuracy);
    currentAccuracyMeters = Number.isFinite(accuracy) && accuracy > 0 ? accuracy : null;

    if (!isValidFix(fix)) {
      rejected += 1;
      return result({ accepted: false, reason: 'invalid', deltaKm: 0 });
    }
    if (currentAccuracyMeters !== null && currentAccuracyMeters > config.maxAccuracyMeters) {
      rejected += 1;
      return result({ accepted: false, reason: 'low-accuracy', deltaKm: 0 });
    }

    const timestamp = Number.isFinite(fix.timestamp) ? fix.timestamp : Date.now();

    // Duplicate / out-of-order fixes must never move the odometer.
    if (lastTimestamp !== null && timestamp === lastTimestamp) {
      rejected += 1;
      return result({ accepted: false, reason: 'duplicate', deltaKm: 0 });
    }
    if (lastTimestamp !== null && timestamp < lastTimestamp) {
      rejected += 1;
      return result({ accepted: false, reason: 'out-of-order', deltaKm: 0 });
    }
    if (lastTimestamp !== null && timestamp - lastTimestamp < 1000 / config.maxFixesPerSecond) {
      rejected += 1;
      return result({ accepted: false, reason: 'too-soon', deltaKm: 0 });
    }

    const raw = { lat: fix.lat, lon: fix.lon };

    // No reference yet (trip start, resume, or after a lost signal): this fix
    // establishes the baseline and contributes exactly zero distance.
    if (!anchor) {
      anchor = raw;
      lastAccepted = raw;
      lastTimestamp = timestamp;
      bestAccuracyMeters = currentAccuracyMeters ?? bestAccuracyMeters;
      accepted += 1;
      return result({
        accepted: true,
        reason: 'baseline',
        deltaKm: 0,
        position: { lat: raw.lat, lon: raw.lon, timestamp },
        anchor: { lat: anchor.lat, lon: anchor.lon },
        movementMeters: 0,
        movementFloorMeters: 0,
        speedKmh: 0,
        reportedSpeedKmh: Number.isFinite(fix.speed) && fix.speed >= 0 ? Math.round(fix.speed * 3.6) : null,
      });
    }

    // Signal lost for a while: forget the reference point so the distance we
    // could not measure during the outage is not billed as a phantom jump.
    if (timestamp - lastTimestamp > config.staleGapMs) {
      anchor = null;
      lastAccepted = null;
      lastTimestamp = timestamp;
      bestAccuracyMeters = currentAccuracyMeters ?? bestAccuracyMeters;
      anchor = raw;
      lastAccepted = raw;
      accepted += 1;
      return result({
        accepted: true,
        reason: 'gap-reset',
        deltaKm: 0,
        position: { lat: raw.lat, lon: raw.lon, timestamp },
        anchor: { lat: anchor.lat, lon: anchor.lon },
        movementMeters: 0,
        movementFloorMeters: 0,
        speedKmh: 0,
        reportedSpeedKmh: null,
      });
    }

    // Smoothed candidate position (removes a good part of the positional jitter).
    const alpha = config.smoothingAlpha;
    const smoothed = interpolatePosition(lastAccepted, raw, alpha);

    const elapsedMs = timestamp - lastTimestamp;
    const elapsedSec = Math.max(elapsedMs, 1) / 1000;
    const movementMeters = calculateHaversineDistance(anchor.lat, anchor.lon, smoothed.lat, smoothed.lon) * 1000;
    const movementFloorMeters = computeMovementFloorMeters({
      accuracyMeters: currentAccuracyMeters,
      bestAccuracyMeters,
      elapsedMs,
    });
    const reportedSpeedKmh =
      Number.isFinite(fix.speed) && fix.speed >= 0 ? Math.round(fix.speed * 3.6) : null;
    const speedKmh = Math.round((movementMeters / 1000 / elapsedSec) * 3600);
    const plausibilityKmh = Math.max(
      config.maxPlausibleKmh,
      reportedSpeedKmh !== null ? reportedSpeedKmh * 2.5 : 0
    );

    lastTimestamp = timestamp;

    if (movementMeters < movementFloorMeters) {
      rejected += 1;
      return result({
        accepted: false,
        reason: 'noise',
        deltaKm: 0,
        movementMeters,
        movementFloorMeters,
        speedKmh,
        reportedSpeedKmh,
      });
    }

    if (speedKmh > plausibilityKmh) {
      // GPS relocation: re-baseline from here, never bill the jump.
      anchor = smoothed;
      lastAccepted = smoothed;
      rejected += 1;
      return result({
        accepted: false,
        reason: 'implausible',
        deltaKm: 0,
        movementMeters,
        movementFloorMeters,
        speedKmh,
        reportedSpeedKmh,
      });
    }

    const deltaKm = movementMeters / 1000;
    anchor = smoothed;
    lastAccepted = smoothed;
    bestAccuracyMeters = currentAccuracyMeters ?? bestAccuracyMeters;
    accepted += 1;

    return result({
      accepted: true,
      reason: 'ok',
      deltaKm,
      position: { lat: smoothed.lat, lon: smoothed.lon, timestamp },
      anchor: { lat: anchor.lat, lon: anchor.lon },
      movementMeters,
      movementFloorMeters,
      speedKmh,
      reportedSpeedKmh,
    });
  }

  /**
   * Starts a new measurement segment (trip start, resume after a pause, or
   * restart). `position` (optional) is adopted as the new baseline and adds no
   * distance — this is what keeps paused movement out of the total.
   */
  function beginSegment(position = null) {
    anchor = isValidFix(position) ? { lat: position.lat, lon: position.lon } : null;
    lastAccepted = anchor ? { ...anchor } : null;
    lastTimestamp = null;
    if (isValidFix(position) && Number.isFinite(position.accuracy) && position.accuracy > 0) {
      bestAccuracyMeters = position.accuracy;
    }
    lastResult = { accepted: false, reason: 'segment-begin', deltaKm: 0 };
    return lastResult;
  }

  function snapshot() {
    return {
      anchor: anchor ? { ...anchor } : null,
      lastAccepted: lastAccepted ? { ...lastAccepted } : null,
      lastTimestamp,
      bestAccuracyMeters,
      acceptedCount: accepted,
      rejectedCount: rejected,
    };
  }

  function restore(state) {
    if (!state || typeof state !== 'object') return snapshot();
    anchor = isValidFix(state.anchor) ? { lat: state.anchor.lat, lon: state.anchor.lon } : null;
    lastAccepted = isValidFix(state.lastAccepted)
      ? { lat: state.lastAccepted.lat, lon: state.lastAccepted.lon }
      : anchor
      ? { ...anchor }
      : null;
    lastTimestamp = Number.isFinite(state.lastTimestamp) ? state.lastTimestamp : null;
    bestAccuracyMeters = Number.isFinite(state.bestAccuracyMeters) ? state.bestAccuracyMeters : null;
    accepted = Number.isFinite(state.acceptedCount) ? state.acceptedCount : 0;
    rejected = Number.isFinite(state.rejectedCount) ? state.rejectedCount : 0;
    return snapshot();
  }

  return {
    config,
    ingest,
    beginSegment,
    snapshot,
    restore,
    getLastResult: () => lastResult,
    getAccuracyLimitMeters: () => config.maxAccuracyMeters,
  };
}

/**
 * Bounds how many route points are persisted per trip while keeping the overall
 * shape of the travelled route (uniform stride + always keep first & last).
 */
export function sampleRoute(coordinates, maxPoints = 400) {
  if (!Array.isArray(coordinates) || coordinates.length <= maxPoints) {
    return Array.isArray(coordinates) ? coordinates : [];
  }
  const stride = coordinates.length / maxPoints;
  const sampled = [];
  for (let i = 0; i < maxPoints - 1; i += 1) {
    sampled.push(coordinates[Math.floor(i * stride)]);
  }
  sampled.push(coordinates[coordinates.length - 1]);
  return sampled;
}

/**
 * Round trip route coordinates for compact storage (≈1 m precision).
 */
export function compactRouteCoordinates(coordinates, maxPoints = 400) {
  return sampleRoute(coordinates, maxPoints).map((pt) => ({
    lat: Number(pt.lat.toFixed(5)),
    lon: Number(pt.lon.toFixed(5)),
    t: Number.isFinite(pt.timestamp) ? pt.timestamp : undefined,
  }));
}

/**
 * Average speed in km/h derived from a real recorded distance and active duration.
 */
export function computeAverageSpeedKmh(distanceKm, activeSeconds) {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 0;
  if (!Number.isFinite(activeSeconds) || activeSeconds <= 0) return 0;
  return Math.round(distanceKm / (activeSeconds / 3600));
}

/**
 * Elapsed ACTIVE trip time, always derived from timestamps — never from a
 * counter. Suspending the page (screen lock, background tab, throttled timers)
 * therefore cannot make the timer drift: on wake-up the very same function
 * returns the true elapsed value. Paused time stays excluded.
 */
export function computeActiveMs({ accumulatedActiveMs, sessionStartedAt, isPaused, now }) {
  const base =
    Number.isFinite(accumulatedActiveMs) && accumulatedActiveMs > 0 ? accumulatedActiveMs : 0;
  if (isPaused || !sessionStartedAt) return base;
  return base + Math.max(0, now - sessionStartedAt);
}
