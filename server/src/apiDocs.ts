import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { parse } from 'yaml';
import { logger } from './config/logger.js';

// Specs #31, #52 — the hand-written OpenAPI 3.1 document (docs/api/openapi.yaml), served as JSON
// plus Swagger UI. test/openapi.test.ts keeps it valid and in step with the routers.

// The server root (the folder with package.json), from src/ under tsx or dist/src/ when built
function serverRoot() {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  while (!existsSync(path.join(dir, 'package.json'))) {
    const up = path.dirname(dir);
    if (up === dir) throw new Error('package.json not found above ' + dir);
    dir = up;
  }
  return dir;
}

export const OPENAPI_PATH = path.join(serverRoot(), 'docs', 'api', 'openapi.yaml');

export function loadOpenApi(): Record<string, unknown> {
  return parse(readFileSync(OPENAPI_PATH, 'utf8'));
}

/** `GET /openapi.json` (mounted under /api/v1) */
export function openApiRouter() {
  const router = express.Router();
  let spec: Record<string, unknown> | null = null;
  try {
    spec = loadOpenApi();
  } catch (err) {
    logger.warn(`API docs disabled: cannot read ${OPENAPI_PATH} (${(err as Error).message})`);
    return router;
  }
  router.get('/openapi.json', (_req, res) => {
    res.json(spec);
  });
  return router;
}

/**
 * Swagger UI at /api/docs, reading /api/v1/openapi.json, in the BIRDS look: BGB header and colours
 * (docs/api/docs-theme.css, docs-header.js), Swagger's own top bar and badges hidden, groups collapsed
 * with a filter box, schemas list hidden.
 */
export function swaggerUiRouter() {
  const router = express.Router();
  const docsDir = path.dirname(OPENAPI_PATH);
  // The page's CSP allows scripts from this origin only, so the header script is served as a file
  router.get('/birds-docs-header.js', (_req, res) => {
    res.type('application/javascript').sendFile(path.join(docsDir, 'docs-header.js'));
  });
  let customCss = '';
  try {
    customCss = readFileSync(path.join(docsDir, 'docs-theme.css'), 'utf8');
  } catch (err) {
    logger.warn(`API docs theme not found (${(err as Error).message}); using the default look`);
  }
  router.use(
    '/',
    swaggerUi.serve,
    swaggerUi.setup(undefined, {
      customSiteTitle: 'BIRDS API documentation',
      customfavIcon: '/favicon.svg',
      customCss,
      customJs: '/api/docs/birds-docs-header.js',
      swaggerOptions: {
        url: '/api/v1/openapi.json',
        // Keep the pasted access token in memory only (CLAUDE.md §13.16)
        persistAuthorization: false,
        docExpansion: 'none',
        filter: true,
        defaultModelsExpandDepth: -1,
        displayRequestDuration: true,
        // No validator badge: it would send the spec URL to validator.swagger.io (blocked by our CSP)
        validatorUrl: 'none',
      },
    }),
  );
  return router;
}
