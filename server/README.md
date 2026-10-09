# BIRDS API (`server/`)

Backend for the Border Incident Reporting & Documentation System. Node.js + Express 5 + PostgreSQL + Prisma 7, TypeScript (ESM). See the root `CLAUDE.md` §16–§30 for the full plan.

**Status:** every API group in CLAUDE.md §19 is implemented except backups and server-side PDF. 106 automated tests. OpenAPI 3.1 docs at `/api/docs` (see below). The React frontend (`../BGB`) runs entirely on this API.

## Quick start (local development)

```bash
cd server
npm install
npm run db:start          # local PostgreSQL cluster in server/.pgdata on port 5433
npm run keys              # one-time: RS256 key pair in server/keys/
npx prisma migrate deploy # apply migrations (fresh machines)
npm run db:seed           # load demo data (idempotent)
npm run dev               # http://localhost:4000/api/v1
```

`.env` holds the connection string and settings. Copy `.env.example` on a new machine. `.env`, `keys/`, `logs/` and `.pgdata/` are git-ignored and must never be committed.

### Local database

Development uses a project-local PostgreSQL 18 cluster (`server/.pgdata`, port 5433), separate from any system-wide PostgreSQL install:

| Role | Purpose |
|---|---|
| `birds_admin` | Cluster superuser, for maintenance only. Its connection string is `DB_ADMIN_URL` in `.env` |
| `birds` | Application role, **not** a superuser, so it cannot bypass the audit-log triggers |

`npm run db:stop` stops the cluster. It does not start automatically after a reboot; run `npm run db:start`.

## Scripts

