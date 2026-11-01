'use client';

import { useEffect, useRef } from 'react';
import type { Map as LeafletMap, Marker, Polyline } from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface LatLng {
  lat: number;
  lng: number;
}

interface Props {
  courier: LatLng | null;
  destination: LatLng | null;
  trail?: LatLng[];
  /** Dims the courier marker when the last ping is old. */
  stale?: boolean;
  className?: string;
}

/*
 * Leaflet's default markers load PNGs from the package by URL, which the
 * image CSP would block and which look nothing like the rest of the app.
 * These are drawn in CSS instead — no image requests at all.
 */
const COURIER_ICON = `
  <div style="position:relative;width:28px;height:28px">
    <span style="position:absolute;inset:0;border-radius:50%;background:#FFC107;
                 box-shadow:0 0 0 4px rgba(255,193,7,.25);display:flex;
                 align-items:center;justify-content:center;font-size:15px">🛵</span>
  </div>`;

const DESTINATION_ICON = `
  <div style="position:relative;width:24px;height:24px">
    <span style="position:absolute;inset:0;border-radius:50% 50% 50% 0;
                 transform:rotate(-45deg);background:#fff;border:3px solid #1a1a1a"></span>
  </div>`;

export default function DeliveryMap({
  courier,
  destination,
  trail = [],
  stale = false,
  className = '',
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const courierMarkerRef = useRef<Marker | null>(null);
  const destinationMarkerRef = useRef<Marker | null>(null);
  const trailRef = useRef<Polyline | null>(null);
  // True until the first fit; after that the view is left alone so the map
  // does not yank itself back while someone is panning around it.
  const needsFitRef = useRef(true);

  useEffect(() => {
    let cancelled = false;

    // Leaflet reaches for `window` at import time, so it cannot be part of
    // the server bundle.
    import('leaflet').then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: true,
      }).setView([-8.2896, -35.0347], 13); // Cabo de Santo Agostinho

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
      }).addTo(map);

      mapRef.current = map;
      // The container is often sized by flexbox after mount; without this
      // Leaflet measures zero and renders a grey box.
      setTimeout(() => map.invalidateSize(), 0);
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    import('leaflet').then((L) => {
      if (!mapRef.current) return;

      if (destination) {
        const icon = L.divIcon({
          html: DESTINATION_ICON,
          className: '',
          iconSize: [24, 24],
          iconAnchor: [12, 24],
        });
        if (destinationMarkerRef.current) {
          destinationMarkerRef.current.setLatLng([destination.lat, destination.lng]);
        } else {
          destinationMarkerRef.current = L.marker([destination.lat, destination.lng], {
            icon,
            title: 'Entrega',
          }).addTo(map);
        }
      }

      if (courier) {
        const icon = L.divIcon({
          html: COURIER_ICON,
          className: stale ? 'opacity-40' : '',
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        if (courierMarkerRef.current) {
          courierMarkerRef.current.setLatLng([courier.lat, courier.lng]);
          courierMarkerRef.current.setIcon(icon);
        } else {
          courierMarkerRef.current = L.marker([courier.lat, courier.lng], {
            icon,
            title: 'Entregador',
          }).addTo(map);
        }
      }

      if (trail.length > 1) {
        const path = trail.map((p) => [p.lat, p.lng]) as [number, number][];
        if (trailRef.current) {
          trailRef.current.setLatLngs(path);
        } else {
          trailRef.current = L.polyline(path, {
            color: '#FFC107',
            weight: 3,
            opacity: 0.7,
          }).addTo(map);
        }
      }

      if (needsFitRef.current && (courier || destination)) {
        const points = [courier, destination].filter(Boolean) as LatLng[];
        if (points.length === 2) {
          map.fitBounds(
            points.map((p) => [p.lat, p.lng] as [number, number]),
            { padding: [50, 50], maxZoom: 16 }
          );
        } else {
          map.setView([points[0].lat, points[0].lng], 15);
        }
        needsFitRef.current = false;
      }
    });
  }, [courier, destination, trail, stale]);

  return (
    <div
      ref={containerRef}
      className={`w-full rounded-xl overflow-hidden border border-[#FFC107]/30 ${className}`}
      style={{ minHeight: 280 }}
    />
  );
}
