import L from 'leaflet';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Bundlers break Leaflet's default icon URL detection — point it at the imported assets.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

// Online tiles: used only when the server has no offline map file (components/map/BaseMap.jsx)
export const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

// Offline map (specs #8, #18): vector map data of Bangladesh served by the BIRDS server itself
export const MAP_FILE = '/api/v1/map/bangladesh.pmtiles';
export const OFFLINE_ATTRIBUTION = '&copy; OpenStreetMap contributors &middot; Protomaps';

// Checked once per page load: whether the server has the offline map file
let offlineCheck = null;
export function offlineMapAvailable() {
  offlineCheck ??= fetch(MAP_FILE, { method: 'HEAD', credentials: 'omit' })
    .then((r) => r.ok)
    .catch(() => false);
  return offlineCheck;
}

// Spec #18 — BIRDS maps show Bangladesh and the strip of India and Myanmar along its border, not
// whole countries. VIEW frames Bangladesh (about 50 km past its extremes: 20.6-26.6 N, 88.0-92.7 E);
// LIMIT is how far the map can be panned or zoomed out. Tiles outside LIMIT are never downloaded.
export const BD_VIEW = [
  [20.15, 87.55],
  [27.1, 93.2],
];
export const BD_LIMIT = [
  [19.7, 87.0],
  [27.6, 93.75],
];
