const STORAGE_KEY_TRIPS = 'kilofare_saved_trips';
const STORAGE_KEY_ACTIVE = 'kilofare_active_session';

/**
 * Retrieves saved trips from localStorage.
 * Never fabricates records: a fresh install starts with an empty history.
 */
export function getSavedTrips() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TRIPS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('Failed to parse saved trips from storage:', err);
    return [];
  }
}

/**
 * Strips route geometry (the heaviest field) from the oldest records until the
 * payload is likely to fit, so a full storage quota degrades map previews
 * instead of silently throwing away the whole history.
 */
function buildDegradedPayload(trips) {
  return trips.map((trip, index) => {
    // Keep the newest ~10 trips intact, drop geometry from the rest.
    if (index < 10) return trip;
    return { ...trip, routeCoordinates: [] };
  });
}

/**
 * Saves trips array to localStorage, degrading gracefully on quota errors.
 * Returns true when every record was stored with its full route geometry.
 */
export function persistSavedTrips(trips) {
  const list = Array.isArray(trips) ? trips : [];
  try {
    localStorage.setItem(STORAGE_KEY_TRIPS, JSON.stringify(list));
    return true;
  } catch (err) {
    console.warn('Full trip payload did not fit in storage, degrading route data:', err);
    try {
      localStorage.setItem(STORAGE_KEY_TRIPS, JSON.stringify(buildDegradedPayload(list)));
      return false;
    } catch (err2) {
      console.error('Failed to persist trips even without route geometry:', err2);
      return false;
    }
  }
}

/**
 * Retrieves the in-progress (or stopped-but-unsaved) trip session, if any.
 * Used to rebuild duration / distance / fare after a page refresh.
 */
export function getActiveSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ACTIVE);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (err) {
    console.warn('Failed to load active trip session:', err);
    return null;
  }
}

/**
 * Persists the current trip session. Pass null/undefined to clear it.
 */
export function persistActiveSession(sessionData) {
  try {
    if (!sessionData) {
      localStorage.removeItem(STORAGE_KEY_ACTIVE);
      return;
    }
    localStorage.setItem(STORAGE_KEY_ACTIVE, JSON.stringify(sessionData));
  } catch (err) {
    // A session snapshot is best-effort: never let it break live tracking.
    console.warn('Failed to persist active trip session:', err);
  }
}

/**
 * Clears the stored trip session.
 */
export function clearActiveSession() {
  try {
    localStorage.removeItem(STORAGE_KEY_ACTIVE);
  } catch {
    /* ignore */
  }
}
