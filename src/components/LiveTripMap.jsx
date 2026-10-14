import React, { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { Navigation } from 'lucide-react';

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

function isValidCoords(coords) {
  return (
    coords &&
    Number.isFinite(coords.lat) &&
    Number.isFinite(coords.lon) &&
    Math.abs(coords.lat) <= 90 &&
    Math.abs(coords.lon) <= 180
  );
}

/**
 * Live route map for the Distance & GPS screen.
 *
 * The Leaflet instance is created exactly ONCE. Every incoming GPS fix streams
 * into the existing polyline/markers (`setLatLngs`, `setLatLng`) instead of
 * rebuilding the map, so a fix every second stays cheap and the map never
 * flickers. The view fits the route on the first fix and then follows the
 * latest position while `follow` is true.
 */
export default function LiveTripMap({
  routeCoordinates = [],
  startCoords = null,
  endCoords = null,
  follow = false,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const polylineRef = useRef(null);
  const startMarkerRef = useRef(null);
  const endMarkerRef = useRef(null);
  const hasFittedRef = useRef(false);

  // Route points, or the start/end markers alone when the trip has no route yet.
  const latLngs = useMemo(() => {
    const recorded = (Array.isArray(routeCoordinates) ? routeCoordinates : [])
      .filter(isValidCoords)
      .map((point) => [point.lat, point.lon]);
    if (recorded.length > 0) return recorded;

    const fallback = [];
    if (isValidCoords(startCoords)) fallback.push([startCoords.lat, startCoords.lon]);
    if (isValidCoords(endCoords)) fallback.push([endCoords.lat, endCoords.lon]);
    return fallback;
  }, [routeCoordinates, startCoords, endCoords]);

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;

    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: true,
    });
    mapRef.current = map;

    L.tileLayer(TILE_URL, {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    // Neutral country-level view until the first real fix arrives.
    map.setView([11.0168, 76.9558], 11);

    const sizeTimer = setTimeout(() => {
      try {
        map.invalidateSize();
      } catch {
        /* map already gone */
      }
    }, 200);

    return () => {
      clearTimeout(sizeTimer);
      try {
        map.remove();
      } catch {
        /* ignore */
      }
      mapRef.current = null;
      polylineRef.current = null;
      startMarkerRef.current = null;
      endMarkerRef.current = null;
      hasFittedRef.current = false;
    };
  }, []);

  // Stream geometry updates into the existing map instance.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || latLngs.length === 0) return;

    if (latLngs.length >= 2) {
      if (!polylineRef.current) {
        polylineRef.current = L.polyline(latLngs, {
          color: '#22c55e',
          weight: 5,
          opacity: 0.95,
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(map);
      } else {
        polylineRef.current.setLatLngs(latLngs);
      }
    }

    const firstPoint = latLngs[0];
    const lastPoint = latLngs[latLngs.length - 1];

    if (!startMarkerRef.current) {
      const startIcon = L.divIcon({
        className: 'live-map-marker',
        html: '<div class="detail-start-pin"><svg width="12" height="12" viewBox="0 0 24 24" fill="#ffffff"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>',
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });
      startMarkerRef.current = L.marker(firstPoint, { icon: startIcon, interactive: false }).addTo(map);
    } else {
      startMarkerRef.current.setLatLng(firstPoint);
    }

    if (latLngs.length >= 2) {
      if (!endMarkerRef.current) {
        const endIcon = L.divIcon({
          className: 'live-map-marker',
          html: '<div class="detail-stop-pin"><div class="detail-stop-inner-dot"></div></div>',
          iconSize: [28, 36],
          iconAnchor: [14, 34],
        });
        endMarkerRef.current = L.marker(lastPoint, { icon: endIcon, interactive: false }).addTo(map);
      } else {
        endMarkerRef.current.setLatLng(lastPoint);
      }
    }

    if (!hasFittedRef.current) {
      const bounds = L.latLngBounds(latLngs);
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
        hasFittedRef.current = true;
      }
    } else if (follow) {
      map.panTo(lastPoint, { animate: true, duration: 0.4 });
    }
  }, [latLngs, follow]);

  return (
    <div className="live-map-container">
      <div ref={containerRef} className="live-trip-map" />

      {latLngs.length === 0 && (
        <div className="live-map-empty">
          <Navigation size={26} className="live-map-empty-icon" />
          <p className="live-map-empty-title">Waiting for the first GPS fix</p>
          <span className="live-map-empty-sub">
            Your route appears here as soon as the trip starts moving.
          </span>
        </div>
      )}
    </div>
  );
}
