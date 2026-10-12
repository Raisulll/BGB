import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import '../../lib/leafletPlugins';
import { focusOn } from './FocusZoom';
import { formatDateDisplay, SEVERITY_HEX } from '../../utils/helpers';

// Spec #18 — clustered markers and a severity-weighted heatmap for the GIS page. Plain Leaflet
// layers (the plugins have no React bindings), created and removed with the data.
const RANK = { Low: 1, Medium: 2, High: 3, Critical: 4 };
const HEAT_WEIGHT = { Low: 0.35, Medium: 0.55, High: 0.8, Critical: 1 };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** One marker per incident, grouped into clusters coloured by their most severe incident. */
export function ClusterLayer({ incidents, labels }) {
  const map = useMap();
  const navigate = useNavigate();

  useEffect(() => {
    const group = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 50,
      iconCreateFunction: (cluster) => {
        const worst = cluster.getAllChildMarkers().reduce((w, m) => (RANK[m.options.severity] > RANK[w] ? m.options.severity : w), 'Low');
        const n = cluster.getChildCount();
        const size = n < 10 ? 34 : n < 50 ? 42 : 50;
        return L.divIcon({
          html: `<div style="width:${size}px;height:${size}px;background:${SEVERITY_HEX[worst]};border:3px solid #fff;border-radius:9999px;box-shadow:0 2px 6px rgba(0,0,0,.35);color:#fff;font:700 13px/1 Inter,sans-serif;display:flex;align-items:center;justify-content:center">${n}</div>`,
          className: '',
          iconSize: [size, size],
        });
      },
    });
    for (const inc of incidents) {
      const marker = L.circleMarker([inc.lat, inc.lng], {
        radius: 9,
        fillColor: SEVERITY_HEX[inc.severity] || '#6b7280',
        color: '#ffffff',
        weight: 2,
        fillOpacity: 0.92,
        severity: inc.severity,
      });
      marker.bindPopup(
        `<div style="min-width:200px">
          <div style="display:flex;justify-content:space-between;gap:8px;font-size:10px">
            <b style="font-family:monospace;color:#1e5e1e">${esc(inc.id)}</b><span>${esc(formatDateDisplay(inc.date))}</span>
          </div>
          <p style="margin:4px 0;font-size:12px;font-weight:700">${esc(inc.title)}</p>
          <p style="margin:0;font-size:10px;color:#4b5563">${esc(inc.category)} · ${esc(labels.severity(inc.severity))} · ${esc(labels.status(inc.status))}</p>
          <p style="margin:2px 0 6px;font-size:10px;color:#6b7280">${esc(inc.bop || '')}</p>
          <a href="/incidents/${encodeURIComponent(inc.id)}" data-incident="${esc(inc.id)}" style="font-size:11px;font-weight:700;color:#1e5e1e">${esc(labels.view)} &rarr;</a>
        </div>`,
        { autoPan: false },
      );
      // Spec #18 — zoom in on the incident; focusOn() keeps its popup inside the map
      marker.on('click', () => focusOn(map, marker.getLatLng()));
      group.addLayer(marker);
    }
    // Popup links navigate inside the app (no full page reload)
    const onOpen = (e) => {
      const a = e.popup.getElement()?.querySelector('a[data-incident]');
      if (a)
        a.onclick = (ev) => {
          ev.preventDefault();
          navigate(`/incidents/${a.dataset.incident}`);
        };
    };
    map.on('popupopen', onOpen);
    map.addLayer(group);
    return () => {
      map.off('popupopen', onOpen);
      map.removeLayer(group);
    };
  }, [map, incidents, labels, navigate]);

  return null;
}

/** Severity-weighted heat: where incidents concentrate, and how serious they are. */
export function HeatLayer({ incidents }) {
  const map = useMap();
  useEffect(() => {
    const layer = L.heatLayer(
      incidents.map((i) => [i.lat, i.lng, HEAT_WEIGHT[i.severity] ?? 0.5]),
      { radius: 28, blur: 22, maxZoom: 11, minOpacity: 0.35, gradient: { 0.3: '#22c55e', 0.55: '#eab308', 0.75: '#f97316', 1: '#ef4444' } },
    );
    map.addLayer(layer);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, incidents]);
  return null;
}
