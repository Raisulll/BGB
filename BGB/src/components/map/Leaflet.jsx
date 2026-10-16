import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import '../../lib/leaflet';

// Specs #8, #18, #51 — React bindings for Leaflet (BSD-2-Clause), used by every BIRDS map: the map,
// markers, popups, tooltips and tile layers. They replace react-leaflet, whose licence (Hippocratic
// 2.1) is not an open-source licence. Same names and props as react-leaflet for what BIRDS uses:
// options of the map and of popups/tooltips are read once, when they are created.

const MapContext = createContext(null);
const LayerContext = createContext(null);

const setRef = (ref, value) => {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
};

/** The Leaflet map of the enclosing MapContainer */
export function useMap() {
  const map = useContext(MapContext);
  if (!map) throw new Error('useMap() must be used inside <MapContainer>');
  return map;
}

/** A Leaflet map. Opens on `bounds`, or on `center` and `zoom`; other props are Leaflet map options. */
export function MapContainer({ ref, className, style, children, center, zoom, bounds, ...options }) {
  const el = useRef(null);
  const [map, setMap] = useState(null);

  useLayoutEffect(() => {
    const m = L.map(el.current, options);
    if (bounds) m.fitBounds(bounds);
    else m.setView(center, zoom);
    setMap(m);
    setRef(ref, m);
    return () => {
      setRef(ref, null);
      setMap(null);
      m.remove();
    };
    // Created once, like react-leaflet: later prop changes don't rebuild the map
  }, []);

  return (
    <div ref={el} className={className} style={style}>
      {map && <MapContext.Provider value={map}>{children}</MapContext.Provider>}
    </div>
  );
}

/** A marker; `eventHandlers` maps Leaflet event names to handlers; children may be a Popup and a Tooltip. */
export function Marker({ ref, position, icon, title, zIndexOffset = 0, eventHandlers, children }) {
  const map = useMap();
  const [marker] = useState(() => L.marker(position, { ...(icon ? { icon } : {}), title, zIndexOffset }));
  const handlers = useRef(eventHandlers);
  handlers.current = eventHandlers;
  const [lat, lng] = position;

  useEffect(() => {
    // Bound once per event name; each call goes to the latest handler
    const bound = Object.keys(handlers.current || {}).map((name) => [name, (e) => handlers.current?.[name]?.(e)]);
    for (const [name, fn] of bound) marker.on(name, fn);
    marker.addTo(map);
    setRef(ref, marker);
    return () => {
      for (const [name, fn] of bound) marker.off(name, fn);
      setRef(ref, null);
      marker.remove();
    };
  }, [map, marker]);

  useEffect(() => {
    marker.setLatLng([lat, lng]);
  }, [marker, lat, lng]);
  useEffect(() => {
    if (icon) marker.setIcon(icon);
  }, [marker, icon]);
  useEffect(() => {
    marker.setZIndexOffset(zIndexOffset);
  }, [marker, zIndexOffset]);

  return <LayerContext.Provider value={marker}>{children}</LayerContext.Provider>;
}

/** Popup or tooltip of the enclosing marker, with React content */
function useOverlay(kind, options, children) {
  const layer = useContext(LayerContext);
  const [el] = useState(() => document.createElement('div'));

  useEffect(() => {
    if (kind === 'popup') {
      layer.bindPopup(L.popup(options).setContent(el));
      return () => layer.unbindPopup();
    }
    layer.bindTooltip(L.tooltip(options).setContent(el));
    return () => layer.unbindTooltip();
  }, [layer, el, kind]);

  // New content in an open popup/tooltip: re-measure and re-position it
  useEffect(() => {
    const overlay = kind === 'popup' ? layer.getPopup() : layer.getTooltip();
    if (overlay?.isOpen()) overlay.update();
  });

  return createPortal(children, el);
}

export function Popup({ children, ...options }) {
  return useOverlay('popup', options, children);
}

export function Tooltip({ children, ...options }) {
  return useOverlay('tooltip', options, children);
}

/** Raster tile layer (online OpenStreetMap fallback in BaseMap) */
export function TileLayer({ url, ...options }) {
  const map = useMap();
  useEffect(() => {
    const layer = L.tileLayer(url, options).addTo(map);
    return () => {
      layer.remove();
    };
  }, [map, url]);
  return null;
}
