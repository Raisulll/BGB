import { useEffect } from 'react';
import { useMap } from './Leaflet';
import L from 'leaflet';
import { BD_LIMIT, BD_VIEW } from '../../lib/leaflet';

// The world outside the frame, as a polygon with the frame cut out of it
const WORLD = [
  [-89, -360],
  [-89, 360],
  [89, 360],
  [89, -360],
];
const [[south, west], [north, east]] = BD_LIMIT;
const HOLE = [
  [south, west],
  [north, west],
  [north, east],
  [south, east],
];

/**
 * Keeps a map on Bangladesh and its border areas (spec #18):
 * - it can't be dragged past BD_LIMIT or zoomed out further than the whole of Bangladesh
 *   (BD_VIEW) in this map's size (recomputed on resize: phone rotation, sidebar toggle)
 * - everything outside BD_LIMIT is covered, so the frame is exact even though map tiles are
 *   square and reach past it
 */
export default function BangladeshFrame() {
  const map = useMap();
  useEffect(() => {
    // Above the map tiles, below incident markers and popups
    if (!map.getPane('bdMask')) map.createPane('bdMask').style.zIndex = 350;
    const mask = L.polygon([WORLD, HOLE], {
      pane: 'bdMask',
      stroke: true,
      color: '#94a3b8', // slate-400: a thin line marks the edge of the frame
      weight: 1,
      fillColor: '#f1f5f9', // slate-100
      fillOpacity: 1,
      interactive: false,
    }).addTo(map);

    const limit = () => {
      map.setMinZoom(map.getBoundsZoom(BD_VIEW));
      map.panInsideBounds(BD_LIMIT, { animate: false });
    };
    limit();
    map.on('resize', limit);
    return () => {
      map.off('resize', limit);
      mask.remove();
    };
  }, [map]);
  return null;
}
