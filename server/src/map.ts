import path from 'node:path';
import express from 'express';

// Specs #8 / #18 — offline base map. BIRDS runs on BGB's isolated network (intranet), so the map
// cannot load tiles from the internet. MAP_DIR holds bangladesh.pmtiles: one file with the vector
// map of Bangladesh and the border strip (OpenStreetMap data, Protomaps build; `npm run map:download`).
// The browser reads the parts it needs with HTTP range requests and draws the map itself
// (protomaps-leaflet), so no tile server is needed. Public: it is map data, not BIRDS data.
// When the file is absent the web app falls back to the online OpenStreetMap tiles.
export function mapRouter(dir: string) {
  const router = express.Router();
  router.use(
    express.static(path.resolve(dir), {
      index: false,
      dotfiles: 'ignore',
      maxAge: '1d', // replaced only by a new download
      fallthrough: true,
    }),
  );
  return router;
}
