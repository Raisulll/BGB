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

/** Swagger UI at /api/docs, reading /api/v1/openapi.json */
export function swaggerUiRouter() {
  const router = express.Router();
  router.use(
    '/',
    swaggerUi.serve,
    swaggerUi.setup(undefined, {
      customSiteTitle: 'BIRDS API',
      swaggerOptions: {
        url: '/api/v1/openapi.json',
        // Keep the pasted access token in memory only (CLAUDE.md §13.16)
        persistAuthorization: false,
      },
    }),
  );
  return router;
}
