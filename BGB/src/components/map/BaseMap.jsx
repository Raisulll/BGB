import { useEffect, useState } from 'react';
import { TileLayer, useMap } from './Leaflet';
import { useI18n } from '../../i18n/I18nContext';
import { BD_LIMIT, MAP_FILE, OFFLINE_ATTRIBUTION, offlineMapAvailable, TILE_ATTRIBUTION, TILE_URL } from '../../lib/leaflet';

// Specs #8, #18 — the base map under every BIRDS map. BIRDS runs on BGB's isolated network, so the
// map is drawn in the browser from the server's own copy of the map data (bangladesh.pmtiles, served
// at /api/v1/map), with no internet access. Place names follow the interface language. Where the
// server has no map file (e.g. the online demo) the OpenStreetMap tiles are used instead.
export default function BaseMap() {
  const map = useMap();
  const { lang } = useI18n();
  const [mode, setMode] = useState(null); // null while checking | 'offline' | 'online'

  useEffect(() => {
    let live = true;
    offlineMapAvailable().then((ok) => live && setMode(ok ? 'offline' : 'online'));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (mode !== 'offline') return undefined;
    let layer = null;
    let cancelled = false;
    // Loaded only with a map, so pages without one don't carry the renderer
    import('protomaps-leaflet').then(({ leafletLayer }) => {
      if (cancelled) return;
      layer = leafletLayer({
        url: MAP_FILE,
        flavor: 'light',
        lang: lang === 'bn' ? 'bn' : 'en',
        maxDataZoom: 14, // the file holds zoom 0-14; closer views are drawn from zoom 14 data
        bounds: BD_LIMIT,
        noWrap: true,
        attribution: OFFLINE_ATTRIBUTION,
      });
      layer.addTo(map);
    });
    return () => {
      cancelled = true;
      if (layer) map.removeLayer(layer);
    };
  }, [mode, lang, map]);

  if (mode === 'online') return <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} bounds={BD_LIMIT} noWrap />;
  return null;
}
