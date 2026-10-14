import React from 'react';
import {
  Play,
  Pause,
  Square,
  RotateCcw,
  Save,
  CheckCircle2,
  Clock,
  IndianRupee,
  MapPin,
  Flag,
  ArrowRight,
  Activity,
  AlertCircle,
  Copy,
  Check
} from 'lucide-react';
import { formatCurrency, formatDuration } from '../utils/geoUtils';

export default function HomeDashboard({
  distance,
  rate,
  totalFare,
  elapsedSeconds,
  isTracking,
  isPaused,
  trackingStatus,
  statusBadge,
  gpsError,
  startLocation,
  endLocation,
  isSaved,
  isSaving,
  saveToast,
  onStartTrip,
  onPauseTrip,
  onResumeTrip,
  onStopTrip,
  onSaveTrip,
  onResetTrip,
  onSwitchTab,
}) {
  const [copied, setCopied] = React.useState(false);

  const handleCopyReceipt = () => {
    const text = `🚗 KiloFare Trip Receipt
Distance: ${distance.toFixed(2)} km
Rate: ₹${rate.toFixed(2)}/km
Total Fare: ₹${formatCurrency(totalFare)}
Duration: ${formatDuration(elapsedSeconds)}
Start: ${startLocation || 'Not specified'}
Stop: ${endLocation || 'Not specified'}
Status: ${trackingStatus}
Calculation: ${distance.toFixed(2)} km × ₹${rate.toFixed(2)} = ₹${formatCurrency(totalFare)}`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const hasTripData = distance > 0 || elapsedSeconds > 0;

  return (
    <div className="home-dashboard" aria-label="Home Trip Dashboard">
      {/* GPS Error Banner if present */}
      {gpsError && (
        <div className="home-alert-banner" role="alert">
          <AlertCircle size={18} className="alert-banner-icon" />
          <div className="alert-banner-text">
            <strong>GPS Notice:</strong> {gpsError}
          </div>
        </div>
      )}

      {/* Instant Save Toast Notification */}
      {saveToast && (
        <div className={`save-toast-banner toast-${saveToast.type}`} role="status">
          <CheckCircle2 size={18} className="text-green" />
          <div className="toast-text">{saveToast.message}</div>
        </div>
      )}

      {/* B. Main Distance Card */}
      <div className="home-main-card">
        <div className="main-card-top">
          <div className={`status-pill ${statusBadge.className}`}>
            <span className={`status-indicator-dot ${statusBadge.dotClass}`} />
            <span className="status-pill-text">{statusBadge.label}</span>
          </div>

          {isTracking && (
            <span className="live-telemetry-badge">
              <Activity size={12} className="spin-slow" /> Live Tracking
            </span>
          )}
        </div>

        <div className="main-distance-readout">
          <span className="main-distance-num">{distance.toFixed(2)}</span>
          <span className="main-distance-unit">km</span>
        </div>

        <p className="main-distance-hint">
          {isTracking
            ? isPaused
              ? 'Trip paused • Timer and distance calculation on hold'
              : 'Tracking your journey in real time with high precision'
            : hasTripData
            ? 'Trip completed • Save to history or start a new trip'
            : 'Ready to track • Tap Start Trip below'}
        </p>

        {/* E. Primary Trip Controls */}
        <div className="home-controls-row">
          {!isTracking ? (
            <>
              <button
                type="button"
                id="btn-start-trip"
                className="btn-main-action btn-start-primary"
                onClick={onStartTrip}
              >
                <Play size={18} fill="currentColor" />
                <span>Start Trip</span>
              </button>

              {hasTripData && (
                <>
                  <button
                    type="button"
                    id="btn-save-trip"
                    className={`btn-main-action btn-save-secondary ${isSaved ? 'is-saved' : ''}`}
                    onClick={onSaveTrip}
                    disabled={isSaving || isSaved}
                  >
                    {isSaved ? (
                      <>
                        <CheckCircle2 size={16} />
                        <span>Saved ✓</span>
                      </>
                    ) : (
                      <>
                        <Save size={16} />
                        <span>{isSaving ? 'Saving...' : 'Save Trip'}</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    id="btn-reset-trip"
                    className="btn-icon-secondary"
                    onClick={onResetTrip}
                    title="Reset to new trip"
                    aria-label="Reset trip"
                  >
                    <RotateCcw size={16} />
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              {!isPaused ? (
                <button
                  type="button"
                  id="btn-pause-trip"
                  className="btn-main-action btn-pause-action"
                  onClick={onPauseTrip}
                >
                  <Pause size={18} />
                  <span>Pause</span>
                </button>
              ) : (
                <button
                  type="button"
                  id="btn-resume-trip"
                  className="btn-main-action btn-resume-action"
                  onClick={onResumeTrip}
                >
                  <Play size={18} fill="currentColor" />
                  <span>Resume</span>
                </button>
              )}

              <button
                type="button"
                id="btn-stop-trip"
                className="btn-main-action btn-stop-action"
                onClick={onStopTrip}
              >
                <Square size={17} fill="currentColor" />
                <span>Stop Trip</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* C. Trip Metrics Cards */}
      <div className="home-metrics-grid">
        <div
          className="metric-card"
          onClick={() => onSwitchTab('fare')}
          role="button"
          tabIndex={0}
          title="Tap to change fare rate"
        >
          <div className="metric-card-header">
            <span className="metric-card-label">Fare Rate</span>
            <IndianRupee size={14} className="metric-card-icon text-muted" />
          </div>
          <div className="metric-card-val-row">
            <span className="metric-card-val">₹{rate.toFixed(2)}</span>
            <span className="metric-card-sub">/ km</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-card-header">
            <span className="metric-card-label">Duration</span>
            <Clock size={14} className="metric-card-icon text-muted" />
          </div>
          <div className="metric-card-val-row">
            <span className="metric-card-val font-mono">
              {formatDuration(elapsedSeconds)}
            </span>
          </div>
        </div>

        <div className="metric-card metric-card-fare">
          <div className="metric-card-header">
            <span className="metric-card-label text-accent">Total Fare</span>
            <span className="fare-calc-tag">{distance.toFixed(1)} km × ₹{rate}</span>
          </div>
          <div className="metric-card-val-row">
            <span className="metric-card-fare-sym">₹</span>
            <span className="metric-card-fare-val">{formatCurrency(totalFare)}</span>
          </div>
        </div>
      </div>

      {/* D. Start & End Locations Card */}
      <div className="home-locations-card">
        <div className="location-item location-start">
          <div className="location-icon-wrap">
            <MapPin size={16} className="text-start-pin" />
          </div>
          <div className="location-text-wrap">
            <span className="location-meta-label">STARTING LOCATION</span>
            <p className="location-address">
              {startLocation || (isTracking ? 'Detecting start GPS...' : 'Not captured yet (captures on start)')}
            </p>
          </div>
        </div>

        <div className="location-divider">
          <div className="location-line" />
          <div className="location-arrow">
            <ArrowRight size={14} />
          </div>
        </div>

        <div className="location-item location-stop">
          <div className="location-icon-wrap">
            <Flag size={16} className="text-end-flag" />
          </div>
          <div className="location-text-wrap">
            <span className="location-meta-label">DESTINATION / STOP</span>
            <p className="location-address">
              {endLocation ||
                (isTracking
                  ? 'Tracking route live...'
                  : hasTripData
                  ? 'Destination captured on stop'
                  : 'Will be recorded on trip completion')}
            </p>
          </div>
        </div>
      </div>

      {/* Quick Receipt Action */}
      {hasTripData && (
        <div className="home-secondary-actions">
          <button
            type="button"
            className="btn-quick-receipt"
            onClick={handleCopyReceipt}
          >
            {copied ? <Check size={15} className="text-green" /> : <Copy size={15} />}
            <span>{copied ? 'Receipt Copied!' : 'Copy Trip Summary'}</span>
          </button>
        </div>
      )}

      {/* F. Minimal Unobtrusive Footer */}
      <footer className="home-minimal-footer">
        <span>KiloFare • Precision GPS &amp; Fare Meter</span>
      </footer>
    </div>
  );
}
