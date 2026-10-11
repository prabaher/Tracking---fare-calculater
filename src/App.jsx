import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Navigation,
  MapPin,
  Play,
  Square,
  RotateCcw,
  IndianRupee,
  Clock,
  Compass,
  AlertCircle,
  CheckCircle2,
  Info,
  Copy,
  Check,
  Lock,
  Unlock,
  Activity,
  Gauge,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  Save,
  X,
  Trash2,
  History,
  Flag,
  ArrowRight,
  Sun,
  Moon
} from 'lucide-react';
import './App.css';
import { GOOGLE_SCRIPT_URL } from './config';

// Earth's radius in kilometers for Haversine calculation
const EARTH_RADIUS_KM = 6371;

// Cache for reverse geocoding results to prevent duplicate API requests
const geocodeCache = new Map();

/**
 * Automatically resolves human-readable location from latitude & longitude
 * Uses OpenStreetMap Nominatim with fast 3.5s timeout and fallback to GPS coordinates
 */
async function reverseGeocodeCoords(lat, lon) {
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
      const street = addr.road || addr.pedestrian || addr.suburb || addr.neighbourhood || addr.residential;
      const locality = addr.suburb || addr.city_district || addr.locality || addr.neighbourhood;
      const town = addr.city || addr.town || addr.village || addr.state_district;

      const parts = [];
      if (street) parts.push(street);
      if (locality && !parts.includes(locality)) parts.push(locality);
      if (town && !parts.includes(town)) parts.push(town);

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

  // Graceful fallback: formatted GPS coordinates
  const fallback = `GPS (${lat.toFixed(4)}, ${lon.toFixed(4)})`;
  geocodeCache.set(cacheKey, fallback);
  return fallback;
}

/**
 * Calculates distance between two GPS coordinates using the Haversine formula
 */
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
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
function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (num) => String(num).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Format currency in Indian Rupees format (₹)
 */
