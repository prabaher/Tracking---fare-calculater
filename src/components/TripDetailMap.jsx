import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { Navigation } from 'lucide-react';

export default function TripDetailMap({ routeCoordinates = [], startCoords, endCoords, distance = '' }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);

  const hasRoute =
    Array.isArray(routeCoordinates) &&
    routeCoordinates.length >= 2 &&
    typeof routeCoordinates[0].lat === 'number' &&
    typeof routeCoordinates[0].lon === 'number';

  const hasPoints =
    startCoords &&
    typeof startCoords.lat === 'number' &&
    typeof startCoords.lon === 'number';

  useEffect(() => {
    if ((!hasRoute && !hasPoints) || !mapContainerRef.current) return;

    if (mapInstanceRef.current) {
      try {
        mapInstanceRef.current.remove();
      } catch {}
      mapInstanceRef.current = null;
    }

    try {
      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        attributionControl: false,
      });
      mapInstanceRef.current = map;

      // OpenStreetMap standard tiles
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map);

      if (hasRoute) {
        const latLngs = routeCoordinates.map((pt) => [pt.lat, pt.lon]);
        const polyline = L.polyline(latLngs, {
          color: '#22c55e',
          weight: 5,
          opacity: 0.95,
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(map);

        // Start marker: black circle with white triangle arrow (matches Screenshot 1)
        const startPt = latLngs[0];
        const startIcon = L.divIcon({
          className: 'detail-map-marker marker-start-large',
          html: `<div class="detail-start-pin"><svg width="12" height="12" viewBox="0 0 24 24" fill="#ffffff"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        });
        L.marker(startPt, { icon: startIcon }).addTo(map).bindPopup('<b>Trip Start</b>');

        // Stop marker: orange teardrop pin (matches Screenshot 1)
        const endPt = latLngs[latLngs.length - 1];
        const endIcon = L.divIcon({
          className: 'detail-map-marker marker-stop-large',
          html: `<div class="detail-stop-pin"><div class="detail-stop-inner-dot"></div></div>`,
          iconSize: [28, 36],
          iconAnchor: [14, 34],
        });
        L.marker(endPt, { icon: endIcon }).addTo(map).bindPopup('<b>Trip Destination</b>');

        const bounds = polyline.getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, {
            padding: [45, 45],
            maxZoom: 16,
          });
        }
      } else if (hasPoints) {
        // Fallback for trips with only start / end coordinates
        const pts = [];
        if (startCoords) pts.push([startCoords.lat, startCoords.lon]);
        if (endCoords) pts.push([endCoords.lat, endCoords.lon]);

        pts.forEach(([lat, lon], idx) => {
          L.marker([lat, lon]).addTo(map).bindPopup(idx === 0 ? 'Start' : 'Destination');
        });

        if (pts.length > 1) {
          const bounds = L.latLngBounds(pts);
          map.fitBounds(bounds, { padding: [40, 40] });
        } else {
          map.setView(pts[0], 14);
        }
      }

      const timer = setTimeout(() => {
        try {
          map.invalidateSize();
        } catch {}
      }, 200);

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
      console.warn('Trip detail map error:', err);
    }
  }, [hasRoute, hasPoints, routeCoordinates, startCoords, endCoords]);

  if (!hasRoute && !hasPoints) {
    return (
      <div className="trip-detail-map-fallback">
        <Navigation size={32} className="fallback-map-icon" />
        <p className="fallback-map-text">GPS Route Coordinates Unavailable</p>
        <span className="fallback-map-sub">This trip was saved with manual distance entry ({distance}).</span>
      </div>
    );
  }

  return (
    <div className="trip-detail-map-container">
      <div ref={mapContainerRef} className="trip-detail-map" />
    </div>
  );
}
