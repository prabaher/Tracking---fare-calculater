import React, { useState } from 'react';
import {
  ChevronLeft,
  Trash2,
  Car,
  Clock,
  Compass,
  Zap,
  MapPin,
  ArrowDownCircle,
  Share2,
  Check
} from 'lucide-react';
import TripDetailMap from './TripDetailMap';

export default function TripDetailModal({ trip, onBack, onDelete }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [copiedReceipt, setCopiedReceipt] = useState(false);

  if (!trip) return null;

  const handleShareOrCopy = () => {
    const text = `🚗 KiloFare Trip Details
Distance: ${trip.distance}
Fare: ${trip.amount} (${trip.rate})
Duration: ${trip.duration}
Start: ${trip.startLocation || 'Unknown'} (${trip.time || '--:--'})
Destination: ${trip.endLocation || 'Unknown'} (${trip.endTime || '--:--'})
Mode: ${trip.trackingMode || 'GPS'}`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedReceipt(true);
      setTimeout(() => setCopiedReceipt(false), 2000);
    }
  };

  return (
    <div className="trip-detail-screen" aria-label="Trip Details">
      {/* 1. Header with back button & delete */}
      <div className="detail-top-nav">
        <button
          type="button"
          className="detail-back-btn"
          onClick={onBack}
          aria-label="Back to History"
        >
          <ChevronLeft size={22} />
          <span className="detail-back-label">History</span>
        </button>

        <div className="detail-top-actions">
          <button
            type="button"
            className="detail-action-icon-btn"
            onClick={handleShareOrCopy}
            title="Share / Copy Trip Receipt"
            aria-label="Share Trip"
          >
            {copiedReceipt ? <Check size={18} className="text-green" /> : <Share2 size={18} />}
          </button>
          <button
            type="button"
            className="detail-action-icon-btn btn-delete-trip"
            onClick={() => setShowDeleteConfirm(true)}
            title="Delete this saved trip"
            aria-label="Delete Trip"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      {/* 2. Interactive Route Map Area */}
      <div className="detail-map-wrapper">
        <TripDetailMap
          routeCoordinates={trip.routeCoordinates}
          startCoords={trip.startCoords}
          endCoords={trip.endCoords}
          distance={trip.distance}
        />
      </div>

      {/* 3. Dark Bottom Card / Sheet (Styled exactly like Screenshot 1) */}
      <div className="detail-sheet-card">
        {/* Main Distance and Date */}
        <div className="detail-sheet-header">
          <div className="detail-distance-row">
            <Car size={22} className="detail-vehicle-icon" />
            <h2 className="detail-distance-value">{trip.distance}</h2>
          </div>
          <span className="detail-trip-date">{trip.date || trip.dateGroup}</span>
        </div>

        {/* 3 Circular Metric Chips: Duration, Avg speed, Max.Speed */}
        <div className="detail-metrics-row">
          <div className="detail-metric-chip">
            <div className="metric-chip-icon-circle">
              <Clock size={18} />
            </div>
            <div className="metric-chip-value">
              {trip.duration.endsWith('s') ? trip.duration : `${trip.duration} s`}
            </div>
            <div className="metric-chip-label">Duration</div>
          </div>

          <div className="detail-metric-chip">
            <div className="metric-chip-icon-circle">
              <Compass size={18} />
            </div>
            <div className="metric-chip-value">{trip.avgSpeed ?? 0} km/h</div>
            <div className="metric-chip-label">Avg speed</div>
          </div>

          <div className="detail-metric-chip">
            <div className="metric-chip-icon-circle">
              <Zap size={18} />
            </div>
            <div className="metric-chip-value">{trip.maxSpeed ?? 0} km/h</div>
            <div className="metric-chip-label">Max.Speed</div>
          </div>
        </div>

        {/* Start and Stop Addresses Timeline */}
        <div className="detail-timeline-container">
          {/* Start Point */}
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
                <span className="timeline-time">{trip.time || '--:--'}</span>
              </div>
              <p className="timeline-address">
                {trip.startLocation || 'Recorded GPS Starting Coordinates'}
              </p>
            </div>
          </div>

          {/* Stop Point */}
          <div className="timeline-node timeline-stop">
            <div className="timeline-icon-col">
              <div className="timeline-stop-badge">
                <MapPin size={15} />
              </div>
            </div>
            <div className="timeline-content-col">
              <div className="timeline-title-row">
                <span className="timeline-type-label text-orange">STOP</span>
                <span className="timeline-time">{trip.endTime || '--:--'}</span>
              </div>
              <p className="timeline-address">
                {trip.endLocation || 'Recorded GPS Destination Coordinates'}
              </p>
            </div>
          </div>
        </div>

        {/* Fare & Tariff Summary Pill */}
        <div className="detail-fare-footer">
          <div className="detail-fare-info">
            <span className="detail-fare-rate-badge">Rate: {trip.rate}</span>
            <span className="detail-mode-badge">{trip.trackingMode || 'GPS Trip'}</span>
          </div>
          <div className="detail-total-fare">
            <span className="detail-fare-label">Total Fare</span>
            <span className="detail-fare-amount">{trip.amount}</span>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="confirm-modal-overlay" role="dialog" aria-modal="true">
          <div className="confirm-modal-box">
            <div className="confirm-modal-icon-wrap">
              <Trash2 size={24} className="text-red" />
            </div>
            <h3>Delete this Trip?</h3>
            <p>
              Are you sure you want to delete the trip on{' '}
              <strong>{trip.date || trip.dateGroup}</strong> ({trip.distance})? This action cannot be
              undone.
            </p>
            <div className="confirm-modal-actions">
              <button
                type="button"
                className="btn-modal-cancel"
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-modal-delete"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  onDelete(trip.id);
                }}
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