function formatCurrency(amount) {
  const num = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

export default function App() {
  // --- Core Calculator State ---
  const [distance, setDistance] = useState(1.0);
  const [inputDistance, setInputDistance] = useState('1.00');
  const [rate, setRate] = useState(20);
  const [inputRate, setInputRate] = useState('20');

  // GPS Tracking State
  const [isTracking, setIsTracking] = useState(false);
  const [trackingStatus, setTrackingStatus] = useState('Ready to Track');
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [gpsPointsCount, setGpsPointsCount] = useState(0);
  const [lastCoords, setLastCoords] = useState(null);
  const [startCoords, setStartCoords] = useState(null);
  const [endCoords, setEndCoords] = useState(null);
  const [gpsError, setGpsError] = useState(null);
  const [tripStartedAt, setTripStartedAt] = useState(null);
  const [isCopied, setIsCopied] = useState(false);
  const [showGpsHelp, setShowGpsHelp] = useState(false);

  // --- Location & Google Sheets State ---
  const [startLocation, setStartLocation] = useState('');
  const [endLocation, setEndLocation] = useState('');
  const [saveButtonState, setSaveButtonState] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
  const [saveToast, setSaveToast] = useState(null); // { type: 'success' | 'warning' | 'error', message: string }
  const [isSaving, setIsSaving] = useState(false);
  const [savedTrips, setSavedTrips] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('kilofare_saved_trips') || '[]');
    } catch {
      return [];
    }
  });
  const [showSavedHistory, setShowSavedHistory] = useState(false);
  const [mobileTab, setMobileTab] = useState('all'); // 'all' | 'distance' | 'fare' | 'summary'

  // --- Soft Neomorph Theme State (Light / Dark) ---
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('kilofare_theme');
      if (saved === 'dark' || saved === 'light') return saved;
      const oldStyle = localStorage.getItem('kilofare_morphism_style');
      if (oldStyle === 'dark-glass') return 'dark';
      return 'light';
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    try {
      document.documentElement.setAttribute('data-theme', theme);
    } catch {}
  }, [theme]);

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
    try {
      localStorage.setItem('kilofare_theme', newTheme);
    } catch {}
  };

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

  // References for GPS watch and duration timer
  const watchIdRef = useRef(null);
  const timerRef = useRef(null);
  const prevPositionRef = useRef(null);
  const accumulatedDistanceRef = useRef(0);

  // Derived Total Fare: Distance * Rate
  const totalFare = useMemo(() => {
    const validDist = Number.isFinite(distance) && distance >= 0 ? distance : 0;
    const validRate = Number.isFinite(rate) && rate >= 0 ? rate : 0;
    return validDist * validRate;
  }, [distance, rate]);

  // Clean up GPS watcher and timer on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  // Duration timer effect
  useEffect(() => {
    if (isTracking) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isTracking]);



  // Save trips history to localStorage
  useEffect(() => {
    localStorage.setItem('kilofare_saved_trips', JSON.stringify(savedTrips));
  }, [savedTrips]);

  // --- Distance Manual Input Handler ---
  const handleDistanceChange = (e) => {
    if (isTracking) return;

    const value = e.target.value;
    setInputDistance(value);

    const parsed = parseFloat(value);
    if (!isNaN(parsed) && parsed >= 0) {
      setDistance(parsed);
    } else if (value.trim() === '') {
      setDistance(0);
    }
  };

  const handleDistanceBlur = () => {
    if (isTracking) return;
    const parsed = parseFloat(inputDistance);
    if (isNaN(parsed) || parsed < 0) {
      setDistance(0);
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

  // --- GPS Tracking Controls ---
  const startGpsTrip = () => {
    if (!('geolocation' in navigator)) {
      setTrackingStatus('GPS Unavailable');
      setGpsError('Geolocation is not supported by your browser or environment.');
      return;
    }

    setGpsError(null);
    setTrackingStatus('Finding Location');
    setIsTracking(true);
    setElapsedSeconds(0);
    setTripStartedAt(new Date());

    // Reset distance & coordinates for the new GPS trip
    setDistance(0.0);
    setInputDistance('0.00');
    accumulatedDistanceRef.current = 0;
    prevPositionRef.current = null;
    setGpsPointsCount(0);
    setGpsAccuracy(null);
    setLastCoords(null);
    setStartCoords(null);
    setEndCoords(null);
    setStartLocation('Acquiring start GPS...');
    setEndLocation('Tracking route live...');

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    const options = {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15000,
    };

    try {
      const id = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude, accuracy } = position.coords;
          const timestamp = position.timestamp;

          setGpsAccuracy(Math.round(accuracy));
          setTrackingStatus('GPS Connected');
          setLastCoords({ lat: latitude, lon: longitude });

          // Record starting location on first GPS fix & reverse-geocode automatically
          if (!prevPositionRef.current) {
            const originCoord = { lat: latitude, lon: longitude };
            setStartCoords(originCoord);
            setStartLocation('Resolving start address...');
            reverseGeocodeCoords(latitude, longitude).then((addr) => {
              if (addr) setStartLocation(addr);
            });
            setEndCoords({ lat: latitude, lon: longitude });
            setEndLocation('Tracking route live...');
            setGpsPointsCount(1);
          } else {
            // Update ending coordinate continuously as movement occurs
            setEndCoords({ lat: latitude, lon: longitude });
          }

          // Jitter and plausibility filters
          if (accuracy > 50) return;

          if (prevPositionRef.current) {
            const { lat: prevLat, lon: prevLon, timestamp: prevTime } = prevPositionRef.current;
            const deltaKm = calculateHaversineDistance(prevLat, prevLon, latitude, longitude);
            const timeDiffSec = (timestamp - prevTime) / 1000;

            if (deltaKm < 0.004) return; // Ignore < 4m noise

            if (timeDiffSec > 0) {
              const speedKmH = (deltaKm / timeDiffSec) * 3600;
              if (speedKmH > 220) return; // Ignore unrealistic jump
            }

            accumulatedDistanceRef.current += deltaKm;
            const newDistance = accumulatedDistanceRef.current;

            setDistance(newDistance);
            setInputDistance(newDistance.toFixed(2));
            setGpsPointsCount((c) => c + 1);
          }

          prevPositionRef.current = { lat: latitude, lon: longitude, timestamp };
        },
        (error) => {
          let message = 'Unable to acquire GPS location.';
          if (error.code === error.PERMISSION_DENIED) {
            message = 'GPS permission denied. Please allow location access in your browser or device settings.';
            setTrackingStatus('Permission Denied');
          } else if (error.code === error.POSITION_UNAVAILABLE) {
            message = 'GPS signal unavailable. Ensure location services are enabled on your device.';
            setTrackingStatus('GPS Unavailable');
          } else if (error.code === error.TIMEOUT) {
            message = 'GPS request timed out. Searching for satellites...';
            setTrackingStatus('Finding Location');
          } else {
            setTrackingStatus('GPS Unavailable');
          }
          setGpsError(message);

          if (error.code === error.PERMISSION_DENIED || error.code === error.POSITION_UNAVAILABLE) {
            stopGpsTrip(false);
          }
        },
        options
      );

      watchIdRef.current = id;
    } catch (err) {
      setTrackingStatus('GPS Unavailable');
      setGpsError(err.message || 'An error occurred while initializing GPS.');
      setIsTracking(false);
    }
  };

  const stopGpsTrip = (setStatusToStopped = true) => {
    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    setIsTracking(false);
    if (setStatusToStopped) {
      setTrackingStatus('Trip Stopped');
    }

    // Automatically resolve ending location from final GPS position
    if (lastCoords) {
      setEndCoords({ lat: lastCoords.lat, lon: lastCoords.lon });
      setEndLocation('Resolving stop address...');
      reverseGeocodeCoords(lastCoords.lat, lastCoords.lon).then((addr) => {
        if (addr) setEndLocation(addr);
      });
    } else if (!endLocation || endLocation.includes('Tracking')) {
      setEndLocation('Trip Destination');
    }
  };

  // --- Reset Calculator ---
  const resetCalculator = () => {
    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setDistance(1.0);
    setInputDistance('1.00');
    setRate(20);
    setInputRate('20');

    setIsTracking(false);
    setTrackingStatus('Ready to Track');
    setGpsAccuracy(null);
    setElapsedSeconds(0);
    setGpsPointsCount(0);
    setLastCoords(null);
    setStartCoords(null);
    setEndCoords(null);
    setStartLocation('');
    setEndLocation('');
    setGpsError(null);
    setTripStartedAt(null);
    setSaveButtonState('idle');
    setSaveToast(null);
    accumulatedDistanceRef.current = 0;
    prevPositionRef.current = null;
  };

  // Copy trip receipt to clipboard
  const handleCopySummary = () => {
    const summaryText = `🚗 KiloFare Trip Summary
Karumbukkadai Delivery Pasanga
--------------------------------
Starting Location: ${startLocation || 'Not specified'}
Ending Location: ${endLocation || 'Not specified'}
Distance: ${distance.toFixed(2)} km
Rate: ₹${rate.toFixed(2)} / km
Total Fare: ₹${totalFare.toFixed(2)}
Duration: ${formatDuration(elapsedSeconds)}
Status: ${trackingStatus}
Calculation: ${distance.toFixed(2)} km × ₹${rate.toFixed(2)} = ₹${totalFare.toFixed(2)}
--------------------------------
Generated with KiloFare Calculator • Karumbukkadai Delivery Pasanga`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(summaryText).then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2200);
      });
    }
  };

  // --- Direct 1-Click Save to Google Sheets ---
  const handleDirectSaveToSheets = async () => {
    if (isSaving) return;

    const endpoint = (GOOGLE_SCRIPT_URL || '').trim();
    const isUnconfigured =
      !endpoint ||
      endpoint === 'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE' ||
      endpoint.includes('PASTE_YOUR_') ||
      endpoint.includes('YOUR_DEPLOYED_URL') ||
      !endpoint.startsWith('https://script.google.com/macros/s/') ||
      !endpoint.endsWith('/exec');

    if (isUnconfigured) {
      setSaveButtonState('error');
      setSaveToast({
        type: 'warning',
        message: 'Google Apps Script endpoint not configured. Please paste your deployed Web App URL ending with /exec in src/config.js.',
      });
      setTimeout(() => setSaveButtonState('idle'), 4000);
      return;
    }

    setIsSaving(true);
    setSaveButtonState('saving');
    setSaveToast(null);

    // Determine final start & stop locations automatically
    let finalStart = (startLocation || '').trim();
    let finalEnd = (endLocation || '').trim();

    // If start location is empty or still detecting, resolve from GPS or fallback
    if (!finalStart || finalStart.includes('...')) {
      if (startCoords) {
        try {
          finalStart = await reverseGeocodeCoords(startCoords.lat, startCoords.lon);
        } catch {
          finalStart = `GPS (${startCoords.lat.toFixed(4)}, ${startCoords.lon.toFixed(4)})`;
        }
      } else {
        finalStart = 'Starting Point';
      }
    }

    // If stop location is empty or still tracking live, resolve from lastCoords or fallback
    if (!finalEnd || finalEnd.includes('...') || finalEnd.includes('live')) {
      if (lastCoords) {
        try {
          finalEnd = await reverseGeocodeCoords(lastCoords.lat, lastCoords.lon);
        } catch {
          finalEnd = `GPS (${lastCoords.lat.toFixed(4)}, ${lastCoords.lon.toFixed(4)})`;
        }
      } else if (startCoords) {
        finalEnd = finalStart;
      } else {
        finalEnd = 'Destination';
      }
    }

    // Update state display if resolved
    if (finalStart !== startLocation) setStartLocation(finalStart);
    if (finalEnd !== endLocation) setEndLocation(finalEnd);

    const tripRecord = {
      id: Date.now(),
      date: new Date().toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
      time: new Date().toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }),
      startLocation: finalStart,
      endLocation: finalEnd,
      distance: `${distance.toFixed(2)} km`,
      distanceNum: distance,
      rate: `₹${rate.toFixed(2)}/km`,
      amount: `₹${formatCurrency(totalFare)}`,
      amountNum: totalFare,
      duration: formatDuration(elapsedSeconds),
      trackingMode: isTracking ? 'GPS Tracking' : 'Manual Entry',
    };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(tripRecord),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const responseText = await response.text();
      let responseData = {};
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { status: 'unknown', raw: responseText };
      }

      if (responseData.status === 'success') {
        // Record to local history on genuine confirmed save
        setSavedTrips((prev) => [tripRecord, ...prev]);
        setSaveButtonState('saved');
        setSaveToast({
          type: 'success',
          message: `✓ Saved to Google Sheet: ${finalStart} ➔ ${finalEnd} • ₹${formatCurrency(totalFare)}`,
        });

        setTimeout(() => {
          setSaveButtonState('idle');
          setIsSaving(false);
        }, 2600);

        setTimeout(() => {
          setSaveToast(null);
        }, 5000);
      } else {
        // Non-success response from Apps Script
        const errorMsg = responseData.message || responseData.error || 'Server did not confirm save.';
        console.error('Google Sheets Apps Script reported error:', responseData);
        setSavedTrips((prev) => [tripRecord, ...prev]);
        setSaveButtonState('error');
        setSaveToast({
          type: 'error',
          message: `Notice: Saved locally, but Google Sheet reported: ${errorMsg}`,
        });
        setTimeout(() => {
          setSaveButtonState('idle');
          setIsSaving(false);
        }, 4000);
      }
    } catch (err) {
      console.error('Save to Google Sheets failed:', err);
      // Save locally so user does not lose their trip calculations
      setSavedTrips((prev) => [tripRecord, ...prev]);
      setSaveButtonState('error');

      const isNetworkOrCors =
        err?.name === 'TypeError' ||
        err?.message?.includes('Failed to fetch') ||
        err?.message?.includes('NetworkError');

      const message = isNetworkOrCors
        ? 'Could not connect to Google Apps Script. Saved locally. Ensure your Web App is deployed with "Who has access: Anyone".'
        : `Save failed (${err?.message || 'Network error'}). Saved locally.`;

      setSaveToast({
        type: 'error',
        message,
      });

      setTimeout(() => {
        setSaveButtonState('idle');
        setIsSaving(false);
      }, 4000);
    }
  };

  const handleClearHistory = () => {
    if (window.confirm('Are you sure you want to clear your local saved trips history?')) {
      setSavedTrips([]);
    }
  };

  // Status badge styling helper
  const getStatusBadge = () => {
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
          label: 'Trip Stopped',
          className: 'badge-stopped',
          dotClass: 'dot-stopped',
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
          label: isTracking ? 'Tracking' : 'Manual Mode',
          className: 'badge-ready',
          dotClass: 'dot-blue',
        };
    }
  };

  const statusBadge = getStatusBadge();

  return (
    <div className="app-container" data-theme={theme}>
      {/* 1. Header */}
      <header className="app-header">
        <div className="header-inner">
          <div className="logo-brand">
            <div className="logo-icon-wrapper" aria-hidden="true">
              <Navigation className="logo-icon" size={24} />
            </div>
            <div className="brand-text">
              <span className="brand-title">KiloFare</span>
              <span className="brand-subtitle brand-subtitle-full">
                Kilometer &amp; Fare Calculator • <span className="brand-partner-badge">Karumbukkadai Delivery Pasanga</span>
              </span>
              <span className="brand-subtitle brand-subtitle-mobile">
                <span className="brand-partner-badge">Karumbukkadai Pasanga</span>
              </span>
            </div>
          </div>

          <div className="header-badge-container">
            {/* Soft Neomorph Theme Switcher (Light / Dark) */}
            <div className="theme-toggle-group" role="radiogroup" aria-label="Theme mode selector">
              <button
                type="button"
                className={`theme-toggle-btn ${theme === 'light' ? 'active' : ''}`}
                onClick={() => handleThemeChange('light')}
                aria-label="Light mode"
                title="Soft Neomorph Light"
              >
                <Sun size={14} className="theme-toggle-icon" />
                <span className="theme-toggle-label">Light</span>
              </button>
              <button
                type="button"
                className={`theme-toggle-btn ${theme === 'dark' ? 'active' : ''}`}
                onClick={() => handleThemeChange('dark')}
                aria-label="Dark mode"
                title="Soft Neomorph Dark"
              >
                <Moon size={14} className="theme-toggle-icon" />
                <span className="theme-toggle-label">Dark</span>
              </button>
            </div>

            <div className={`status-pill ${statusBadge.className}`}>
              <span className={`status-indicator-dot ${statusBadge.dotClass}`} />
              <span className="status-pill-text">{statusBadge.label}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="main-content">
        {/* 2. Welcome Title Section */}
        <section className="welcome-section" aria-labelledby="welcome-heading">
          <div className="welcome-tag">
            <Activity size={14} className="tag-icon" />
            <span className="welcome-tag-text">Karumbukkadai Delivery Pasanga • Precision Trip &amp; Fare Meter</span>
            <span className="welcome-tag-mobile">Karumbukkadai Pasanga • Trip Meter</span>
          </div>
          <h1 id="welcome-heading" className="welcome-title">
            Calculate Distance &amp; Fare Instantly
          </h1>
          <p className="welcome-subtitle">
            Track your journey live with browser GPS or enter kilometers manually to compute accurate fares in real time.
          </p>
        </section>

        {/* GPS Error Notification Banner */}
        {gpsError && (
          <div className="alert-banner" role="alert">
            <div className="alert-icon-wrapper">
              <AlertCircle size={20} className="alert-icon" />
            </div>
            <div className="alert-content">
              <strong>Location Notice:</strong> {gpsError}
              <div className="alert-footnote">
                Manual distance calculation is active and ready to use below.
              </div>
            </div>
          </div>
        )}

        {/* Mobile View Switcher (Keeps Distance, Fare, and Summary closely accessible without excessive scrolling) */}
        <div className="mobile-tabs-container" role="tablist" aria-label="Dashboard Sections">
          <button
            type="button"
            role="tab"
            aria-selected={mobileTab === 'all'}
            className={`mobile-tab-btn ${mobileTab === 'all' ? 'is-active' : ''}`}
            onClick={() => setMobileTab('all')}
          >
            <Gauge size={13} />
            <span>Compact All</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mobileTab === 'distance'}
            className={`mobile-tab-btn ${mobileTab === 'distance' ? 'is-active' : ''}`}
            onClick={() => setMobileTab('distance')}
          >
            <Navigation size={13} />
            <span>Distance &amp; GPS</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mobileTab === 'fare'}
            className={`mobile-tab-btn ${mobileTab === 'fare' ? 'is-active' : ''}`}
            onClick={() => setMobileTab('fare')}
          >
            <IndianRupee size={13} />
            <span>Fare Rate</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mobileTab === 'summary'}
            className={`mobile-tab-btn ${mobileTab === 'summary' ? 'is-active' : ''}`}
            onClick={() => setMobileTab('summary')}
          >
            <FileSpreadsheet size={13} />
            <span>Summary &amp; Save</span>
          </button>
        </div>

        {/* 3. Main Dashboard with Two Cards */}
        <section className="dashboard-grid" aria-label="Fare Calculator Dashboard">
          {/* LEFT CARD — Distance Tracker */}
          <div className={`dashboard-card distance-tracker-card ${mobileTab !== 'all' && mobileTab !== 'distance' ? 'mobile-hidden' : ''}`}>
            <div className="card-header">
              <div className="card-header-icon bg-primary">
                <MapPin size={22} className="text-primary" />
              </div>
              <div>
                <h2 className="card-title">Distance Tracker</h2>
                <p className="card-description">Live GPS monitoring or manual kilometer entry</p>
              </div>
            </div>

            {/* Prominent Distance Display */}
            <div className="distance-display-box">
              <div className="distance-readout">
                <span className="distance-value">{distance.toFixed(2)}</span>
                <span className="distance-unit">km</span>
              </div>
              <div className="distance-status-sub">
                {isTracking ? (
                  <span className="text-tracking-active">
                    <Activity size={14} className="inline-icon spin-slow" /> Measuring route in real-time
                  </span>
                ) : (
                  <span>Ready for manual entry or GPS trip</span>
                )}
              </div>
            </div>

            {/* Editable Kilometer Input */}
            <div className="form-group">
              <label htmlFor="distance-input" className="form-label">
                <span>Enter Distance (Kilometers)</span>
                {isTracking ? (
                  <span className="input-locked-badge">
                    <Lock size={12} /> GPS Locked
                  </span>
                ) : (
                  <span className="input-unlocked-badge">
                    <Unlock size={12} /> Editable
                  </span>
                )}
              </label>

              <div className={`input-wrapper ${isTracking ? 'is-disabled' : ''}`}>
                <input
                  id="distance-input"
                  type="number"
                  min="0"
                  step="0.05"
                  value={inputDistance}
                  onChange={handleDistanceChange}
                  onBlur={handleDistanceBlur}
                  disabled={isTracking}
                  placeholder="1.00"
                  className="number-input"
                  aria-describedby="distance-helper"
                />
                <span className="input-suffix">KM</span>
              </div>
              <p id="distance-helper" className="helper-text">
                {isTracking
                  ? 'Manual input is locked while GPS tracking is active.'
                  : 'Enter any distance. Decimals supported (e.g. 1.25, 5.75).'}
              </p>
              {!isTracking && (
                <div className="quick-presets-row" aria-label="Quick distance shortcuts">
                  <span className="quick-presets-label">Quick:</span>
                  {[1, 2, 5, 10, 15, 20].map((presetKm) => (
                    <button
                      key={presetKm}
                      type="button"
                      className={`btn-rate-preset ${distance === presetKm ? 'is-active' : ''}`}
                      onClick={() => {
                        setDistance(presetKm);
                        setInputDistance(presetKm.toFixed(2));
                      }}
                    >
                      {presetKm} km
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* GPS Telemetry Info Bar */}
            <div className="gps-telemetry-panel">
              <div className="telemetry-item">
                <span className="telemetry-label">Status</span>
                <span className="telemetry-value status-text-colored">{trackingStatus}</span>
              </div>

              <div className="telemetry-item">
                <span className="telemetry-label">GPS Accuracy</span>
                <span className="telemetry-value">
                  {gpsAccuracy !== null ? (
                    <span
                      className={
                        gpsAccuracy <= 20
                          ? 'acc-good'
                          : gpsAccuracy <= 50
                          ? 'acc-fair'
                          : 'acc-poor'
                      }
                    >
                      ±{gpsAccuracy}m {gpsAccuracy <= 20 ? '(High)' : '(Standard)'}
                    </span>
                  ) : (
                    '—'
                  )}
                </span>
              </div>

              <div className="telemetry-item">
                <span className="telemetry-label">Duration</span>
                <span className="telemetry-value font-mono">
                  <Clock size={13} className="telemetry-icon" />
                  {formatDuration(elapsedSeconds)}
                </span>
              </div>

              <div className="telemetry-item">
                <span className="telemetry-label">Fix Points</span>
                <span className="telemetry-value">{gpsPointsCount} fixes</span>
              </div>
            </div>

            {/* Action Buttons: Start GPS Trip / Stop Trip */}
            <div className="gps-controls-container">
              {!isTracking ? (
                <button
                  type="button"
                  id="btn-start-gps"
                  className="btn-action btn-start-gps"
                  onClick={startGpsTrip}
                >
                  <Play size={18} fill="currentColor" />
                  <span>Start GPS Trip</span>
                </button>
              ) : (
                <button
                  type="button"
                  id="btn-stop-gps"
                  className="btn-action btn-stop-gps"
                  onClick={() => stopGpsTrip(true)}
                >
                  <Square size={18} fill="currentColor" />
                  <span>Stop Trip</span>
                </button>
              )}
            </div>

            {/* Note about phone GPS */}
            <div className="gps-notice-box">
              <Info size={16} className="notice-icon" />
              <span>
                Uses browser GPS. Actual travel distance automatically accumulates from 0.00 km.
              </span>
            </div>
          </div>

          {/* RIGHT CARD — Fare Settings */}
          <div className={`dashboard-card fare-settings-card ${mobileTab !== 'all' && mobileTab !== 'fare' ? 'mobile-hidden' : ''}`}>
            <div className="card-header">
              <div className="card-header-icon bg-accent">
                <IndianRupee size={22} className="text-accent" />
              </div>
              <div>
                <h2 className="card-title">Fare Settings</h2>
                <p className="card-description">Set price or tariff rate per kilometer</p>
              </div>
            </div>

            {/* Prominent Rate Display */}
            <div className="rate-display-box">
              <div className="rate-readout">
                <span className="rate-currency">₹</span>
                <span className="rate-value">{rate.toFixed(2)}</span>
                <span className="rate-unit">/ km</span>
              </div>
              <div className="rate-subtext">Applied automatically to total distance</div>
            </div>

            {/* Editable Fare per KM Input */}
            <div className="form-group">
              <label htmlFor="rate-input" className="form-label">
                <span>Price Per Kilometer (₹)</span>
                <span className="helper-badge">Editable</span>
              </label>

              <div className="input-wrapper">
                <span className="input-prefix">₹</span>
                <input
                  id="rate-input"
                  type="number"
                  min="0"
                  step="0.5"
                  value={inputRate}
                  onChange={handleRateChange}
                  onBlur={handleRateBlur}
                  placeholder="20"
                  className="number-input with-prefix"
                  aria-describedby="rate-helper"
                />
                <span className="input-suffix">/ KM</span>
              </div>
              <p id="rate-helper" className="helper-text">
                Standard rate: ₹20/km. Custom rates and decimal values supported.
              </p>
              <div className="quick-presets-row" aria-label="Quick rate shortcuts">
                <span className="quick-presets-label">Quick:</span>
                {[15, 18, 20, 22, 25, 30].map((presetRate) => (
                  <button
                    key={presetRate}
                    type="button"
                    className={`btn-rate-preset ${rate === presetRate ? 'is-active' : ''}`}
                    onClick={() => {
                      setRate(presetRate);
                      setInputRate(presetRate.toString());
                    }}
                  >
                    ₹{presetRate}
                  </button>
                ))}
              </div>
            </div>

            {/* Live Calculation Breakdown Box */}
            <div className="calculation-breakdown-card">
              <div className="breakdown-title">
                <Gauge size={16} />
                <span>Live Calculation Breakdown</span>
              </div>
              <div className="breakdown-formula">
                <div className="formula-part">
                  <span className="formula-num">{distance.toFixed(2)} km</span>
                  <span className="formula-label">Distance</span>
                </div>
                <div className="formula-op">×</div>
                <div className="formula-part">
                  <span className="formula-num">₹{rate.toFixed(2)}</span>
                  <span className="formula-label">Rate / km</span>
                </div>
                <div className="formula-op">=</div>
                <div className="formula-part formula-result">
                  <span className="formula-num">₹{formatCurrency(totalFare)}</span>
                  <span className="formula-label">Total Fare</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 4. Trip Summary & Controls Section with Save to Google Sheets */}
        <section className={`trip-summary-section ${mobileTab !== 'all' && mobileTab !== 'summary' ? 'mobile-hidden' : ''}`} aria-labelledby="summary-heading">
          <div className="summary-header">
            <div>
              <h2 id="summary-heading" className="section-title">
                Trip Summary &amp; Controls
              </h2>
              <p className="section-description">
                Auto-detected route locations, 1-click Google Sheets export, and controls
              </p>
            </div>

            <div className="summary-actions">
              {/* SAVE TO GOOGLE SHEETS BUTTON (Direct 1-Click Save — No Dialog) */}
              <button
                type="button"
                id="btn-save-sheets"
                className={`btn-save-sheets ${saveButtonState === 'saving' ? 'btn-saving' : ''} ${saveButtonState === 'saved' ? 'btn-saved' : ''}`}
                onClick={handleDirectSaveToSheets}
                disabled={isSaving}
                title="Directly save starting location, destination, distance and fare to Google Sheets"
              >
                {saveButtonState === 'saving' ? (
                  <>
                    <Activity size={17} className="spin-slow" />
                    <span>Saving to Google Sheet...</span>
                  </>
                ) : saveButtonState === 'saved' ? (
                  <>
                    <CheckCircle2 size={17} />
                    <span>✓ Saved to Google Sheet!</span>
                  </>
                ) : (
                  <>
                    <FileSpreadsheet size={17} />
                    <span>Save to Google Sheets</span>
                  </>
                )}
              </button>



              <button
                type="button"
                id="btn-copy-summary"
                className="btn-secondary"
                onClick={handleCopySummary}
                title="Copy trip breakdown to clipboard"
              >
                {isCopied ? <Check size={16} className="text-green" /> : <Copy size={16} />}
                <span>{isCopied ? 'Copied Receipt!' : 'Copy Summary'}</span>
              </button>

              <button
                type="button"
                id="btn-reset-calculator"
                className="btn-reset"
                onClick={resetCalculator}
                title="Reset distance to 1 km and rate to ₹20/km"
              >
                <RotateCcw size={16} />
                <span>Reset Calculator</span>
              </button>
            </div>
          </div>

          {/* Instant Save Toast Notification */}
          {saveToast && (
            <div className={`save-toast-banner toast-${saveToast.type}`} role="status">
              <div className="toast-icon-wrap">
                {saveToast.type === 'success' ? (
                  <CheckCircle2 size={18} className="text-green" />
                ) : (
                  <AlertCircle size={18} className="text-amber" />
                )}
              </div>
              <div className="toast-text">{saveToast.message}</div>
              <button
                type="button"
                className="toast-close-btn"
                onClick={() => setSaveToast(null)}
                aria-label="Dismiss notice"
              >
                <X size={15} />
              </button>
            </div>
          )}



          {/* Auto-Detected Route & Locations Bar */}
          <div className="route-locations-display" aria-label="Trip Route Locations">
            <div className="route-point-box start-box">
              <div className="route-box-header">
                <div className="route-box-title">
                  <MapPin size={16} className="text-start-pin" />
                  <span>Starting Location</span>
                </div>
                <span className="route-badge-auto">
                  {startCoords ? '📍 Auto GPS Fix' : 'Auto Detect'}
                </span>
              </div>
              <div className="route-box-body">
                <input
                  type="text"
                  className="route-input"
                  value={startLocation}
                  onChange={(e) => setStartLocation(e.target.value)}
                  placeholder={isTracking ? 'Detecting start location...' : 'Captured automatically on trip start'}
                  title="Automatically detected starting location"
                />
              </div>
            </div>

            <div className="route-connector-box" aria-hidden="true">
              <div className="route-line" />
              <div className="route-arrow-circle">
                <ArrowRight size={16} />
              </div>
            </div>

            <div className="route-point-box end-box">
              <div className="route-box-header">
                <div className="route-box-title">
                  <Flag size={16} className="text-end-flag" />
                  <span>Ending Location</span>
                </div>
                <span className="route-badge-auto">
                  {endCoords ? '🏁 Auto GPS Fix' : 'Auto Detect'}
                </span>
              </div>
              <div className="route-box-body">
                <input
                  type="text"
                  className="route-input"
                  value={endLocation}
                  onChange={(e) => setEndLocation(e.target.value)}
                  placeholder={isTracking ? 'Tracking route live...' : 'Captured automatically on trip stop'}
                  title="Automatically detected ending location"
                />
              </div>
            </div>
          </div>

          <div className="summary-grid">
            <div className="summary-stat-card">
              <span className="stat-label">Total Distance</span>
              <div className="stat-value-group">
                <span className="stat-number">{distance.toFixed(2)}</span>
                <span className="stat-unit">km</span>
              </div>
              <span className="stat-sub">
                {isTracking ? 'Measured via GPS' : 'Manual / stopped entry'}
              </span>
            </div>

            <div className="summary-stat-card">
              <span className="stat-label">Price Per KM</span>
              <div className="stat-value-group">
                <span className="stat-unit">₹</span>
                <span className="stat-number">{rate.toFixed(2)}</span>
              </div>
              <span className="stat-sub">Applicable tariff</span>
            </div>

            <div className="summary-stat-card">
              <span className="stat-label">Trip Duration</span>
              <div className="stat-value-group">
                <span className="stat-number font-mono">{formatDuration(elapsedSeconds)}</span>
              </div>
              <span className="stat-sub">
                {isTracking ? 'Clock running' : 'Trip stopped / static'}
              </span>
            </div>

            <div className="summary-stat-card highlight-fare-card">
              <div className="stat-label-wrap">
                <span className="stat-label">Total Fare</span>
                <span className="fare-badge-collect">₹ Collect Fare</span>
              </div>
              <div className="stat-value-group">
                <span className="stat-unit">₹</span>
                <span className="stat-number">{formatCurrency(totalFare)}</span>
              </div>
              <span className="stat-sub">
                {distance.toFixed(2)} km × ₹{rate.toFixed(2)}/km
              </span>
            </div>
          </div>

          {/* Quick Saved History Toggle */}
          {savedTrips.length > 0 && (
            <div className="saved-trips-bar">
              <button
                type="button"
                className="btn-history-toggle"
                onClick={() => setShowSavedHistory((prev) => !prev)}
              >
                <History size={15} />
                <span>
                  {showSavedHistory ? 'Hide' : 'View'} Saved Trips Log ({savedTrips.length})
                </span>
                {showSavedHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>
          )}

          {/* Saved Trips History Table */}
          {showSavedHistory && savedTrips.length > 0 && (
            <div className="saved-history-panel">
              <div className="history-header">
                <h4>Recent Saved Trips Log</h4>
                <button
                  type="button"
                  className="btn-clear-history"
                  onClick={handleClearHistory}
                  title="Clear history log"
                >
                  <Trash2 size={13} />
                  <span>Clear Log</span>
                </button>
              </div>

              <div className="history-table-wrapper">
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>Date / Time</th>
                      <th>Starting Location</th>
                      <th>Ending Location</th>
                      <th>Distance</th>
                      <th>Total Fare</th>
                      <th>Mode</th>
                    </tr>
                  </thead>
                  <tbody>
                    {savedTrips.slice(0, 10).map((trip) => (
                      <tr key={trip.id}>
                        <td>
                          <div className="cell-datetime">
                            <span>{trip.date}</span>
                            <small>{trip.time}</small>
                          </div>
                        </td>
                        <td>
                          <div className="cell-location">{trip.startLocation}</div>
                        </td>
                        <td>
                          <div className="cell-location">{trip.endLocation}</div>
                        </td>
                        <td>
                          <strong>{trip.distance}</strong>
                        </td>
                        <td>
                          <strong className="cell-fare">{trip.amount}</strong>
                        </td>
                        <td>
                          <span className="cell-mode-badge">{trip.trackingMode}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
        {/* Quick Floating Fare Bar for Mobile (Always visible and close at hand) */}
        <div className="mobile-sticky-fare-bar" aria-label="Quick Fare Summary">
          <div className="sticky-fare-info">
            <span className="sticky-fare-label">Total Fare</span>
            <div className="sticky-fare-numbers">
              <span className="sticky-fare-currency">₹</span>
              <span className="sticky-fare-amount">{formatCurrency(totalFare)}</span>
            </div>
            <span className="sticky-fare-meta">{distance.toFixed(2)} km @ ₹{rate.toFixed(0)}</span>
          </div>
          <div className="sticky-fare-actions">
            <button
              type="button"
              className={`btn-sticky-save ${saveButtonState === 'saving' ? 'btn-saving' : ''} ${saveButtonState === 'saved' ? 'btn-saved' : ''}`}
              onClick={handleDirectSaveToSheets}
              disabled={isSaving}
              title="Save directly to Google Sheets"
            >
              {saveButtonState === 'saving' ? (
                <>
                  <Activity size={15} className="spin-slow" />
                  <span>Saving...</span>
                </>
              ) : saveButtonState === 'saved' ? (
                <>
                  <CheckCircle2 size={15} />
                  <span>Saved!</span>
                </>
              ) : (
                <>
                  <FileSpreadsheet size={15} />
                  <span>Save Sheet</span>
                </>
              )}
            </button>
          </div>
        </div>
      </main>

      {/* 5. Footer */}
      <footer className="app-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <span className="footer-title">KiloFare</span>
            <span className="footer-separator">•</span>
            <span className="footer-partner-text">Karumbukkadai Delivery Pasanga</span>
            <span className="footer-separator">•</span>
            <span className="footer-tagline">Distance × Rate = Fare</span>
          </div>
          <p className="footer-notes">
            Kilometer &amp; Fare Calculator • Powered for Karumbukkadai Delivery Pasanga • Google Sheets Integration &amp; GPS trip tracking.
          </p>
        </div>
      </footer>

    </div>
  );
}
