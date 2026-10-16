import { useEffect, useRef, useState } from 'react';
import { useMap } from './Leaflet';
import L from 'leaflet';
import { BD_VIEW } from '../../lib/leaflet';
import { useI18n } from '../../i18n/I18nContext';

// Spec #18 — clicking an incident point zooms the GIS map in on it; while zoomed in, zoom in /
// zoom out buttons and a close button (back to the whole of Bangladesh) appear on the map.
export const FOCUS_ZOOM = 13;

/**
 * Fly to an incident location at a close zoom (or keep a closer one). The point is placed below
 * the centre so its popup, which opens above it, stays inside the map.
 */
export function focusOn(map, latlng) {
  const zoom = Math.min(Math.max(map.getZoom(), FOCUS_ZOOM), map.getMaxZoom());
  const lift = Math.max(0, Math.min(170, map.getSize().y / 2 - 30));
  const center = map.unproject(map.project(latlng, zoom).subtract([0, lift]), zoom);
  map.flyTo(center, zoom, { duration: 0.8 });
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Moves the map to the incidents it shows: on first load it flies in from the whole country to
 * where the incidents are, and again whenever the filters change the set. Nothing shown = the
 * whole country. Mode switches (same incidents) don't move the map. `ready` = the incidents have
 * loaded; `keepFirst` = a saved view was restored (coming back to the map), so the first load
 * leaves it as it is.
 */
export function FitToIncidents({ points, ready, keepFirst }) {
  const map = useMap();
  const key = points.map(([lat, lng]) => `${lat},${lng}`).sort().join(';');
  const skip = useRef(keepFirst);

  useEffect(() => {
    if (!ready) return undefined;
    if (skip.current) {
      skip.current = false;
      return undefined;
    }
    const animate = !reducedMotion();
    const target = points.length ? L.latLngBounds(points) : L.latLngBounds(BD_VIEW);
    // A short pause lets the whole-country view draw first, so the move reads as zooming in
    const timer = setTimeout(() => {
      const options = { padding: [48, 48], maxZoom: 11 };
      if (animate) map.flyToBounds(target, { ...options, duration: 1.2 });
      else map.fitBounds(target, options);
    }, 300);
    return () => clearTimeout(timer);
    // key stands for points (same incidents, new array = no move)
  }, [map, key, ready]);
  return null;
}

/**
 * Zoom in / zoom out / close, shown only while the map is closer than the whole-country view.
 * A column at the top right on wider maps; a row at the bottom right on phones, below the popup.
 */
export function ZoomControls() {
  const map = useMap();
  const { t } = useI18n();
  const ref = useRef(null);
  const [zoom, setZoom] = useState(() => map.getZoom());

  useEffect(() => {
    const update = () => setZoom(map.getZoom());
    map.on('zoomend', update);
    map.on('resize', update);
    return () => {
      map.off('zoomend', update);
      map.off('resize', update);
    };
  }, [map]);

  // Clicks and scrolls on the buttons must not reach the map (no drag, no popup close)
  useEffect(() => {
    if (!ref.current) return;
    L.DomEvent.disableClickPropagation(ref.current);
    L.DomEvent.disableScrollPropagation(ref.current);
  });

  const zoomedIn = zoom > map.getMinZoom() + 0.1;
  if (!zoomedIn) return null;

  const reset = () => {
    map.closePopup();
    map.flyToBounds(BD_VIEW, { duration: 0.8 });
  };
  const atMax = zoom >= map.getMaxZoom();
  const btn = 'flex h-9 w-9 items-center justify-center text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-bgb-700 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-white';

  return (
    <div ref={ref} className="absolute bottom-7 right-3 z-[1000] flex flex-row-reverse gap-2 sm:bottom-auto sm:top-3 sm:flex-col">
      <button type="button" id="map-reset-view" onClick={reset} aria-label={t('map.resetView')} title={t('map.resetView')} className={`${btn} rounded-md border border-slate-300 bg-white shadow-sm`}>
        <i className="fas fa-xmark" />
      </button>
      <div className="flex divide-x divide-slate-200 overflow-hidden sm:flex-col sm:divide-x-0 sm:divide-y rounded-md border border-slate-300 bg-white shadow-sm">
        <button type="button" id="map-zoom-in" onClick={() => map.zoomIn(1)} disabled={atMax} aria-label={t('map.zoomIn')} title={t('map.zoomIn')} className={btn}>
          <i className="fas fa-plus" />
        </button>
        <button type="button" id="map-zoom-out" onClick={() => map.zoomOut(1)} aria-label={t('map.zoomOut')} title={t('map.zoomOut')} className={btn}>
          <i className="fas fa-minus" />
        </button>
      </div>
    </div>
  );
}
