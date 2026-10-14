import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { HelpCircle } from 'lucide-react';

export default function RouteMapThumbnail({ routeCoordinates = [], startCoords: _startCoords, endCoords: _endCoords, title = '' }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);

  const hasRoute =
    Array.isArray(routeCoordinates) &&
    routeCoordinates.length >= 2 &&
    typeof routeCoordinates[0].lat === 'number' &&
    typeof routeCoordinates[0].lon === 'number';

  useEffect(() => {
    if (!hasRoute || !mapContainerRef.current) return;

    // Clean up any existing map instance on this node
    if (mapInstanceRef.current) {
      try {
        mapInstanceRef.current.remove();
      } catch {}
      mapInstanceRef.current = null;
    }

    try {
      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        touchZoom: false,
        doubleClickZoom: false,
        scrollWheelZoom: false,
        boxZoom: false,
        keyboard: false,
      });
      mapInstanceRef.current = map;

      // Clean OpenStreetMap tiles
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
      }).addTo(map);

      const latLngs = routeCoordinates.map((pt) => [pt.lat, pt.lon]);
      const polyline = L.polyline(latLngs, {
        color: '#22c55e',
        weight: 4,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map);

      // Start Marker icon
      const startPt = latLngs[0];
      const startIcon = L.divIcon({
        className: 'route-mini-marker marker-start',
        html: `<div class="mini-start-circle"><svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      L.marker(startPt, { icon: startIcon, interactive: false }).addTo(map);

      // End Marker icon
      const endPt = latLngs[latLngs.length - 1];
      const endIcon = L.divIcon({
        className: 'route-mini-marker marker-end',
        html: `<div class="mini-end-pin"><div class="mini-end-dot"></div></div>`,
        iconSize: [16, 20],
        iconAnchor: [8, 18],
      });
      L.marker(endPt, { icon: endIcon, interactive: false }).addTo(map);

      // Fit map view to polyline bounds
      const bounds = polyline.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, {
          padding: [12, 12],
          maxZoom: 15,
        });
      }

      // Ensure proper sizing after layout
      const timer = setTimeout(() => {
        try {
          map.invalidateSize();
        } catch {}
      }, 150);

      return () => {
        clearTimeout(timer);
        if (mapInstanceRef.current) {
          try {
            mapInstanceRef.current.remove();
          } catch {}
          mapInstanceRef.current = null;
        }
      };
    } catch (err) {
      console.warn('Map thumbnail error:', err);
    }
  }, [hasRoute, routeCoordinates]);

  if (!hasRoute) {
    return (
      <div className="route-thumbnail-error" aria-label="Route display fallback">
        <div className="thumbnail-error-bg" />
        <div className="thumbnail-error-content">
          <HelpCircle size={16} className="thumbnail-error-icon" />
          <span className="thumbnail-error-text">Route display error</span>
        </div>
      </div>
    );
  }

  return (
    <div className="route-thumbnail-wrapper" aria-label={`Route map preview: ${title}`}>
      <div ref={mapContainerRef} className="route-thumbnail-map" />
    </div>
  );
}
