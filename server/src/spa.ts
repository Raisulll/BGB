import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';

// Spec #2 / #56 — serves the built SPA (BGB/dist) from the API process, for single-service hosting
// such as the TEC demo on Render (server/docs/installation-guide/demo-hosting-render-supabase.md).
// One origin keeps the refresh cookie first-party (SameSite=Strict). In the Nginx production
// layout (§15) Nginx serves the SPA and SERVE_SPA_DIR stays unset.

// The SPA's own resources (fonts are bundled) plus one outside host: OpenStreetMap tiles, used only
// when the server has no offline map file (src/lib/leaflet.js, src/map.ts). Leaflet and Chart.js set
// inline styles; evidence previews and downloads use blob: URLs.
const SPA_CSP = {
  useDefaults: false,
  directives: {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    fontSrc: ["'self'", 'data:'],
    imgSrc: ["'self'", 'data:', 'blob:', 'https://*.tile.openstreetmap.org'],
    mediaSrc: ["'self'", 'blob:'],
    connectSrc: ["'self'"],
    objectSrc: ["'none'"],
    frameAncestors: ["'self'"],
    formAction: ["'self'"],
    upgradeInsecureRequests: [],
  },
};

export function spaRouter(dir: string) {
  const root = path.resolve(dir);
  const indexFile = path.join(root, 'index.html');
  if (!existsSync(indexFile)) throw new Error(`SERVE_SPA_DIR: ${indexFile} not found (build the frontend first)`);

  const router = express.Router();
  router.use(helmet.contentSecurityPolicy(SPA_CSP));
  // Helmet's default "no-referrer" makes OpenStreetMap refuse the tiles: its usage policy requires a
  // Referer. Cross-origin requests carry only the site origin, never the page path (incident IDs).
  router.use(helmet.referrerPolicy({ policy: 'strict-origin-when-cross-origin' }));

  // Vite's hashed bundles never change under the same name
  router.use('/assets', express.static(path.join(root, 'assets'), { immutable: true, maxAge: '1y', index: false }));
  router.use(
    express.static(root, {
      index: false,
      setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
    }),
  );

  // Client-side routes (/incidents/BIRDS-2026-1021, /admin, ...) get index.html. API paths and
  // missing files (anything with an extension) fall through to the JSON 404.
  router.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path === '/api' || req.path.startsWith('/api/') || path.extname(req.path)) return next();
    if (!req.accepts('html')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexFile);
  });

  return router;
}
