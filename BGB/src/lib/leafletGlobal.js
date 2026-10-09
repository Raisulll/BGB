import L from 'leaflet';

// leaflet.markercluster and leaflet.heat attach themselves to a global `L`. Imported (first) by
// leafletPlugins.js, so the global exists before those plugins evaluate.
window.L = L;
