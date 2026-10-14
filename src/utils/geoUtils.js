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

/**
 * Cheapest reliable way to reject GPS noise without throwing away slow travel.
 * The accepted movement threshold scales with the reported fix accuracy, so a
 * ±5 m fix is trusted from 4 m onwards while a ±18 m fix needs ~14 m.
 *
 * Rejected fixes never advance the reference point, so genuine slow movement
 * still accumulates (it is simply compared against the older trusted fix).
 */
export function getMinMoveMeters(accuracyMeters) {
  const acc = Number(accuracyMeters);
  if (!Number.isFinite(acc) || acc <= 0) return 3;
  return Math.min(15, Math.max(3, acc * 0.8));
}

/**
 * Pure evaluation of one GPS fix against the previous accepted fix.
 * Returns whether the movement counts, how far it was and how fast.
 *
 * reasons: 'first-fix' | 'ok' | 'noise' | 'implausible'
 */
export function evaluateGpsFix({
  prev,
  next,
  accuracyMeters,
  reportedSpeedMs,
  maxPlausibleKmh = 220,
}) {
  const minMoveMeters = getMinMoveMeters(accuracyMeters);
  const deltaKm = calculateHaversineDistance(prev.lat, prev.lon, next.lat, next.lon);
  const deltaMeters = deltaKm * 1000;
  const timeDiffSec = Math.max(0, (next.timestamp - prev.timestamp) / 1000);

  let speedKmh;
  if (Number.isFinite(reportedSpeedMs) && reportedSpeedMs >= 0) {
    speedKmh = reportedSpeedMs * 3.6;
  } else if (timeDiffSec > 0) {
    speedKmh = (deltaKm / timeDiffSec) * 3600;
  } else {
    speedKmh = 0;
  }
  speedKmh = Math.round(speedKmh);

  if (deltaMeters < minMoveMeters) {
    return { accepted: false, reason: 'noise', deltaKm: 0, rawDeltaKm: deltaKm, speedKmh, minMoveMeters };
  }
  if (speedKmh > maxPlausibleKmh) {
    return { accepted: false, reason: 'implausible', deltaKm: 0, rawDeltaKm: deltaKm, speedKmh, minMoveMeters };
  }
  return { accepted: true, reason: 'ok', deltaKm, rawDeltaKm: deltaKm, speedKmh, minMoveMeters };
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