| Script | Does |
|---|---|
| `dev` | Run with tsx, reload on change |
| `build` / `start` | Compile to `dist/` and run the compiled server |
| `typecheck` | `tsc --noEmit` |
| `keys` | Generate the JWT RS256 key pair (`-- --force` to replace, which ends all sessions; `-- --out <dir>` for another host's keys) |
| `db:migrate` | `prisma migrate dev` (create + apply a migration during development) |
| `db:deploy` | `prisma migrate deploy` (production) |
| `db:seed` | Seed demo data |
| `db:start` / `db:stop` | Start/stop the local dev cluster |
| `demo:reset-user -- <username>` | Restore a demo account's password, unlock it and end its sessions |
| `test` / `test:watch` | Vitest + supertest against a disposable `birds_test` database (recreated, migrated and seeded on every run) |
| `typecheck` | Typecheck source, tests and configs |

Production: `npm run build && pm2 start ecosystem.config.cjs` (cluster mode, §26).

## API documentation (specs #31, #52)

The OpenAPI 3.1 description is hand-written in `docs/api/openapi.yaml`. With the dev server running:

- Swagger UI: http://localhost:4000/api/docs (also via the web app's dev proxy: http://localhost:5173/api/docs)
- JSON: `GET /api/v1/openapi.json` (public, no sign-in)

To try authenticated routes: run `POST /auth/login`, copy `accessToken` from the response, and paste it into **Authorize**. The token is kept in memory only and is lost on reload.

Both routes are on by default outside production and off in production. Set `API_DOCS=true` to publish them on a production build (e.g. for the TEC demo), or `API_DOCS=false` to turn them off in development.

**When you add or change a route, update `openapi.yaml` in the same change.** `test/openapi.test.ts` fails if the file isn't valid OpenAPI 3.1, or if its paths and methods differ from the routers. Quote any value inside `{ … }` that contains a comma: unquoted, `{ description: a, b }` silently becomes an extra key `b`.

## Auth API (`/api/v1/auth`)

| Method | Path | Notes |
|---|---|---|
| POST | `/login` | `{ username, password }` → `{ accessToken, tokenType, expiresIn, user }` and sets the `birds_rt` httpOnly refresh cookie |
| POST | `/refresh` | Uses the cookie; rotates it and returns a new access token |
| POST | `/logout` | Ends the session immediately (access token and cookie). Body `{ reason: 'timeout' }` when the client's idle timer ended it: audited as `SESSION_TIMEOUT` instead of `LOGOUT` |
| GET | `/me` | Current user + effective `permissions`, and `policy` (`sessionTimeoutMinutes`, password rules) for every role. Lockout thresholds stay admin-only |
| POST | `/change-password` | `{ currentPassword, newPassword }`; ends the user's other sessions |
| POST | `/admin/reset-password` | Admin only. `{ userId, temporaryPassword? }`; returns the temp password once and forces a change at next login |
| GET | `/health` | Public liveness check (`/api/v1/health`) |

Errors always use `{ error: { code, message, details? } }`.

### How sessions work

- **Access token:** RS256 JWT, 15 minutes, sent as `Authorization: Bearer`. It carries a session id (`sid`), and every request checks that session in the DB. Logout, a new login elsewhere (single-session policy), deactivation and idle timeout therefore take effect immediately.
- **Refresh token:** an opaque random value stored only as a SHA-256 hash. It lives in an httpOnly, `SameSite=Strict` cookie scoped to `/api/v1/auth`. It is rotated on every refresh, and the session has an absolute lifetime of 8 hours.
- **Reuse detection:** presenting an already-rotated refresh token more than 10 seconds after rotation revokes the session (`TOKEN_REUSE` in the audit log). Within 10 seconds it is treated as two tabs racing and simply rejected. The frontend should keep a single in-flight refresh.
- **Idle timeout:** `session.timeout_minutes` in `system_config` (default 30). Requests sent with `X-Background-Request: 1` (the SPA's notification polling while the user is idle, and refreshes it triggers) are served but don't count as activity, so an unattended open tab still times out.
- **Lockout:** after `password.max_attempts` failures (default 5) the account is locked for `password.lockout_minutes` (default 15) and the API returns `423`.
- **Must change password:** after an admin reset, every route except `/me`, `/logout` and `/change-password` returns `403 PASSWORD_CHANGE_REQUIRED`.

## Incidents API (`/api/v1/incidents`)

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/` | incidents | Filters: `q` (ref no./title/description/location), `status` and `severity` (comma lists), `category`, `sector`, `battalion`, `bop`, `dateFrom`, `dateTo`, `createdBy` (`me` or user id), `overdue=true` (waiting longer than `workflow.overdue_days` in Submitted/Reviewed/Verified/Approved/Returned), `needsAction=true` (what the caller can act on now under the workflow table, never their own reports, plus their own Returned ones), `sort` (`createdAt`, `incidentDate`, `id`), `order`, `page`, `pageSize` (≤100). Returns `{ data, page, pageSize, total, totalPages }` |
| GET | `/meta` | incidents | Categories + subcategories, the org hierarchy the user may file under, and `canAct` (the role reviews/approves) |
| POST | `/` | create | Body = incident fields + `status`: `Draft` (default) or `Submitted` |
| GET | `/:id` | incidents | Detail incl. `timeline`, `evidence`, `comments`, `statusChangedAt` + `overdue`, and the caller's `actions`, `canEdit`, `canSubmit`, `canDiscard`, `canComment` |
| GET | `/:id/timeline` | incidents | Append-only history |
| PATCH | `/:id` | create | Creator only, Draft/Returned only |
| DELETE | `/:id` | create | Discard a never-submitted Draft (creator only; body `{ notes? }`). Timeline rows are append-only, so the record is kept with `discarded_at` set and hidden from every view; DB CHECK allows it only on Drafts. Timeline "Discarded" + audit `DISCARD_DRAFT` |
| POST | `/:id/submit` | create | Draft/Returned → Submitted (creator only) |
| POST | `/:id/comments` | incidents | Body `{ body }` (≤4000). Roles that file or review incidents, not on drafts or archived records. Append-only (`incident_comments` triggers), audited `COMMENT_INCIDENT`, notifies the creator and earlier commenters (type `comment`) |
| POST | `/:id/print` | incidents | Records `PRINT_INCIDENT` before the browser prints the single-incident report |
| GET | `/:id/related` | incidents | Visible incidents at the same BOP or within 5 km, within ±30 days; max 8, closest in time first; each with `match` { daysApart, distanceKm, sameBop, sameCategory } |
| GET | `/similar` | create | Duplicate check while filing: `date` (+ `lat`/`lng`, `bop`, `category`, `excludeId`); ±1 day and within 1 km, or same BOP + category; max 5; advisory |
| POST | `/:id/{review,verify,approve,close,return,reject}` | incidents + role | Body `{ notes? }`; `notes` required for return/reject |

GIS: `GET /api/v1/gis/incidents` (permission `map`) returns lightweight markers within scope.

Rules (enforced in `incidents.service.ts`; see DOUBT-008):

- **Scope**: a user sees incidents at or below their `scope` node (HQ → sector → battalion → BOP). Out-of-scope records return 404.
- **Drafts** are visible only to their creator.
- **Workflow**: same table as the frontend (`workflow.ts` ↔ `AppContext.jsx`). Wrong role → 403, wrong state → 409, both audited as `DENIED_WORKFLOW`.
- **Separation of duties**: nobody can review, verify, approve, close, return or reject an incident they filed.
- **Concurrency**: transitions are conditional updates, so of two simultaneous actions exactly one wins and the other gets 409.
- **Reference numbers**: `BIRDS-<year>-NNNN`, from a per-year counter `incident.next_id.<year>` in `system_config`, allocated atomically.
- **Notifications**: each workflow event creates notification rows for the next responsible roles within scope, plus the creator where relevant.

## Evidence API (`/api/v1/incidents/:id/evidence`)

| Method | Path | Permission | Notes |
|---|---|---|---|
| POST | `/` | create | `multipart/form-data`, field `files` (up to 10), optional `lastModified` per file. Creator only, Draft/Returned only |
| GET | `/` | incidents | Evidence list (also included in incident detail) |
| GET | `/:eid` | incidents | Streams the file; `?inline=1` for in-browser viewing. Sends a `Repr-Digest` SHA-256 header |
| POST | `/:eid/verify` | incidents | Recomputes the SHA-256 and compares it with the upload-time hash (chain of custody) |
| DELETE | `/:eid` | incidents | Soft delete: the creator while editing, or an HQ admin at any stage with `{ reason }` |

- **File types are checked on content**, not on the name or the browser's claim: JPEG, PNG, GIF, PDF, MP4 and MOV only (415 otherwise). If one file in a batch fails, none are stored.
- **Limits**: `EVIDENCE_MAX_FILE_MB` (50), `EVIDENCE_MAX_INCIDENT_MB` (500), `EVIDENCE_MAX_FILES_PER_UPLOAD` (10).
- **Metadata (spec #11)**: SHA-256, detected and declared type, the client's last-modified time, and for JPEG/PNG the camera EXIF fields and GPS position, stored in `evidence.file_metadata`.
- **Virus scanning**: `scanner.ts` is the hook. No engine is configured yet, so every file is recorded as `scan.status: "not_scanned"`.
- **Storage**: `STORAGE_DRIVER=local` writes under `EVIDENCE_DIR` (atomic write-then-rename; keys are server-generated UUIDs). `STORAGE_DRIVER=s3` stores objects in any S3-compatible bucket (MinIO, AWS S3, Supabase Storage; `S3_*` settings, private bucket). Both sit behind the `StorageDriver` interface in `src/config/storage.ts`, and both are wrapped by the encryption layer.
- Every upload, download, verification, rejection and removal is written to the audit log.

## Users API (`/api/v1/users`, admin only)

| Method | Path | Notes |
|---|---|---|
| GET | `/` | Filters `q`, `role`, `active`; paginated. Shows lock status, last login, must-change flag; never the hash |
| POST | `/` | `{ username, name, role, scope, email, password? }`. Without `password` a temporary one is generated and returned once. New users must always change their password at first login |
| GET | `/:id` | |
| PATCH | `/:id` | `name`, `role`, `scope`, `email`, `isActive`, `unlock: true`. A role change, scope change or deactivation ends the user's sessions |
| DELETE | `/:id` | Soft-deactivate (users are never deleted) |

Guards: admins can't change their own role or deactivate themselves, and at least one active HQ Administrator must always remain (409 `LAST_ADMIN`). Roles must exist; scopes must be `HQ` or a node in the org hierarchy.

## Admin API (`/api/v1/admin`, admin only)

| Method | Path | Notes |
|---|---|---|
| GET / PATCH | `/config` | Typed, range-checked settings (`{ values: { key: value } }`); all-or-nothing; takes effect immediately in this process (others within 30 s). Incident counters are read-only |
| GET / PATCH | `/roles/permissions` | Matrix of role → pages. PATCH `{ role, pageId, enabled }` or `{ role, permissions: [...] }`. HQ Administrator always keeps `admin` |
| POST | `/roles/permissions/reset` | Factory defaults |
| GET / POST | `/categories` | With usage counts; new ids `CAT08`, `CAT09`, … |
| PATCH | `/categories/:id` | `name`, `isActive`, `addSubcategories`, `subcategoryStatus`. Categories used by incidents can't be renamed (deactivate instead) |
| GET / POST | `/org-hierarchy` | Add a sector/battalion/BOP. Units are never deleted; names must be unique across levels (user scopes are matched by name) |

All changes are audited (`CONFIG_CHANGE`, `PERMISSION_CHANGE`, `PERMISSION_RESET`, `CATEGORY_CREATE`, `CATEGORY_UPDATE`, `ORG_UNIT_CREATE`, `CREATE_USER`, `ROLE_CHANGE`, `UPDATE_USER`, `DEACTIVATE_USER`, `REACTIVATE_USER`, `UNLOCK_USER`).

## Audit API (`/api/v1/audit`, permission `audit`)

| Method | Path | Notes |
|---|---|---|
| GET | `/` | Newest first; filters `q`, `action` (comma list), `username`, `dateFrom`/`dateTo` (Bangladesh calendar days); returns `actions` (all action names, for the filter dropdown). Viewing or searching (page 1) is itself logged as `VIEW_AUDIT_LOG` with the filters used; an identical repeat by the same user within 60 s is not logged again |
| GET | `/verify` | Runs `audit_log_verify()`: `{ rowsChecked, intact, firstBrokenSeq }` |
| GET | `/export/csv`, `/export/excel` | Same filters, up to 50,000 rows |

## Notifications API (`/api/v1/notifications`, any signed-in user)

| Method | Path | Notes |
|---|---|---|
| GET | `/` | The caller's own notifications, newest first; `?unread=true`; includes `unreadCount`. Poll every 30 s |
| PATCH | `/read-all` | |
| PATCH | `/:id/read` | Someone else's notification → 404 |

Each recipient gets their own row (read state is per user). There are no shared "broadcast" rows.

## Reports API (`/api/v1/reports`)

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/summary` | dashboard or analytics | KPIs: total, pending review, open, closed, high-severity open, by status, by severity |
| GET | `/trends` | dashboard or analytics | `granularity` = day / week (ISO) / month / quarter / year; default the last 12 months; gaps filled with zero; max 750 periods |
| GET | `/by-category`, `/by-severity` | dashboard or analytics | All active categories and all four severities are listed, zeros included. Categories also carry `highSeverity` (High + Critical) and `subcategories: [{ name, count }]` |
| GET | `/by-sector` | dashboard or analytics | Severity counts + risk score (Low 1, Medium 2, High 3, Critical 4) |
| GET | `/operational` | reports | `type` = operational / statistical / high-threat / sector-audit; summary + breakdowns + up to 5,000 incident rows |
| GET | `/export/csv`, `/export/excel` | reports | Also at `/api/v1/incidents/export/:format` |

All analytics use the incidents list filters, cover filed incidents only (no drafts), and are limited to the caller's scope.

**Exports** (`src/utils/export.ts`): every file starts with the `CONFIDENTIAL // OPERATIONAL` banner, a title and a "generated by / filters" line. Dates are DD-MM-YYYY and times are BST. CSV is UTF-8 with a BOM (Bangla shows correctly in Excel), and cells starting with `= + - @` are neutralised against CSV/formula injection. Every export is audited. Server-side PDF is not implemented; reports print to PDF from the browser (DOUBT-004).

## Frontend contract

The SPA (`../BGB`, `src/api/client.js`) relies on these behaviours:

- It calls `/api/v1` on its **own origin** (Vite dev proxy, Nginx in production, or this server itself with `SERVE_SPA_DIR`), so the refresh cookie stays first-party.
- `SERVE_SPA_DIR=../BGB/dist` makes the API serve the built SPA (single-service hosting; the TEC demo on Render, see `docs/installation-guide/demo-hosting-render-supabase.md`). Client routes get `index.html`; `/api/*` and missing files stay JSON 404s. The SPA's CSP allows only its own origin plus OpenStreetMap tiles and Google Fonts.
- The access token is kept in memory only. On `401 TOKEN_INVALID` it refreshes once (one refresh at a time, serialised across tabs with the Web Locks API) and retries; any other 401 ends the session in the UI.
- On page load it calls `/auth/refresh` only if a non-secret `birds.session_hint` flag is set in `localStorage` (set at login, cleared at logout or session end).
- Workflow buttons and the Edit link come from each incident's `actions` / `canEdit`; the SPA holds no copy of the workflow table.
- Notifications are polled every 30 s and marked `X-Background-Request: 1` when there was no user input since the previous poll.

## Data integrity (`prisma/sql/integrity.sql`)

Appended to the init migration:

- CHECK constraints on incident status, severity and coordinates.
- `audit_log` and `incident_timeline` are append-only: UPDATE, DELETE and TRUNCATE raise an exception.
- `audit_log` is a SHA-256 hash chain. Each row stores `prev_hash` and `row_hash` (set by a trigger under an advisory lock). Verify it with:

  ```sql
  SELECT * FROM audit_log_verify();  -- first_broken_seq is NULL when the chain is intact
  ```

## Layout

```
server/
├── prisma/
│   ├── schema.prisma        12 tables (CLAUDE.md §17)
│   ├── sql/integrity.sql    constraints/triggers Prisma can't express
│   ├── migrations/          generated; init includes integrity.sql
│   ├── data/seed-data.js    copy of BGB/src/data/seed.js (seed source of truth)
│   └── seed.ts
├── prisma.config.ts         Prisma 7 config (datasource URL, seed command)
├── scripts/                 generate-keys.ts, reset-demo-user.ts
└── src/
    ├── app.ts / server.ts
    ├── db.ts                Prisma client (pg driver adapter)
    ├── config/              env (Zod-validated), logger (Winston: app, error, security logs)
    ├── middleware/          auth, rbac, rateLimiter, errorHandler, requestLogger
    ├── modules/
    │   ├── auth/            router, service, schema, tokens
    │   ├── audit/           writeAudit()
    │   └── admin/           system_config + password policy
    ├── utils/               errors, roles, requestContext
    └── generated/prisma/    generated client (git-ignored; `npx prisma generate`)
```
