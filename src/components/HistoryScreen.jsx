import React, { useState } from 'react';
import {
  Car,
  Clock,
  Compass,
  ChevronRight,
  ListFilter,
  Trash2,
  PlusCircle,
  CheckSquare,
  Square,
  AlertTriangle
} from 'lucide-react';
import RouteMapThumbnail from './RouteMapThumbnail';
import { groupTripsByDate } from '../utils/geoUtils';

export default function HistoryScreen({
  trips = [],
  onSelectTrip,
  onDeleteTrip,
  onClearAllTrips,
  onNavigateHome,
}) {
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [tripToDelete, setTripToDelete] = useState(null);
  const [showClearAllModal, setShowClearAllModal] = useState(false);

  const grouped = groupTripsByDate(trips);
  const dateKeys = Object.keys(grouped);

  const toggleSelectTrip = (id, e) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    if (window.confirm(`Delete ${selectedIds.size} selected trip record(s)?`)) {
      selectedIds.forEach((id) => onDeleteTrip(id));
      setSelectedIds(new Set());
      setIsSelectMode(false);
    }
  };

  const confirmDeleteRecord = () => {
    if (tripToDelete) {
      onDeleteTrip(tripToDelete.id);
      setTripToDelete(null);
    }
  };

  const confirmClearAll = () => {
    if (onClearAllTrips) {
      onClearAllTrips();
    }
    setShowClearAllModal(false);
  };

  return (
    <div className="history-screen-container" aria-label="Trip History">
      {/* History Header */}
      <div className="history-header-bar">
        <div className="history-title-group">
          <h1 className="history-page-title">History</h1>
          <span className="history-count-badge">{trips.length} records</span>
        </div>

        <div className="history-header-actions">
          {trips.length > 0 && (
            <>
              {isSelectMode ? (
                <>
                  <button
                    type="button"
                    className="btn-history-action btn-danger-action"
                    disabled={selectedIds.size === 0}
                    onClick={handleDeleteSelected}
                  >
                    <Trash2 size={15} />
                    <span>Delete ({selectedIds.size})</span>
                  </button>
                  <button
                    type="button"
                    className="btn-history-action"
                    onClick={() => {
                      setIsSelectMode(false);
                      setSelectedIds(new Set());
                    }}
                  >
                    Done
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn-history-action btn-clear-text"
                    onClick={() => setShowClearAllModal(true)}
                    title="Clear all records"
                  >
                    Clear All
                  </button>
                  <button
                    type="button"
                    className="btn-history-action"
                    onClick={() => setIsSelectMode(true)}
                  >
                    <ListFilter size={15} />
                    <span>Select</span>
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Trips list grouped by date */}
      {trips.length === 0 ? (
        <div className="history-empty-state">
          <div className="empty-icon-circle">
            <Clock size={36} className="text-muted" />
          </div>
          <h3>No Saved Records</h3>
          <p>
            When you complete trips and tap Save, they will appear here with route maps and details.
          </p>
          <button
            type="button"
            className="btn-empty-start-trip"
            onClick={onNavigateHome}
          >
            <PlusCircle size={17} />
            <span>Start a Trip on Home</span>
          </button>
        </div>
      ) : (
        <div className="history-groups-list">
          {dateKeys.map((dateStr) => {
            const dateTrips = grouped[dateStr];
            return (
              <div key={dateStr} className="history-date-group">
                <div className="history-date-heading">{dateStr}</div>

                <div className="history-cards-column">
                  {dateTrips.map((trip) => {
                    const isSelected = selectedIds.has(trip.id);
                    const formattedDuration = trip.duration.endsWith('s')
                      ? trip.duration
                      : `${trip.duration} s`;

                    return (
                      <div
                        key={trip.id}
                        className={`history-trip-card ${isSelected ? 'is-selected' : ''}`}
                        onClick={() => {
                          if (isSelectMode) {
                            toggleSelectTrip(trip.id, { stopPropagation: () => {} });
                          } else {
                            onSelectTrip(trip);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        aria-label={`Trip on ${trip.date}: ${trip.distance}`}
                      >
                        {/* Select checkbox if in select mode */}
                        {isSelectMode && (
                          <div
                            className="history-checkbox-wrap"
                            onClick={(e) => toggleSelectTrip(trip.id, e)}
                          >
                            {isSelected ? (
                              <CheckSquare size={19} className="text-green" />
                            ) : (
                              <Square size={19} className="text-muted" />
                            )}
                          </div>
                        )}

                        {/* Left Info Section */}
                        <div className="history-card-left">
                          {/* Distance row with vehicle icon and chevron */}
                          <div className="history-card-distance-row">
                            <Car size={18} className="history-car-icon" />
                            <span className="history-card-distance">{trip.distance}</span>
                            <ChevronRight size={18} className="history-card-chevron" />
                          </div>

                          {/* Duration row */}
                          <div className="history-card-metric-row">
                            <Clock size={14} className="metric-icon-duration" />
                            <span className="metric-text font-mono">{formattedDuration}</span>
                          </div>

                          {/* Speed row & direct delete button */}
                          <div className="history-card-bottom-row">
                            <div className="history-card-metric-row">
                              <Compass size={14} className="metric-icon-speed" />
                              <span className="metric-text">{trip.avgSpeed ?? 0} km/h</span>
                            </div>

                            {/* Direct Individual Delete Button on Each Record */}
                            {!isSelectMode && (
                              <button
                                type="button"
                                className="btn-record-delete"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setTripToDelete(trip);
                                }}
                                title="Delete this trip record"
                                aria-label="Delete this trip record"
                              >
                                <Trash2 size={15} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Right Map Preview Section */}
                        <div className="history-card-right">
                          <RouteMapThumbnail
                            routeCoordinates={trip.routeCoordinates}
                            startCoords={trip.startCoords}
                            endCoords={trip.endCoords}
                            title={trip.distance}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <span className="map-attribution-note">
            Route maps &copy;{' '}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
              OpenStreetMap
            </a>{' '}
            contributors
          </span>
        </div>
      )}

      {/* Confirmation Modal for Individual Record Deletion */}
      {tripToDelete && (
        <div className="confirm-modal-overlay" role="dialog" aria-modal="true">
          <div className="confirm-modal-box">
            <div className="confirm-modal-icon-wrap">
              <Trash2 size={24} className="text-red" />
            </div>
            <h3>Delete this Record?</h3>
            <p>
              Are you sure you want to delete the trip record of{' '}
              <strong>{tripToDelete.distance}</strong> ({tripToDelete.date || tripToDelete.dateGroup})?
            </p>
            <div className="confirm-modal-actions">
              <button
                type="button"
                className="btn-modal-cancel"
                onClick={() => setTripToDelete(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-modal-delete"
                onClick={confirmDeleteRecord}
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Clear All Records */}
      {showClearAllModal && (
        <div className="confirm-modal-overlay" role="dialog" aria-modal="true">
          <div className="confirm-modal-box">
            <div className="confirm-modal-icon-wrap">
              <AlertTriangle size={24} className="text-red" />
            </div>
            <h3>Clear All Records?</h3>
            <p>
              Are you sure you want to permanently clear all {trips.length} saved trip records?
            </p>
            <div className="confirm-modal-actions">
              <button
                type="button"
                className="btn-modal-cancel"
                onClick={() => setShowClearAllModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-modal-delete"
                onClick={confirmClearAll}
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
