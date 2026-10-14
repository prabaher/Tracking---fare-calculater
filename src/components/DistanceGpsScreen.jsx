import React from 'react';
import {
  MapPin,
  Lock,
  Unlock,
  Clock,
  Play,
  Pause,
  Square,
  RotateCcw,
  Navigation,
  AlertCircle,
  Info,
  Flag,
  Crosshair,
  Car,
  Compass,
  Zap,
  ArrowDownCircle,
  Activity,
} from 'lucide-react';
import LiveTripMap from './LiveTripMap';
import { formatDuration, formatCurrency, computeAverageSpeedKmh } from '../utils/geoUtils';

function formatClockTime(timestamp) {
  if (!Number.isFinite(timestamp)) return '--:--';
  return new Date(timestamp).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Distance & GPS — live trip view.
 *
 * Layout mirrors the trip detail reference: the recorded route on the map on
 * top, and a dark sheet underneath carrying distance, the three live metric
 * chips (duration / average speed / max speed), the START-STOP timeline with
 * addresses, the live fare and the tracking controls.
 */
export default function DistanceGpsScreen({
  distance,
  inputDistance,
  onDistanceChange,
  onDistanceBlur,
  isTracking,
  isPaused,
  trackingStatus,
  statusBadge,
  gpsAccuracy,
  gpsPointsCount,
  elapsedSeconds,
  lastCoords,
  startCoords,
  endCoords,
  startLocation,
  endLocation,
  setStartLocation,
  setEndLocation,
  gpsError,
  routeCoordinates = [],
  maxSpeed = 0,
  rate = 0,
  totalFare = 0,
  tripStartedAt = null,
  tripEndedAt = null,
  onStartTrip,
  onPauseTrip,
  onResumeTrip,
  onStopTrip,
  onResetTrip,
}) {
  const averageSpeed = computeAverageSpeedKmh(distance, elapsedSeconds);
  // Captured once on mount so nothing impure runs during render.
  const [mountDate] = React.useState(() => new Date().toLocaleDateString('en-GB'));
  const dateLabel = Number.isFinite(tripStartedAt)
    ? new Date(tripStartedAt).toLocaleDateString('en-GB')
    : mountDate;
  const isLive = isTracking && !isPaused;
  const hasTripData = distance > 0 || elapsedSeconds > 0;

  const badge = statusBadge || { label: trackingStatus, className: 'badge-ready', dotClass: 'dot-blue' };

  const stopTimeLabel = tripEndedAt
    ? formatClockTime(tripEndedAt)
    : isTracking
    ? 'in progress'
    : '--:--';

  return (
    <div className="distance-gps-screen" aria-label="Distance and GPS tracker">
      {gpsError && (
        <div className="alert-banner" role="alert">
          <AlertCircle size={18} className="alert-icon" />
          <div className="alert-content">
            <strong>Location Status:</strong> {gpsError}
          </div>
        </div>
      )}

      {/* 1. Live route map */}
      <div className="live-map-wrapper">
        <LiveTripMap
          routeCoordinates={routeCoordinates}
          startCoords={startCoords}
          endCoords={endCoords}
          follow={isLive}
        />

        <div className="live-map-overlays">
          <div className={`status-pill ${badge.className}`}>
            <span className={`status-indicator-dot ${badge.dotClass}`} />
            <span className="status-pill-text">{badge.label}</span>
          </div>

          {gpsAccuracy !== null && gpsAccuracy !== undefined && (
            <span
              className={`live-accuracy-chip ${
                gpsAccuracy <= 20 ? 'acc-good' : gpsAccuracy <= 50 ? 'acc-fair' : 'acc-poor'
              }`}
            >
              ±{gpsAccuracy}m
            </span>
          )}

          {isLive && (
            <span className="live-map-rec">
              <span className="live-map-rec-dot" />
              LIVE
            </span>
          )}
        </div>
      </div>

      {/* 2. Dark trip sheet (distance, live metrics, timeline, fare, controls) */}
      <div className="detail-sheet-card live-sheet-card">
        <div className="detail-sheet-header">
          <div className="detail-distance-row">
            <Car size={22} className="detail-vehicle-icon" />
            <h2 className="detail-distance-value">{distance.toFixed(2)} km</h2>
          </div>
          <span className="detail-trip-date">{dateLabel}</span>
        </div>

        {/* Live metric chips — duration is always timestamp-derived */}
        <div className="detail-metrics-row">
          <div className="detail-metric-chip">
            <div className="metric-chip-icon-circle">
              <Clock size={18} />
            </div>
            <div className="metric-chip-value font-mono">{formatDuration(elapsedSeconds)}</div>
            <div className="metric-chip-label">Duration</div>
          </div>

          <div className="detail-metric-chip">
            <div className="metric-chip-icon-circle">
              <Compass size={18} />
            </div>
            <div className="metric-chip-value">{averageSpeed} km/h</div>
            <div className="metric-chip-label">Avg speed</div>
          </div>

          <div className="detail-metric-chip">
            <div className="metric-chip-icon-circle">
              <Zap size={18} />
            </div>
            <div className="metric-chip-value">{Math.round(maxSpeed || 0)} km/h</div>
            <div className="metric-chip-label">Max.Speed</div>
          </div>
        </div>

        {/* START / STOP timeline */}
        <div className="detail-timeline-container">
          <div className="timeline-node timeline-start">
            <div className="timeline-icon-col">
              <div className="timeline-start-badge">
                <ArrowDownCircle size={15} />
              </div>
              <div className="timeline-connector-line" />
            </div>
            <div className="timeline-content-col">
              <div className="timeline-title-row">
                <span className="timeline-type-label">START</span>
                <span className="timeline-time">{formatClockTime(tripStartedAt)}</span>
              </div>
              <p className="timeline-address">
                {startLocation ||
                  (isTracking
                    ? 'Acquiring start GPS...'
                    : 'Not captured yet — captured when a trip starts')}
              </p>
            </div>
          </div>

          <div className="timeline-node timeline-stop">
            <div className="timeline-icon-col">
              <div className="timeline-stop-badge">
                <MapPin size={15} />
              </div>
            </div>
            <div className="timeline-content-col">
              <div className="timeline-title-row">
                <span className="timeline-type-label text-orange">STOP</span>
                <span className="timeline-time">{stopTimeLabel}</span>
              </div>
              <p className="timeline-address">
                {endLocation ||
                  (isTracking
                    ? 'Tracking route live...'
                    : hasTripData
                    ? 'Destination captured on stop'
                    : 'Not captured yet — recorded when the trip stops')}
              </p>
            </div>
          </div>
        </div>

        {/* Fare summary */}
        <div className="detail-fare-footer">
          <div className="detail-fare-info">
            <span className="detail-fare-rate-badge">Rate: ₹{rate.toFixed(2)}/km</span>
            <span className="detail-mode-badge">
              {routeCoordinates.length > 0 ? 'GPS Tracking' : 'Manual Entry'}
            </span>
          </div>
          <div className="detail-total-fare">
            <span className="detail-fare-label">Total Fare</span>
            <span className="detail-fare-amount">₹{formatCurrency(totalFare)}</span>
          </div>
        </div>

        {/* Tracking controls */}
        <div className="sheet-controls">
          {!isTracking ? (
            <button
              type="button"
              id="btn-start-gps-tab"
              className="btn-action btn-start-gps"
              onClick={onStartTrip}
            >
              <Play size={18} fill="currentColor" />
              <span>Start GPS Trip</span>
            </button>
          ) : (
            <div className="gps-active-buttons">
              {!isPaused ? (
                <button
                  type="button"
                  id="btn-pause-gps-tab"
                  className="btn-action btn-pause-gps"
                  onClick={onPauseTrip}
                >
                  <Pause size={17} />
                  <span>Pause</span>
                </button>
              ) : (
                <button
                  type="button"
                  id="btn-resume-gps-tab"
                  className="btn-action btn-start-gps"
                  onClick={onResumeTrip}
                >
                  <Play size={17} fill="currentColor" />
                  <span>Resume</span>
                </button>
              )}

              <button
                type="button"
                id="btn-stop-gps-tab"
                className="btn-action btn-stop-gps"
                onClick={onStopTrip}
              >
                <Square size={17} fill="currentColor" />
                <span>Stop Trip</span>
              </button>
            </div>
          )}

          {(hasTripData || isTracking) && (
            <button type="button" className="btn-reset-full" onClick={onResetTrip}>
              <RotateCcw size={15} />
              <span>Reset Trip</span>
            </button>
          )}
        </div>
      </div>

      {/* 3. GPS telemetry + manual controls (secondary, below the sheet) */}
      <div className="dashboard-card gps-detail-card">
        <div className="card-header">
          <div className="card-header-icon bg-primary">
            <Navigation size={20} className="text-primary" />
          </div>
          <div>
            <h2 className="card-title">GPS Telemetry</h2>
            <p className="card-description">Live receiver status and recorded fixes</p>
          </div>
        </div>

        <div className="gps-telemetry-panel">
          <div className="telemetry-item">
            <span className="telemetry-label">Status</span>
            <span className="telemetry-value status-text-colored">{trackingStatus}</span>
          </div>

          <div className="telemetry-item">
            <span className="telemetry-label">Accuracy</span>
            <span className="telemetry-value">
              {gpsAccuracy !== null && gpsAccuracy !== undefined ? (
                <span
                  className={
                    gpsAccuracy <= 20 ? 'acc-good' : gpsAccuracy <= 50 ? 'acc-fair' : 'acc-poor'
                  }
                >
                  ±{gpsAccuracy}m {gpsAccuracy <= 20 ? '(High)' : '(Std)'}
                </span>
              ) : (
                '—'
              )}
            </span>
          </div>

          <div className="telemetry-item">
            <span className="telemetry-label">Duration</span>
            <span className="telemetry-value font-mono">
              <Clock size={12} className="telemetry-icon" />
              {formatDuration(elapsedSeconds)}
            </span>
          </div>

          <div className="telemetry-item">
            <span className="telemetry-label">GPS Fixes</span>
            <span className="telemetry-value">{gpsPointsCount} fixes</span>
          </div>
        </div>

        {lastCoords && (
          <div className="coords-readout-pill">
            <Crosshair size={13} className="text-primary" />
            <span>
              Lat: {lastCoords.lat.toFixed(4)}, Lon: {lastCoords.lon.toFixed(4)}
            </span>
          </div>
        )}

        {isLive && (
          <p className="telemetry-hint">
            <Activity size={13} className="inline-icon spin-slow" />
            Measuring the route in real time. Distance only counts plausible, accurate fixes.
          </p>
        )}
      </div>

      {/* 4. Manual distance entry */}
      <div className="dashboard-card">
        <div className="card-header">
          <div className="card-header-icon bg-accent">
            <MapPin size={20} className="text-accent" />
          </div>
          <div>
            <h2 className="card-title">Manual Distance</h2>
            <p className="card-description">Override the odometer when GPS is unavailable</p>
          </div>
        </div>

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
              onChange={onDistanceChange}
              onBlur={onDistanceBlur}
              disabled={isTracking}
              placeholder="0.00"
              className="number-input"
              aria-describedby="distance-helper"
            />
            <span className="input-suffix">KM</span>
          </div>
          <p id="distance-helper" className="helper-text">
            {isTracking
              ? 'Distance is automatically calculated by GPS while a trip is active.'
              : 'Enter the distance directly in kilometers (e.g. 5.5, 14.89).'}
          </p>
        </div>
      </div>

      {/* 5. Route locations */}
      <div className="dashboard-card location-edit-card">
        <div className="card-header">
          <div className="card-header-icon bg-accent">
            <MapPin size={20} className="text-accent" />
          </div>
          <div>
            <h2 className="card-title">Route Locations</h2>
            <p className="card-description">Auto-detected address or manual override</p>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="start-location-input" className="form-label">
            <span className="flex-row items-center gap-1">
              <MapPin size={13} className="text-start-pin" /> Starting Location
            </span>
            <span className="helper-badge">{startCoords ? 'GPS Detected' : 'Manual'}</span>
          </label>
          <input
            id="start-location-input"
            type="text"
            className="text-input"
            value={startLocation}
            onChange={(e) => setStartLocation(e.target.value)}
            placeholder="Starting address or landmark"
          />
        </div>

        <div className="form-group">
          <label htmlFor="end-location-input" className="form-label">
            <span className="flex-row items-center gap-1">
              <Flag size={13} className="text-end-flag" /> Destination / Stop
            </span>
            <span className="helper-badge">{endCoords ? 'GPS Detected' : 'Manual'}</span>
          </label>
          <input
            id="end-location-input"
            type="text"
            className="text-input"
            value={endLocation}
            onChange={(e) => setEndLocation(e.target.value)}
            placeholder="Destination address or landmark"
          />
        </div>
      </div>

      <div className="gps-notice-box">
        <Info size={16} className="notice-icon" />
        <span>
          Uses the browser Geolocation API. While the phone screen sleeps the duration is
          preserved through timestamps, but mobile browsers may pause GPS polling when locked.
        </span>
      </div>
    </div>
  );
}
