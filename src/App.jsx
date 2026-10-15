import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Navigation,
  Sun,
  Moon
} from 'lucide-react';
import './App.css';
import {
  reverseGeocodeCoords,
  formatDuration,
  formatCurrency,
  createGpsOdometer,
  GPS_TRACKING_OPTIONS,
  computeActiveMs,
  sampleRoute,
  compactRouteCoordinates,
  computeAverageSpeedKmh,
} from './utils/geoUtils';
import {
  getSavedTrips,
  persistSavedTrips,
  getActiveSession,
  persistActiveSession,
  clearActiveSession,
} from './utils/tripStorage';
import BottomNav from './components/BottomNav';
import HomeDashboard from './components/HomeDashboard';
import DistanceGpsScreen from './components/DistanceGpsScreen';
import FareRateScreen from './components/FareRateScreen';
import HistoryScreen from './components/HistoryScreen';
import TripDetailModal from './components/TripDetailModal';

export default function App() {
  // --- Navigation State ---
  const [activeTab, setActiveTab] = useState('home'); // 'home' | 'distance' | 'fare' | 'history'
  const [selectedTripDetail, setSelectedTripDetail] = useState(null);

  // --- Theme State (Soft Neomorph: Light / Dark) ---
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('kilofare_theme');
      if (saved === 'dark' || saved === 'light') return saved;
      return 'dark'; // Defaulting to sleek dark matching the mobile reference screenshots
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    try {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('kilofare_theme', theme);
    } catch {}
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  // --- Core Calculator State ---
  // A fresh session starts empty: the dashboard must never imply a trip that
  // has not happened yet.
  const [distance, setDistance] = useState(0);
  const [inputDistance, setInputDistance] = useState('0.00');
  const [rate, setRate] = useState(20);
  const [inputRate, setInputRate] = useState('20');

  // --- Reliable Timer & Tracking State ---
  const [isTracking, setIsTracking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [trackingStatus, setTrackingStatus] = useState('Ready to Track');
  const [tripStartedAt, setTripStartedAt] = useState(null); // Date / timestamp ms
  const [sessionStartedAt, setSessionStartedAt] = useState(null); // timestamp ms for current unpaused segment
  const [accumulatedActiveMs, setAccumulatedActiveMs] = useState(0); // total ms prior to current segment
  const [_pausedAt, setPausedAt] = useState(null);
  const [tripEndedAt, setTripEndedAt] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // --- GPS Telemetry & Route State ---
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [gpsPointsCount, setGpsPointsCount] = useState(0);
  const [lastCoords, setLastCoords] = useState(null);
  const [startCoords, setStartCoords] = useState(null);
  const [endCoords, setEndCoords] = useState(null);
  const [startLocation, setStartLocation] = useState('');
  const [endLocation, setEndLocation] = useState('');
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [maxSpeed, setMaxSpeed] = useState(0);
  const [gpsError, setGpsError] = useState(null);

  // --- Saved History & Persistence State ---
  const [savedTrips, setSavedTrips] = useState(() => getSavedTrips());
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveToast, setSaveToast] = useState(null); // { type: 'success' | 'error', message: string }

  // Refs for background watch and calculation
  const watchIdRef = useRef(null);
  // One odometer for the whole app: it owns the accuracy gate, the ordering
  // gate, the noise floor and the plausibility check, so no other code path can
  // add GPS noise to the trip distance.
  const odometerRef = useRef(null);
  if (odometerRef.current === null) {
    odometerRef.current = createGpsOdometer();
  }
  const accumulatedDistanceRef = useRef(0);
  // True once the current trip has captured its start point, so the start
  // address is resolved exactly once per trip.
  const startCapturedRef = useRef(false);
  const restoredSessionRef = useRef(false);
  // Guard so a GPS fix that was already queued when the trip stopped/paused/reset
  // can never keep moving the odometer after the watch was cleared.
  const trackingActiveRef = useRef(false);

  // Snapshot of everything needed to rebuild the trip after a refresh.
  // Refreshed after every render (so it is never touched during render itself).
  const sessionSnapshotRef = useRef(null);
  useEffect(() => {
    sessionSnapshotRef.current = {
      version: 1,
      isTracking,
      isPaused,
      tripStartedAt,
      sessionStartedAt,
      accumulatedActiveMs,
      pausedAt: _pausedAt,
      tripEndedAt,
      distance,
      rate,
      inputRate,
      startCoords,
      endCoords,
      startLocation,
      endLocation,
      routeCoordinates: sampleRoute(routeCoordinates, 500),
      maxSpeed,
      gpsPointsCount,
      odometer: odometerRef.current ? odometerRef.current.snapshot() : null,
      savedAt: Date.now(),
    };
  });

  // Derived Total Fare: Distance * Rate
  const totalFare = useMemo(() => {
    const validDist = Number.isFinite(distance) && distance >= 0 ? distance : 0;
    const validRate = Number.isFinite(rate) && rate >= 0 ? rate : 0;
    return validDist * validRate;
  }, [distance, rate]);

  // Save trips history whenever it changes
  useEffect(() => {
    persistSavedTrips(savedTrips);
  }, [savedTrips]);

  // Pre-detect current location on initial mount if browser geolocation is available
  useEffect(() => {
    if ('geolocation' in navigator && !startLocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          setStartCoords({ lat: latitude, lon: longitude });
          reverseGeocodeCoords(latitude, longitude).then((addr) => {
            if (addr) {
              setStartLocation((prev) => (!prev ? addr : prev));
            }
          });
        },
        () => {},
        { timeout: 4000, maximumAge: 60000 }
      );
    }
  }, []);

  // --- CRITICAL TIMER ENGINE: Reliable Timestamp Difference Calculation ---
  // Duration is always recomputed from stored timestamps (start / resume / now),
  // so phone sleep, tab suspension and timer throttling cannot desync it.
  const calculateCurrentElapsed = useCallback(() => {
    if (!tripStartedAt) return 0;
    const totalMs = computeActiveMs({
      accumulatedActiveMs,
      sessionStartedAt,
      isPaused,
      now: Date.now(),
    });
    return Math.floor(totalMs / 1000);
  }, [tripStartedAt, isPaused, sessionStartedAt, accumulatedActiveMs]);

  // Tick timer while tracking is active
  useEffect(() => {
    if (isTracking && !isPaused) {
      // Immediate sync
      setElapsedSeconds(calculateCurrentElapsed());

      const interval = setInterval(() => {
        setElapsedSeconds(calculateCurrentElapsed());
      }, 500);

      return () => clearInterval(interval);
    } else {
      setElapsedSeconds(calculateCurrentElapsed());
    }
  }, [isTracking, isPaused, calculateCurrentElapsed]);

  // High-priority visibility & wake-up handler (Phone sleep, tab suspension, app return)
  useEffect(() => {
    const handleWakeUp = () => {
      if (document.visibilityState === 'visible' || !document.hidden) {
        const trueElapsed = calculateCurrentElapsed();
        setElapsedSeconds(trueElapsed);
      }
    };

    document.addEventListener('visibilitychange', handleWakeUp);
    window.addEventListener('focus', handleWakeUp);
    window.addEventListener('pageshow', handleWakeUp);

    return () => {
      document.removeEventListener('visibilitychange', handleWakeUp);
      window.removeEventListener('focus', handleWakeUp);
      window.removeEventListener('pageshow', handleWakeUp);
    };
  }, [calculateCurrentElapsed]);

  // --- SESSION RESTORE: rebuild an in-progress or stopped-but-unsaved trip ---
  useEffect(() => {
    if (restoredSessionRef.current) return;
    restoredSessionRef.current = true;

    const session = getActiveSession();
    if (!session) return;
    if (!session.isTracking && !session.tripEndedAt) return;

    const restoredDistance = Number.isFinite(session.distance) ? session.distance : 0;
    const restoredRoute = Array.isArray(session.routeCoordinates) ? session.routeCoordinates : [];

    accumulatedDistanceRef.current = restoredDistance;
    setDistance(restoredDistance);
    setInputDistance(restoredDistance.toFixed(2));
    if (Number.isFinite(session.rate)) setRate(session.rate);
    if (typeof session.inputRate === 'string') setInputRate(session.inputRate);

    setTripStartedAt(session.tripStartedAt ?? null);
    setAccumulatedActiveMs(session.accumulatedActiveMs ?? 0);
    setTripEndedAt(session.tripEndedAt ?? null);
    setIsPaused(Boolean(session.isPaused));
    setIsTracking(Boolean(session.isTracking));
    setPausedAt(session.pausedAt ?? null);
    setSessionStartedAt(session.isPaused ? null : session.sessionStartedAt ?? null);
    setStartCoords(session.startCoords ?? null);
    setEndCoords(session.endCoords ?? null);
    setStartLocation(session.startLocation ?? '');
    setEndLocation(session.endLocation ?? '');
    setRouteCoordinates(restoredRoute);
    setMaxSpeed(session.maxSpeed ?? 0);
    setGpsPointsCount(session.gpsPointsCount ?? restoredRoute.length);
    trackingActiveRef.current = Boolean(session.isTracking) && !session.isPaused;
    setTrackingStatus(
      session.isTracking ? (session.isPaused ? 'Paused' : 'Finding Location') : 'Trip Stopped'
    );

    // Recompute the duration immediately from stored timestamps — never from a counter.
    const activeMs = computeActiveMs({
      accumulatedActiveMs: session.accumulatedActiveMs,
      sessionStartedAt: session.sessionStartedAt,
      isPaused: session.isPaused || !session.isTracking,
      now: Date.now(),
    });
    setElapsedSeconds(Math.floor(activeMs / 1000));

    if (restoredRoute.length > 0) {
      const lastPoint = restoredRoute[restoredRoute.length - 1];
      // Restore the measurement segment from the last recorded fix. The route
      // point is the smoothed, accepted position, so resuming never re-adds the
      // noise that was already filtered out.
      odometerRef.current.beginSegment({
        lat: lastPoint.lat,
        lon: lastPoint.lon,
        accuracy: session.odometer?.bestAccuracyMeters ?? undefined,
      });
      odometerRef.current.restore(session.odometer);
    }

    setSaveToast({
      type: 'warning',
      message: session.isTracking
        ? 'Recovered your active trip after the app reloaded.'
        : 'Recovered an unsaved trip — tap Save Trip to keep it.',
    });
  }, []);

  // --- Distance Manual Input Handler ---
  const handleDistanceChange = (e) => {
    if (isTracking) return;
    const value = e.target.value;
    setInputDistance(value);
    const parsed = parseFloat(value);
    if (!isNaN(parsed) && parsed >= 0) {
      setDistance(parsed);
      accumulatedDistanceRef.current = parsed;
    } else if (value.trim() === '') {
      setDistance(0);
      accumulatedDistanceRef.current = 0;
    }
    // The odometer measures movement, not totals: a manual distance must never
    // be treated as GPS travel, so its measurement segment starts fresh.
    odometerRef.current.beginSegment();
    setIsSaved(false);
  };

  const handleDistanceBlur = () => {
    if (isTracking) return;
    const parsed = parseFloat(inputDistance);
    if (isNaN(parsed) || parsed < 0) {
      setDistance(0);
      accumulatedDistanceRef.current = 0;
      setInputDistance('0.00');
    } else {
      setInputDistance(parsed.toFixed(2));
    }
  };

  // --- Rate Manual Input Handler ---
  const handleRateChange = (e) => {
    const value = e.target.value;
    setInputRate(value);
    const parsed = parseFloat(value);
    if (!isNaN(parsed) && parsed >= 0) {
      setRate(parsed);
    } else if (value.trim() === '') {
      setRate(0);
    }
  };

  const handleRateBlur = () => {
    const parsed = parseFloat(inputRate);
    if (isNaN(parsed) || parsed < 0) {
      setRate(0);
      setInputRate('0.00');
    } else {
      setInputRate(parsed.toString());
    }
  };

  const handleSelectPresetRate = (preset) => {
    setRate(preset);
    setInputRate(preset.toString());
  };

  // --- GPS Tracking Engine ---
  const startTrackingEngine = useCallback((isResuming = false) => {
    if (!('geolocation' in navigator)) {
      setTrackingStatus('GPS Unavailable');
      setGpsError('Geolocation is not supported by your browser or environment.');
      return false;
    }

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    const options = { ...GPS_TRACKING_OPTIONS };

    try {
      const id = navigator.geolocation.watchPosition(
        (position) => {
          // Ignore fixes that arrive after stop / pause / reset.
          if (!trackingActiveRef.current) return;

          const { latitude, longitude, accuracy, speed } = position.coords;
          const timestamp = position.timestamp || Date.now();
          const odometer = odometerRef.current;

          // Telemetry always reflects the raw receiver reading, even for fixes
          // the odometer rejects below.
          setGpsAccuracy(Math.round(accuracy));
          setLastCoords({ lat: latitude, lon: longitude });

          // 1. One decision point for every GPS fix (accuracy gate, ordering,
          //    smoothing, noise floor, plausibility, stale-signal recovery).
          const verdict = odometer.ingest({
            lat: latitude,
            lon: longitude,
            accuracy,
            speed,
            timestamp,
          });

          if (verdict.reason === 'low-accuracy') {
            setTrackingStatus('Finding Location');
            return;
          }

          setTrackingStatus('GPS Connected');

          const measuredPosition = verdict.position || { lat: latitude, lon: longitude, timestamp };

          // 2. The first measured fix establishes the start of the trip and
          //    contributes exactly zero distance.
          if (verdict.reason === 'baseline' || verdict.reason === 'gap-reset') {
            if (!startCapturedRef.current && !isResuming) {
              startCapturedRef.current = true;
              setStartCoords({ lat: measuredPosition.lat, lon: measuredPosition.lon });
              setStartLocation('Resolving start address...');
              reverseGeocodeCoords(measuredPosition.lat, measuredPosition.lon).then((addr) => {
                if (addr) setStartLocation(addr);
              });
              setGpsPointsCount(1);
              setRouteCoordinates([
                {
                  lat: measuredPosition.lat,
                  lon: measuredPosition.lon,
                  timestamp,
                  accuracy,
                },
              ]);
            } else if (verdict.reason === 'gap-reset') {
              // GPS was lost and came back: keep the route going without
              // inventing the distance travelled during the outage.
              setRouteCoordinates((prev) => [
                ...prev,
                { lat: measuredPosition.lat, lon: measuredPosition.lon, timestamp, accuracy },
              ]);
            }
            setEndCoords({ lat: measuredPosition.lat, lon: measuredPosition.lon });
            return;
          }

          if (!verdict.accepted) {
            // Noise, duplicate, out-of-order or implausible fixes: nothing is
            // added to the distance, the fare or the route. The odometer keeps
            // its own reference point, so slow genuine movement still counts.
            return;
          }

          if (verdict.speedKmh > 0 && verdict.speedKmh <= 180) {
            setMaxSpeed((prev) => Math.max(prev, verdict.speedKmh));
          }

          // 3. Only validated movement reaches the odometer.
          accumulatedDistanceRef.current += verdict.deltaKm;
          const newDist = accumulatedDistanceRef.current;
          setDistance(newDist);
          setInputDistance(newDist.toFixed(2));
          setGpsPointsCount((c) => c + 1);
          setEndCoords({ lat: measuredPosition.lat, lon: measuredPosition.lon });

          // Record the smoothed position so the drawn route matches the
          // measured distance.
          setRouteCoordinates((prev) => [
            ...prev,
            {
              lat: measuredPosition.lat,
              lon: measuredPosition.lon,
              timestamp,
              accuracy,
              speed: verdict.speedKmh,
            },
          ]);
        },
        (error) => {
          let message = 'Unable to acquire GPS location.';
          if (error.code === error.PERMISSION_DENIED) {
            message = 'GPS permission denied. Please allow location access in your device settings.';
            setTrackingStatus('Permission Denied');
          } else if (error.code === error.POSITION_UNAVAILABLE) {
            message = 'GPS signal unavailable. Ensure location services are enabled.';
            setTrackingStatus('GPS Unavailable');
          } else if (error.code === error.TIMEOUT) {
            message = 'GPS request timed out. Searching for satellites...';
            setTrackingStatus('Finding Location');
          } else {
            setTrackingStatus('GPS Unavailable');
          }
          setGpsError(message);
        },
        options
      );

      watchIdRef.current = id;
      return true;
    } catch (err) {
      setTrackingStatus('GPS Unavailable');
      setGpsError(err.message || 'Error initializing GPS.');
      return false;
    }
  }, []);

  // --- SESSION PERSISTENCE (throttled: at most one write every 5 s) ---
  const persistSessionNow = useCallback(
    (overrides = {}) => {
      const snapshot = sessionSnapshotRef.current;
      if (!snapshot) return;
      const merged = { ...snapshot, ...overrides };
      const hasTripData = merged.isTracking || Boolean(merged.tripEndedAt);
      persistActiveSession(hasTripData ? merged : null);
    },
    []
  );

  useEffect(() => {
    if (!isTracking && !tripEndedAt) return undefined;
    const intervalId = setInterval(() => persistSessionNow(), 5000);
    return () => clearInterval(intervalId);
  }, [isTracking, tripEndedAt, persistSessionNow]);


  // Keep exactly one live GPS watch while a trip is running (never while paused).
  // Expressed as an effect so it restarts itself after a page refresh or a
  // re-mount, while never starting a second watch on top of a running one.
  useEffect(() => {
    if (!isTracking || isPaused) return undefined;
    if (watchIdRef.current !== null) return undefined;

    startTrackingEngine(true);

    return () => {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [isTracking, isPaused, startTrackingEngine]);

  // --- TRIP ACTION: Start Trip ---
  const handleStartTrip = () => {
    // Never silently throw away a finished trip the user has not saved yet.
    if (tripEndedAt && !isSaved && distance > 0) {
      const confirmed = window.confirm(
        `Start a new trip? The unsaved trip of ${distance.toFixed(2)} km (₹${formatCurrency(totalFare)}) will be discarded.`
      );
      if (!confirmed) return;
    }

    const now = Date.now();
    setGpsError(null);
    setTrackingStatus('Finding Location');
    trackingActiveRef.current = true;
    setIsTracking(true);
    setIsPaused(false);
    setIsSaved(false);
    setTripStartedAt(now);
    setSessionStartedAt(now);
    setAccumulatedActiveMs(0);
    setPausedAt(null);
    setTripEndedAt(null);
    setElapsedSeconds(0);

    // Reset distance & points
    setDistance(0.0);
    setInputDistance('0.00');
    accumulatedDistanceRef.current = 0;
    startCapturedRef.current = false;
    // A new trip starts with an empty odometer: the first valid fix is the
    // baseline and adds no artificial distance.
    odometerRef.current.beginSegment();
    setGpsPointsCount(0);
    setGpsAccuracy(null);
    setLastCoords(null);
    setStartCoords(null);
    setEndCoords(null);
    setRouteCoordinates([]);
    setMaxSpeed(0);
    setStartLocation('Acquiring start GPS...');
    setEndLocation('Tracking route live...');

    // Persist immediately so a refresh right after starting recovers the trip.
    persistSessionNow({
      isTracking: true,
      isPaused: false,
      tripStartedAt: now,
      sessionStartedAt: now,
      accumulatedActiveMs: 0,
      pausedAt: null,
      tripEndedAt: null,
      distance: 0,
      startCoords: null,
      endCoords: null,
      startLocation: 'Acquiring start GPS...',
      endLocation: 'Tracking route live...',
      routeCoordinates: [],
      maxSpeed: 0,
      gpsPointsCount: 0,
      odometer: odometerRef.current.snapshot(),
    });

    startTrackingEngine(false);
  };

  // --- TRIP ACTION: Pause Trip ---
  const handlePauseTrip = () => {
    if (!isTracking || isPaused) return;
    const now = Date.now();
    const activeSegment = sessionStartedAt ? Math.max(0, now - sessionStartedAt) : 0;
    setAccumulatedActiveMs((prev) => prev + activeSegment);
    setSessionStartedAt(null);
    setPausedAt(now);
    setIsPaused(true);
    trackingActiveRef.current = false;
    setTrackingStatus('Paused');

    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    // Movement during a pause must not be billed as travelled distance.
    odometerRef.current.beginSegment();

    persistSessionNow({
      isPaused: true,
      pausedAt: now,
      accumulatedActiveMs: accumulatedActiveMs + activeSegment,
      sessionStartedAt: null,
      odometer: odometerRef.current.snapshot(),
    });
  };

  // --- TRIP ACTION: Resume Trip ---
  const handleResumeTrip = () => {
    if (!isTracking || !isPaused) return;
    const now = Date.now();
    setSessionStartedAt(now);
    setPausedAt(null);
    setIsPaused(false);
    trackingActiveRef.current = true;
    setTrackingStatus('GPS Connected');

    // Restart the measurement segment: the first fix after the resume becomes
    // the new baseline, so nothing travelled while paused is charged.
    odometerRef.current.beginSegment();
    persistSessionNow({
      isPaused: false,
      pausedAt: null,
      sessionStartedAt: now,
      odometer: odometerRef.current.snapshot(),
    });
  };

  // --- TRIP ACTION: Stop Trip (Saves directly to history) ---
  const handleStopTrip = () => {
    if (!isTracking) return;
    const now = Date.now();

    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    let finalActiveMs = accumulatedActiveMs;
    if (!isPaused && sessionStartedAt) {
      finalActiveMs += Math.max(0, now - sessionStartedAt);
    }
    const finalSecs = Math.floor(finalActiveMs / 1000);

    setAccumulatedActiveMs(finalActiveMs);
    setSessionStartedAt(null);
    setTripEndedAt(now);
    setIsTracking(false);
    setIsPaused(false);
    trackingActiveRef.current = false;
    setTrackingStatus('Trip Stopped');
    setElapsedSeconds(finalSecs);

    odometerRef.current.beginSegment();
    clearActiveSession();

    // Determine final coordinates and provisional addresses
    const finalEndCoords = lastCoords ? { lat: lastCoords.lat, lon: lastCoords.lon } : endCoords;
    if (finalEndCoords) {
      setEndCoords(finalEndCoords);
    }

    let initialStart = (startLocation || '').trim();
    if (!initialStart || initialStart.includes('...')) {
      initialStart = startCoords ? `${startCoords.lat.toFixed(4)}, ${startCoords.lon.toFixed(4)}` : 'Starting Point';
    }

    let initialEnd = (endLocation || '').trim();
    if (!initialEnd || initialEnd.includes('...') || initialEnd.includes('live') || initialEnd.includes('Tracking')) {
      initialEnd = finalEndCoords ? `${finalEndCoords.lat.toFixed(4)}, ${finalEndCoords.lon.toFixed(4)}` : 'Destination';
    }

    const tripDate = new Date(now);
    const avgSpd =
      finalSecs > 10 && distance > 0.05 ? computeAverageSpeedKmh(distance, finalSecs) : 0;

    const tripRecordId = Date.now();
    const tripRecord = {
      id: tripRecordId,
      date: tripDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      dateGroup: tripDate.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
      time: tripStartedAt
        ? new Date(tripStartedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
        : tripDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }),
      endTime: tripDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }),
      startLocation: initialStart,
      endLocation: initialEnd,
      distance: `${distance.toFixed(2)} km`,
      distanceNum: distance,
      rate: `₹${rate.toFixed(2)}/km`,
      rateNum: rate,
      amount: `₹${formatCurrency(totalFare)}`,
      amountNum: totalFare,
      duration: formatDuration(finalSecs),
      durationSeconds: finalSecs,
      avgSpeed: avgSpd,
      maxSpeed: Math.round(maxSpeed),
      startCoords,
      endCoords: finalEndCoords,
      routeCoordinates: compactRouteCoordinates(routeCoordinates),
      trackingMode: routeCoordinates.length > 0 || isTracking ? 'GPS Tracking' : 'Manual Entry',
    };

    setSavedTrips((prev) => [tripRecord, ...prev]);
    setIsSaved(true);

    setSaveToast({
      type: 'success',
      message: `✓ Saved to History: ${distance.toFixed(2)} km • ₹${formatCurrency(totalFare)}`,
    });
    setTimeout(() => setSaveToast(null), 4000);

    // Asynchronously refine start and end locations via reverse geocoding
    if (startCoords && (!startLocation || startLocation.includes('...') || startLocation === 'Starting Point')) {
      reverseGeocodeCoords(startCoords.lat, startCoords.lon).then((resolvedStart) => {
        if (resolvedStart) {
          setStartLocation(resolvedStart);
          setSavedTrips((prev) =>
            prev.map((t) => (t.id === tripRecordId ? { ...t, startLocation: resolvedStart } : t))
          );
        }
      });
    }

    if (finalEndCoords) {
      setEndLocation('Resolving destination...');
      reverseGeocodeCoords(finalEndCoords.lat, finalEndCoords.lon).then((resolvedEnd) => {
        const bestEnd = resolvedEnd || (initialEnd !== 'Destination' ? initialEnd : 'Trip Destination');
        setEndLocation(bestEnd);
        setSavedTrips((prev) =>
          prev.map((t) => (t.id === tripRecordId ? { ...t, endLocation: bestEnd } : t))
        );
      });
    } else if (!endLocation || endLocation.includes('live') || endLocation.includes('Tracking')) {
      setEndLocation('Trip Destination');
    }
  };

  // --- TRIP ACTION: Save Trip to History ---
  const handleSaveTrip = async () => {
    if (isSaving || isSaved) return;

    // Ensure final addresses are resolved
    let finalStart = (startLocation || '').trim();
    let finalEnd = (endLocation || '').trim();

    if (!finalStart || finalStart.includes('...')) {
      if (startCoords) {
        finalStart = await reverseGeocodeCoords(startCoords.lat, startCoords.lon);
      } else {
        finalStart = 'Starting Point';
      }
    }

    if (!finalEnd || finalEnd.includes('...') || finalEnd.includes('live')) {
      if (endCoords) {
        finalEnd = await reverseGeocodeCoords(endCoords.lat, endCoords.lon);
      } else if (startCoords) {
        finalEnd = finalStart;
      } else {
        finalEnd = 'Destination';
      }
    }

    setStartLocation(finalStart);
    setEndLocation(finalEnd);

    const now = new Date();
    const finalSecs = calculateCurrentElapsed();
    // Average speed always comes from the real recorded distance and active
    // duration; it is never invented when the trip is too short to measure.
    const avgSpd =
      finalSecs > 10 && distance > 0.05 ? computeAverageSpeedKmh(distance, finalSecs) : 0;

    const tripRecord = {
      id: Date.now(),
      date: now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      dateGroup: now.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
      time: tripStartedAt
        ? new Date(tripStartedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
        : now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }),
      endTime: tripEndedAt
        ? new Date(tripEndedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
        : now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }),
      startLocation: finalStart,
      endLocation: finalEnd,
      distance: `${distance.toFixed(2)} km`,
      distanceNum: distance,
      rate: `₹${rate.toFixed(2)}/km`,
      rateNum: rate,
      amount: `₹${formatCurrency(totalFare)}`,
      amountNum: totalFare,
      duration: formatDuration(finalSecs),
      durationSeconds: finalSecs,
      avgSpeed: avgSpd,
      maxSpeed: Math.round(maxSpeed),
      startCoords,
      endCoords,
      // Route geometry is sampled + rounded so the history stays inside the
      // browser storage quota even after many trips.
      routeCoordinates: compactRouteCoordinates(routeCoordinates),
      trackingMode: isTracking || routeCoordinates.length > 0 ? 'GPS Tracking' : 'Manual Entry',
    };

    setIsSaving(true);

    try {
      // 1. Save to local state and localStorage
      setSavedTrips((prev) => [tripRecord, ...prev]);
      setIsSaved(true);
      clearActiveSession();

      setSaveToast({
        type: 'success',
        message: `✓ Saved to History: ${distance.toFixed(2)} km • ₹${formatCurrency(totalFare)}`,
      });
    } catch (err) {
      console.error('Trip save error:', err);
      setSaveToast({
        type: 'error',
        message: 'Could not save trip.',
      });
      setTimeout(() => setSaveToast(null), 3500);
    } finally {
      setIsSaving(false);
    }
  };

  // --- TRIP ACTION: Reset Trip ---
  const handleResetTrip = () => {
    trackingActiveRef.current = false;
    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    setDistance(0);
    setInputDistance('0.00');
    accumulatedDistanceRef.current = 0;
    startCapturedRef.current = false;
    odometerRef.current.beginSegment();
    setIsTracking(false);
    setIsPaused(false);
    setTrackingStatus('Ready to Track');
    setTripStartedAt(null);
    setSessionStartedAt(null);
    setAccumulatedActiveMs(0);
    setPausedAt(null);
    setTripEndedAt(null);
    setElapsedSeconds(0);
    setGpsAccuracy(null);
    setGpsPointsCount(0);
    setLastCoords(null);
    setStartCoords(null);
    setEndCoords(null);
    setRouteCoordinates([]);
    setMaxSpeed(0);
    setStartLocation('');
    setEndLocation('');
    setGpsError(null);
    setIsSaved(false);
    setSaveToast(null);
    clearActiveSession();
  };

  // --- Delete Trip from History ---
  const handleDeleteTrip = (tripId) => {
    setSavedTrips((prev) => prev.filter((t) => t.id !== tripId));
    if (selectedTripDetail && selectedTripDetail.id === tripId) {
      setSelectedTripDetail(null);
    }
  };

  const handleClearAllTrips = () => {
    if (window.confirm('Clear all saved trips from history?')) {
      setSavedTrips([]);
      setSelectedTripDetail(null);
    }
  };

  // Status badge styling helper
  const getStatusBadge = () => {
    if (isPaused) {
      return {
        label: 'Paused',
        className: 'badge-paused',
        dotClass: 'dot-amber',
      };
    }
    switch (trackingStatus) {
      case 'GPS Connected':
        return {
          label: 'GPS Active',
          className: 'badge-connected',
          dotClass: 'dot-pulse-green',
        };
      case 'Finding Location':
        return {
          label: 'Locating...',
          className: 'badge-searching',
          dotClass: 'dot-pulse-amber',
        };
      case 'Trip Stopped':
        return {
          label: isSaved ? 'Trip Saved' : 'Trip Stopped',
          className: isSaved ? 'badge-connected' : 'badge-stopped',
          dotClass: isSaved ? 'dot-pulse-green' : 'dot-stopped',
        };
      case 'Permission Denied':
      case 'GPS Unavailable':
        return {
          label: trackingStatus,
          className: 'badge-error',
          dotClass: 'dot-red',
        };
      default:
        return {
          label: isTracking ? 'Tracking' : 'Ready',
          className: 'badge-ready',
          dotClass: 'dot-blue',
        };
    }
  };

  const statusBadge = getStatusBadge();

  return (
    <div className="app-container" data-theme={theme}>
      {/* 1. Header (Compact Mobile Header) */}
      <header className="app-header">
        <div className="header-inner">
          <div className="logo-brand">
            <div className="logo-icon-wrapper" aria-hidden="true">
              <Navigation className="logo-icon" size={20} />
            </div>
            <div className="brand-text">
              <div className="brand-title-row">
                <span className="brand-title">KiloFare</span>
                <span className="brand-tag">v2.0</span>
              </div>
              <span className="brand-subtitle">
                Karumbukkadai Pasanga • Trip Meter
              </span>
            </div>
          </div>

          <div className="header-right-controls">
            {/* Theme Toggle Button */}
            <button
              type="button"
              className="btn-theme-toggle"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
              title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
            >
              {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            </button>

            {/* Status Pill in Header */}
            <div className={`header-status-pill ${statusBadge.className}`}>
              <span className={`status-indicator-dot ${statusBadge.dotClass}`} />
              <span className="header-status-text">{statusBadge.label}</span>
            </div>
          </div>
        </div>
      </header>

      {/* 2. Main Tab Content Views */}
      <main className="main-content">
        {/* If a trip detail is selected, display TripDetailModal */}
        {selectedTripDetail ? (
          <TripDetailModal
            trip={selectedTripDetail}
            onBack={() => setSelectedTripDetail(null)}
            onDelete={handleDeleteTrip}
          />
        ) : (
          <>
            {activeTab === 'home' && (
              <HomeDashboard
                distance={distance}
                rate={rate}
                totalFare={totalFare}
                elapsedSeconds={elapsedSeconds}
                isTracking={isTracking}
                isPaused={isPaused}
                trackingStatus={trackingStatus}
                statusBadge={statusBadge}
                gpsError={gpsError}
                startLocation={startLocation}
                endLocation={endLocation}
                startCoords={startCoords}
                endCoords={endCoords}
                isSaved={isSaved}
                isSaving={isSaving}
                saveToast={saveToast}
                onStartTrip={handleStartTrip}
                onPauseTrip={handlePauseTrip}
                onResumeTrip={handleResumeTrip}
                onStopTrip={handleStopTrip}
                onSaveTrip={handleSaveTrip}
                onResetTrip={handleResetTrip}
                onSwitchTab={(tab) => setActiveTab(tab)}
              />
            )}

            {activeTab === 'distance' && (
              <DistanceGpsScreen
                distance={distance}
                inputDistance={inputDistance}
                onDistanceChange={handleDistanceChange}
                onDistanceBlur={handleDistanceBlur}
                isTracking={isTracking}
                isPaused={isPaused}
                trackingStatus={trackingStatus}
                statusBadge={statusBadge}
                routeCoordinates={routeCoordinates}
                maxSpeed={maxSpeed}
                rate={rate}
                totalFare={totalFare}
                tripStartedAt={tripStartedAt}
                tripEndedAt={tripEndedAt}
                gpsAccuracy={gpsAccuracy}
                gpsPointsCount={gpsPointsCount}
                elapsedSeconds={elapsedSeconds}
                lastCoords={lastCoords}
                startCoords={startCoords}
                endCoords={endCoords}
                startLocation={startLocation}
                endLocation={endLocation}
                setStartLocation={setStartLocation}
                setEndLocation={setEndLocation}
                gpsError={gpsError}
                onStartTrip={handleStartTrip}
                onPauseTrip={handlePauseTrip}
                onResumeTrip={handleResumeTrip}
                onStopTrip={handleStopTrip}
                onResetTrip={handleResetTrip}
              />
            )}

            {activeTab === 'fare' && (
              <FareRateScreen
                rate={rate}
                inputRate={inputRate}
                onRateChange={handleRateChange}
                onRateBlur={handleRateBlur}
                onSelectPresetRate={handleSelectPresetRate}
                distance={distance}
                totalFare={totalFare}
              />
            )}

            {activeTab === 'history' && (
              <HistoryScreen
                trips={savedTrips}
                onSelectTrip={(trip) => setSelectedTripDetail(trip)}
                onDeleteTrip={handleDeleteTrip}
                onClearAllTrips={handleClearAllTrips}
                onNavigateHome={() => setActiveTab('home')}
              />
            )}
          </>
        )}
      </main>

      {/* 3. Persistent Fixed Bottom Navigation Bar */}
      <BottomNav
        activeTab={selectedTripDetail ? 'history' : activeTab}
        onSelectTab={(tab) => {
          setSelectedTripDetail(null);
          setActiveTab(tab);
        }}
        isTracking={isTracking}
      />
    </div>
  );
}
