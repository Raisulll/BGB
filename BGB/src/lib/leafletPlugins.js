// Map plugins for the GIS page (spec #18): marker clustering and heatmap. Import order matters:
// the global `L` must exist before the plugins run.
import './leafletGlobal';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.heat';
