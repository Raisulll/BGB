# BIRDS – Project Progress Log

> Append a new session block here after every working session. Never edit or delete previous blocks.
> Format defined in CLAUDE.md §31.1

---

## Session 1 — 2026-10-08 15:07 (+06:00)

### What was done
- Read `projectDetails.md` — all 58 TEC specifications understood
- Explored entire `BGB/` frontend codebase:
  - React 19 + Vite 8 + TailwindCSS v4 SPA
  - `AppContext.jsx` — full in-memory state management
  - `seed.js` — 5 users, 20 incidents, 15 audit entries, 7 categories, ORG_HIERARCHY
  - All pages: Dashboard, Incidents, IncidentForm, IncidentDetail, MapView, Analytics, Reports, AuditTrail, Admin
  - All routes, RBAC guards, workflow state machine documented
- Created `CLAUDE.md` (root) — comprehensive code intelligence guide (§1–§15):
  - Repo layout, tech stack, AppContext API, RBAC, demo credentials
  - Incident data model, shared utilities, design system, route map
  - 58-spec compliance checklist (frontend status)
  - Dev commands, 15 coding rules, new-feature checklist, deployment notes
- Extended `CLAUDE.md` with full backend implementation plan (§16–§30):
  - Technology decisions (Node.js, Express, PostgreSQL, Prisma, MinIO, JWT, etc.)
  - Complete `server/` project structure
  - Full DB schema — 12 tables with SQL, constraints, indexes
  - Database seed migration checklist (seed.js → prisma/seed.ts)
  - Full REST API spec — 40+ endpoints across 9 groups
  - Security, file storage, backup/DR, notifications, LDAP, logging, performance tasks
  - Documentation deliverables (7 document sets with checklists)
  - Training and UAT checklists
  - 6-phase 8-week implementation roadmap
- Added §31 to `CLAUDE.md` — Living Documents protocol
- Created `progress.md`, `requirements-status.md`, `doubt.md` with initial content

### Decisions & rationale
- **Backend stack**: Node.js + Express + PostgreSQL + Prisma chosen for JS ecosystem consistency with frontend
- **MinIO** chosen over raw filesystem for file storage — S3-compatible, self-hostable, satisfies spec #33 without cloud dependency
- **JWT RS256** (asymmetric) over HS256 for production-grade security
- **Prisma** over raw SQL for type safety, migration management, and seeding convenience
- **TailwindCSS v4** noted as important — no `tailwind.config.js` — this must be communicated clearly to prevent accidental breakage
- All 58 specs audited: 24 fully done in frontend, 18 partially done, 16 pending backend/infra
- Frontend is a complete working demo — do NOT break it while building backend

### Blockers / waiting on
- No server/hosting environment details yet (IP, OS, RAM, disk)
- No production domain confirmed (`birds.bgb.gov.bd` assumed)
- No BGB Active Directory / LDAP server details yet (needed for spec #32)
- No SMTP server details yet (needed for email notifications, spec #23)
- No decision on PDF generation: browser print CSS (current) vs. server-side Puppeteer
- Concurrent user target from spec #38 is `[100/250/500]` — brackets suggest client must specify exact number

### Next session — TODO
1. Create `server/` directory and initialize Node.js + TypeScript project
2. Write `server/prisma/schema.prisma` with all 12 tables from CLAUDE.md §17
3. Run `npx prisma migrate dev` to create initial migration
4. Write `server/prisma/seed.ts` migrating all data from `BGB/src/data/seed.js`
5. Implement auth module: POST /auth/login, POST /auth/logout, POST /auth/refresh
6. Test auth endpoints with Postman/curl
7. Update `doubt.md` with any ambiguities found during schema implementation

---
## Session 2 — 2026-10-08 (+06:00)

### What was done
- Reviewed the living docs and the frontend code; `npm run build` passes (Vite, ~0.4s)
- Confirmed `server/` does not exist yet — the backend has not been started
- Found gaps where the frontend demo claims more than it does:
  - Incident ID mismatch: seeds `BIRDS-2026-1001`, new ones `BIRDS-2024-1021` (logged DOUBT-006)
  - `workflowAction()` accepts any transition from any status (spec #25)
  - "Export Excel" just downloads a CSV (spec #22)
  - The session idle timeout is a config UI field only; no auto-logout (spec #28)
  - No failed-login lockout in the demo (spec #29)
- Updated the notes for #15, #22, #25, #28 in requirements-status.md

### Decisions & rationale
- Recommended fixing the demo gaps before starting the backend, because the TEC may evaluate the demo as-is

### Blockers / waiting on
- Same as Session 1, plus DOUBT-006 (ID format)

### Next session — TODO
1. Quick frontend fixes: ID format, workflow transition guard, real XLSX (SheetJS), idle auto-logout, demo lockout
2. Start Phase 1 backend: scaffold `server/` (TS + Express + Prisma) and write schema.prisma
3. Write prisma/seed.ts, then the auth module (login/refresh/logout + lockout)

---
## Session 3 — 2026-10-08 (+06:00)

### What was done
- Fixed the five demo gaps found in Session 2 (all in `BGB/`; `npm run build` passes):
  1. **Incident ID** (#15): `makeIncidentId()` → `BIRDS-<year>-NNNN`; new incidents now match the seeds (`BIRDS-2026-1021`)
  2. **Workflow guard** (#13, #14, #25): exported `WORKFLOW` table with `from` statuses + `allowed(user)`; `workflowAction()` rejects invalid transitions; `updateIncident()` blocks edits unless Draft/Returned; both write DENIED_* audit entries. `IncidentDetail` buttons come from `availableActions()`
  3. **Real Excel export** (#22): SheetJS 0.20.3 from cdn.sheetjs.com, lazy-loaded (own 492 kB chunk); sheet includes the CONFIDENTIAL // OPERATIONAL banner; CSV + Excel exports now audited
  4. **Idle auto-logout** (#28): new `src/hooks/useIdleLogout.js`, used in `Layout`; the timeout and on/off switch in Admin > Security are now live and saved to localStorage
  5. **Login lockout + password policy** (#29): `login()` counts failures per username, locks for `lockoutMinutes` after `maxAttempts`, and returns `{ user } | { error, locked }`; `validatePassword()` enforced on Admin user create + password reset
- AuditTrail: badges, filter options, and security-event count for LOGIN_FAILED, LOGIN_BLOCKED, ACCOUNT_LOCKED, SESSION_TIMEOUT, DENIED_WORKFLOW, DENIED_UPDATE, SECURITY_CONFIG_CHANGE
- Updated CLAUDE.md (§4 API + workflow table, §7, §8, §11 rows, rules 14–15), requirements-status.md, doubt.md (DOUBT-006 → ASSUMED)
- Verified in Node: `validatePassword()` cases, and an .xlsx round trip including Bangla text

### Decisions & rationale
- **Verify/approve restricted to `canApprove`** (Verifier/Approver, HQ Admin), matching §19.3 of the API spec. Sector Officers previously saw Verify/Approve buttons; they can still review, return, and reject
- **Return/Reject allowed from Submitted, Reviewed, Verified** (spec says "Any"); previously each was offered from only one status
- Lockout only counts attempts against existing usernames; every failure is audited either way
- SheetJS installed from its official CDN tarball because the npm-registry `xlsx` package is stuck at 0.18.5 with known CVEs

### Blockers / waiting on
- Unchanged from Session 1 (LDAP, SMTP, hosting, concurrent user target)
- Not yet clicked through in a browser — needs a manual smoke test

### Next session — TODO
1. Manual smoke test of the fixes in the browser (5 wrong passwords for `batt_op`; set timeout to 1 min; run every workflow role; Excel export)
2. Pre-existing bug noticed: the AuditTrail date filter compares `YYYY-MM-DD` input against `DD-MM-YYYY` timestamps, so it never matches
3. Start Phase 1 backend: scaffold `server/` (TS + Express + Prisma), write schema.prisma

---
## Session 4 — 2026-10-08 (+06:00)

### What was done
- Built backend Phase 1 in `server/` (see `server/README.md`):
  - TypeScript/ESM project: Express 5, Prisma 7.10 + `@prisma/adapter-pg`, Zod 4, jsonwebtoken (RS256), bcryptjs, helmet, cors, express-rate-limit 8, winston, morgan. `npm audit`: 0 vulnerabilities (npm `overrides` pin patched `deepmerge-ts` / `mysql2` inside the Prisma CLI)
  - `prisma/schema.prisma`: all 12 tables from §17; `prisma/sql/integrity.sql`: CHECK constraints, append-only triggers on `audit_log` + `incident_timeline`, SHA-256 audit hash chain, `audit_log_verify()`
  - `prisma/seed.ts`: idempotent seed from `prisma/data/seed-data.js` (copy of the frontend seed). Loaded 5 users, 28 role permissions, 16 org rows, 7 categories, 20 incidents, 77 timeline rows, 19 evidence rows, 15 audit rows, 4 notifications, 11 config rows
  - Auth module `/api/v1/auth`: login, refresh (rotating httpOnly cookie), logout, me, change-password, admin/reset-password; account lockout (423); forced password change; single-session; server-side idle timeout; refresh-token reuse detection
  - Middleware: `requireAuth` (checks the session row on every request), `requirePermission(pageId)` (reads `role_permissions`, audits denials), rate limiters, error envelope, Morgan→Winston; `security.log` stream
  - `/api/v1/health`, graceful shutdown, `ecosystem.config.cjs` (PM2 cluster), `scripts/generate-keys.ts`, `scripts/reset-demo-user.ts`
- Set up a **project-local PostgreSQL 18 cluster** (`server/.pgdata`, port 5433) because the system postgres superuser password is unknown. App role `birds` (not a superuser) and `birds_admin` superuser; credentials in git-ignored `server/.env`
- Verified: typecheck + `npm run build` clean; compiled server starts; **30/30 auth end-to-end checks pass**; token-reuse revokes the session; DB rejects UPDATE/DELETE on append-only tables and invalid statuses; audit chain intact (41 rows)
- Updated CLAUDE.md (§16.1, new §16.1a, §17 deviations, §18.1 checklist), requirements-status.md (#2, #3, #4, #24, #25, #28–#31, #48, #49), doubt.md (DOUBT-005 revised, new DOUBT-007)

### Decisions & rationale
- **Hash chain instead of the md5 generated column**: the planned column is rejected by PostgreSQL (non-immutable expression); the trigger-based chain is stronger and verifiable
- **Triggers that raise, not RULEs**: tampering attempts fail loudly instead of silently doing nothing
- **Session-checked access tokens**: one indexed lookup per request buys immediate revocation (logout, lockout, single-session), which the TEC can see work
- **Refresh token in an httpOnly SameSite=Strict cookie** scoped to `/api/v1/auth`; the access token stays in memory on the frontend
- **Login limiter counts only failures** (DOUBT-007), because shared office IPs would otherwise lock out whole units
- **bcryptjs** over native bcrypt: no compiler toolchain on Windows/servers; same hash format
- The init migration was replayed with `prisma migrate reset` (user consented; it was the brand-new empty dev DB)

### Blockers / waiting on
- LDAP details (DOUBT-002), SMTP, hosting, concurrent-user target (DOUBT-001)
- BGB network topology for rate limiting (DOUBT-007)
- MinIO/S3 not set up yet (needed for Phase 2 evidence upload)

### Next session — TODO
1. Phase 2: incidents API — list (filters + pagination), get, create (ID from `incident.next_id` in a transaction, per-year per DOUBT-006), edit (Draft/Returned only), workflow endpoints mirroring the frontend `WORKFLOW` table, timeline writes, notifications
2. Users module (`/users` CRUD with soft deactivate) and admin permission endpoints (call `invalidatePermissionCache()`)
3. Frontend: `BGB/src/api/` client with a single in-flight refresh; switch `login`/`logout` in AppContext to the API
4. Add a real test runner (Vitest + supertest) and move `auth-e2e` checks into the repo
5. Still open from Session 3: browser smoke test of the demo fixes; AuditTrail date-filter bug

---
## Session 5 — 2026-10-08 (+06:00)

### What was done
- **Incidents API** (`server/src/modules/incidents/`): list with filters + pagination, `/meta`, create (Draft/Submitted), detail, timeline, edit, submit, and workflow actions `review/verify/approve/close/return/reject`
  - `workflow.ts` mirrors the frontend `WORKFLOW` table
  - Validation: category/subcategory against the DB, sector/battalion/BOP against `org_hierarchy`, no future dates, strict bodies (unknown fields rejected)
  - Reference numbers `BIRDS-<year>-NNNN` from an atomic per-year counter (`incident.next_id.<year>`); seed migrated from the single `incident.next_id` key
  - Data scoping, private drafts, separation of duties (DOUBT-008); 403 vs 409 vs 404 semantics; conditional updates make concurrent transitions safe
  - Notifications module writes scoped notification rows for each workflow event
- **GIS**: `GET /api/v1/gis/incidents` (map permission, scoped)
- **Automated tests**: Vitest 5 + supertest, disposable `birds_test` database recreated/migrated/seeded per run (`npm test`). **29 tests pass**, stable across runs; the dev DB is untouched. `tsconfig.test.json` typechecks tests too. Rate limiters skip under `NODE_ENV=test`
- **Frontend fix**: `IncidentList.jsx` quick actions now come from `availableActions()` (they still hard-coded the old rules from before Session 3)
- Docs: server README (incidents API + rules), CLAUDE.md §19.3 note, requirements-status (#3, #5–#9, #12–#16, #18, #23, #25), DOUBT-008

### Decisions & rationale
- **Out-of-scope = 404**, so users can't probe which reference numbers exist elsewhere
- **Separation of duties** on every supervisory action: standard control for approval chains, and visible to the TEC
- **Return/reject require a reason**, stored in `incident_timeline.notes` and the notification
- **Wrong state = 409 Conflict, wrong role/owner = 403**; both audited as `DENIED_*`
- Per-year counter numbering starts at 1001 each year (matches the seeded 2026 numbering)
- Export endpoints (`/incidents/export/*`) move to the reports module, where the same filters will be reused

### Blockers / waiting on
- Unchanged: LDAP (DOUBT-002), SMTP, hosting, concurrent-user target (DOUBT-001), NAT topology (DOUBT-007)
- New: BGB confirmation of scoping/self-approval rules (DOUBT-008)
- MinIO/S3 decision for evidence storage

### Next session — TODO
1. Evidence upload/download (Multer, MIME whitelist, 50 MB cap, EXIF via `exifr`, storage adapter with a local-disk dev driver + S3/MinIO driver)
2. Users module (`/users` CRUD, soft deactivate) + admin endpoints (config, permissions with cache invalidation, categories, org hierarchy)
3. Audit + notifications read APIs; reports/analytics endpoints including CSV/XLSX export
4. Frontend wiring: `BGB/src/api/` client (single in-flight refresh), AppContext hydration from the API
5. Still open: browser smoke test of the Session 3 demo fixes; AuditTrail date-filter bug

---
## Session 6 — 2026-10-08 (+06:00)

### What was done
- **Evidence module** (`server/src/modules/evidence/`): upload (multipart, Multer 2.4 in memory, UTF-8 file names), list, streamed download (`?inline=1`, `Repr-Digest` SHA-256 header, RFC 5987 file names), `POST /:eid/verify` (hash re-check), soft delete
  - Content-based type detection (`fileType.ts`: JPEG/PNG/GIF/PDF/MP4/MOV magic numbers); an all-or-nothing batch
  - Metadata (`metadata.ts`): SHA-256, EXIF camera/time fields + GPS via `exifr` 7.1.3, declared vs detected MIME, client last-modified
  - Virus-scan hook (`scanner.ts`): records `not_scanned` until an engine is chosen (DOUBT-009)
  - Limits: 50 MB/file, 500 MB/incident, 10 files/request (env-configurable); per-incident quota → 413
  - Storage abstraction (`src/config/storage.ts`) with an atomic local-disk driver and path-traversal guards
  - Rules: creator uploads only while Draft/Returned; removal by the creator while editing or by an HQ admin with a reason; drafts and out-of-scope evidence return 404; every action audited
- Migration `evidence_sha256` adds `evidence.sha256` (applied to dev; additive)
- Evidence routes are mounted before the incidents router (whose `/:id/:action` would otherwise capture `/evidence`); Multer limit errors map to 413/400
- Tests: 12 new evidence tests with in-code fixtures (a real EXIF+GPS JPEG, PDF, PNG, a disguised HTML file, an oversize file). **41/41 pass**; typecheck, build and `npm audit` clean
- Docs: server README (Evidence API), CLAUDE.md §19.4 note, requirements-status (#10, #11, #33), DOUBT-009

### Decisions & rationale
- **Magic-number detection, not Content-Type**: attackers control the declared type and the extension
- **SHA-256 per file + verify endpoint**: evidence chain of custody is a likely TEC question; tampering is detectable and audited (`EVIDENCE_INTEGRITY_FAILURE`)
- **Soft delete only**: files stay in storage for the retention policy; the timeline records the removal and the reason
- **No fake "clean" scan result**: the absence of AV is recorded explicitly
- **S3/MinIO driver deferred**: no MinIO instance is available to test against; the interface is ready. Local disk is a valid central store on the app server, if backed up

### Blockers / waiting on
- AV product (DOUBT-009); MinIO/S3 availability for spec #33
- Unchanged: LDAP, SMTP, hosting, user target, NAT topology, scoping confirmation (DOUBT-001/002/007/008)

### Next session — TODO
1. Users module (`/users` CRUD, soft deactivate, role/scope changes ending sessions) + admin endpoints (config, permissions with cache invalidation, categories, org hierarchy)
2. Audit read/export API (+ `audit_log_verify` exposed) and notifications read API
3. Reports/analytics endpoints + CSV/XLSX export
4. Frontend wiring: `BGB/src/api/` client and AppContext hydration
5. S3/MinIO storage driver once an instance is available; retention job
6. Still open: browser smoke test of the Session 3 demo fixes; AuditTrail date-filter bug

---
## Session 7 — 2026-10-08 (+06:00)

### What was done
- **Users module** (`server/src/modules/users/`): list/filter, create (generated temp password or admin-set; change always forced at first login), get, update (name/role/scope/email/active/unlock), soft-deactivate. Ids `U006…` allocated under an advisory lock
  - Guards: no self role-change/deactivation; at least one active HQ Administrator must remain (409 `LAST_ADMIN`); role and scope validated; duplicate username/email → 409
  - A role change, scope change or deactivation ends the user's sessions immediately
- **Admin module** (`server/src/modules/admin/`):
  - `GET/PATCH /config`: `CONFIG_DEFAULTS` now carries type + min/max; all-or-nothing validation; caches invalidated; old → new audited; incident counters read-only
  - `GET/PATCH /roles/permissions` (toggle one page or replace the set) and `POST /reset`; HQ Administrator can't lose `admin`; permission cache invalidated so changes apply at once
  - `GET/POST/PATCH /categories`: `CAT08…` ids; (de)activate categories and subcategories; categories in use can't be renamed
  - `GET/POST /org-hierarchy`: add units; battalion→sector consistency; names unique across levels
- Tests: `users.test.ts` (8) and `admin.test.ts` (11). **60/60 pass**, twice; typecheck, build and `npm audit` clean
- Docs: server README (Users + Admin APIs), CLAUDE.md §19.2/§19.8 notes, requirements-status (#3, #6, #9, #46, #47, #55)

### Decisions & rationale
- **Admin-created users must change their password** even when the admin chose it: the admin knows it, so it isn't a personal secret
- **No renaming categories in use**: incidents store the category name; renaming would split statistics and break filters. Deactivate and create a new one instead
- **Org units are add-only**: incidents and user scopes reference them by name
- **Settings apply immediately in the serving process**; other PM2 workers pick them up within the 30 s cache window

### Blockers / waiting on
- Unchanged: LDAP, SMTP, hosting, user target, NAT topology, scoping confirmation, AV product, MinIO (DOUBT-001/002/007/008/009)

### Next session — TODO
1. Audit API: `GET /audit` (filters, pagination), CSV export, `GET /audit/verify` (exposes `audit_log_verify()`)
2. Notifications API: list own + broadcasts, mark read / read-all
3. Reports/analytics: summary, trends (day/week/month/quarter/year), by category/sector/severity, operational report, CSV/XLSX export
4. Frontend wiring: `BGB/src/api/` client and AppContext hydration
5. Still open: S3/MinIO driver; browser smoke test of the Session 3 demo fixes; AuditTrail date-filter bug

---
## Session 8 — 2026-10-08 (+06:00)

### What was done
- **Audit API** (`server/src/modules/audit/`): paginated search (action, user, text, BST day range), `GET /audit/verify` over `audit_log_verify()`, CSV/XLSX export (≤50k rows). Viewing (first page), verifying and exporting are audited
- **Notifications API**: own notifications with `unreadCount`, mark one / all read (others' → 404). Seed now writes **per-user** copies for users whose scope covers the incident and removes the old broadcast rows (dev DB converted: 4 broadcasts → 17 rows)
- **Reports API** (`server/src/modules/reports/`): summary KPIs, trends (day / ISO week / month / quarter / year; gap-filled; ≤750 periods), by category / severity / sector (risk score), operational report with 4 types (operational, statistical, high-threat, sector-audit), CSV/XLSX exports; `/incidents/export/:format` alias
- Shared building blocks: `incidentWhere()` (one filter + scope + draft rule for list, GIS and reports); `src/utils/export.ts` (banner, UTF-8 BOM, formula-injection guard, SheetJS 0.20.3 from the SheetJS CDN); BST display helpers; `requireAnyPermission()` (`requirePermission` is now a special case of it)
- ISO-week labelling checked against 8 known dates including year boundaries
- Tests: `audit.test.ts` (6), `notifications.test.ts` (4), `reports.test.ts` (12). **82/82 pass**; typecheck, build, `npm audit` clean
- Docs: server README, CLAUDE.md §19.5–19.7 notes, requirements-status (#17, #19–#24), DOUBT-004 update

### Decisions & rationale
- **Analytics endpoints accept `dashboard` or `analytics`**: the Dashboard shows KPIs/trends to every role; data is scoped per user anyway
- **Analytics exclude drafts**: statistics describe filed reports only
- **Per-user notification rows**: read state per recipient; broadcasts would mark read for everyone
- **CSV/formula injection protection**: user-controlled text (e.g. a crafted username in LOGIN_FAILED) could otherwise run as a spreadsheet formula when the auditor opens the export
- **Server-side PDF deferred** (DOUBT-004 update)

### Found, not fixed
- `BGB/src/pages/Reports.jsx` battalion dropdown lists `19 BGB` and `26 BGB`, which don't exist in the org hierarchy (CLAUDE.md rule 13). Fix when wiring the page to `/incidents/meta`

### Blockers / waiting on
- Unchanged: LDAP, SMTP (email notifications), hosting, user target, NAT topology, scoping confirmation, AV product, MinIO

### Next session — TODO
1. **Frontend wiring**: `BGB/src/api/` client (single in-flight token refresh, 401 → login), AppContext hydration, Login/Logout, Incidents list/detail/form, workflow buttons from the API's `actions`
2. Then Dashboard/Analytics/Reports/Audit/Admin pages on the API; evidence upload in IncidentForm step 3
3. Vite dev proxy `/api` → `localhost:4000`
4. Still open: S3/MinIO driver; AuditTrail date-filter bug (goes away when the page uses the API's filters); Session 3 browser smoke test

---
## Session 9 — 2026-10-09 (+06:00)

### What was done
- **Status review** at the start: corrected stale rows #18, #25, #31 in requirements-status.md
- **Frontend wired to the API** (CLAUDE.md §18.2 complete):
  - `BGB/src/api/`: `client.js` (in-memory access token; one refresh at a time, serialised across tabs with Web Locks; 401 handling; `ApiError`; authenticated downloads) + `auth`, `incidents` (incl. evidence, GIS), `users`, `audit`, `notifications`, `reports`, `admin`
  - Vite dev/preview proxy `/api` → `localhost:4000`; `BGB/.env.example`
  - `AppContext` rewritten as a thin layer: session restore from the refresh cookie, policy, `/incidents/meta`, 30 s notification polling
  - Every page moved to the API: Login, Dashboard, Incidents (server-side filters + paging), IncidentForm (create/edit/resubmit, evidence upload), IncidentDetail (server `actions`, reason dialog, evidence download/verify/remove), Map, Analytics, Reports, Audit Trail, Admin (split into 6 tab files)
  - New: `/change-password` page (forced after admin reset), `useApi` hook, `ErrorState`, `Modal`/`OneTimeSecret`, `ReasonDialog`, BST date-time helpers
  - **Removed made-up data shown as real**: dashboard baseline trend numbers, analytics "+12.4% MoM", "38 m avg response", a hard-coded sector table with non-existent battalions, the fake YoY baseline, a fake SHA-256 in the audit inspector, admin "last backup / pool 18/50 / 2.4 GB / 99.98% uptime / 23 archived / AES-256" tiles, demo-only password reset, no-op notification toggles; the form no longer invents random GPS coordinates
  - Login: demo-account shortcuts only in dev (or `VITE_SHOW_DEMO_ACCOUNTS=true`); removed the non-functional "Remember session" checkbox
  - Deleted `BGB/src/data/seed.js` and dead helpers (`countBy`, `toCSV`, `downloadFile`, role helpers, `nowString`)
- **Server changes** (for the frontend):
  - `GET /auth/me` returns `policy` (idle timeout + password rules) for every role
  - `X-Background-Request: 1` requests and refreshes don't update `last_seen_at`, so polling can't keep an idle session alive
  - `POST /auth/logout { reason: 'timeout' }` audited as `SESSION_TIMEOUT`
  - `/reports/by-category` adds `highSeverity` and a subcategory breakdown
  - Audit view logging: records the search filters; an identical repeat within 60 s isn't logged again (searching no longer floods the log)
  - `spa-contract.test.ts` (8 tests). **90/90 pass**; typecheck, build, `npm audit` clean (both projects)
- **Browser test**: Playwright + system Chrome, 18 steps across all 5 roles (file with evidence → review → hash verify → return with reason → edit/resubmit; analytics, reports + Excel export, map, audit verify, all admin tabs, RBAC redirect, reload keeps session, logout). All pass with no console errors or 5xx
- Docs: BGB/README.md rewritten; server README (auth, reports, audit, "Frontend contract"); CLAUDE.md §1, §2, §4, §5, §7, §8, §10, §11, §13, §14, §18.2; requirements-status (28 DONE); DOUBT-010, DOUBT-011

### Decisions & rationale
- **Pages fetch their own data; AppContext only holds session-wide state**: no stale global incident cache, and the server stays the single source of truth for rules (workflow buttons come from `actions`)
- **Access token in memory, refresh token httpOnly cookie, same-origin `/api`**: no token in `localStorage`; only a non-secret "session hint" flag there to skip a pointless refresh on anonymous visits
- **Background-request header** rather than dropping polling: keeps notifications live without defeating the idle timeout (spec #28)
- **Show nothing the system doesn't measure**: removed or labelled ("JOB PENDING") every figure without a real source. The TEC will check these numbers
- **Exports server-side only**: one implementation with the banner, injection guard and audit entry

### Problems / notes
- `BGB/src/data/seed.js` was deleted **without first diffing it** against `server/prisma/data/seed-data.js`, and the two differed. The server copy says it was copied verbatim on 2026-10-08 and has every export, so the difference is most likely its header comment, but this can't be confirmed (no git repo). The server copy is the seed source of truth.
- The smoke test created incidents BIRDS-2026-1021 to 1023 (each with a 1 KB PNG) in the **dev** database.
- In dev, React StrictMode doubles every load request; a test that reloads pages a lot can hit the 100 req/min per-user limit. Not an issue in production builds.
- The project is not under version control. Recommend `git init` before further work.

### Blockers / waiting on
- Hosting for the TEC demo (DOUBT-010); partial drafts (DOUBT-011)
- Unchanged: LDAP, SMTP, user target, NAT topology, scoping confirmation, AV product, MinIO (DOUBT-001/002/007/008/009)

### Next session — TODO
Deferred for the demo version (user decision 2026-10-09): scheduled backups (#34), DR (#35), HA (#36), load/performance/availability testing (#38–#40), log rotation + `/admin/logs/summary` (#48). Production plans in CLAUDE.md §22, §25, §26 are unchanged.

1. Put the project under git (no version control today)
2. Decide how the TEC sees the demo, then set up hosting (DOUBT-010)
3. OpenAPI 3.1 spec + Swagger UI (spec #31/#52); user manual (#52)
4. Bangla i18n framework (DOUBT-003)

Added after the session summary: deferred items now appear in **Admin › Operations** with DEMO badges (`components/ui/Demo.jsx`: `DemoBadge`, `Sample`, `DemoNotice`, `DemoButton`). Buttons only show "not active in the demo version"; illustrative values are marked SAMPLE. The backup interval setting moved there from Security & System.

---
## Session 10 — 2026-10-09 (+06:00)

> Continuation of Session 9 after the user added a git repo (one commit, "in progress"). Everything below is **uncommitted** working-tree changes; nothing was committed (the user hasn't asked).

### What was done
- **Bangla localization (spec #43)** — complete for the whole UI
  - `BGB/src/i18n/`: `I18nContext.jsx` (`useI18n()` → `t(key, vars)`, `tv(group, value)` for status/severity/role/action/timeline/audit-action values), `en.js` + `bn.js` (865 keys, same keys + same `{placeholders}`), language switch EN/বাং in the header and on the login page (`components/layout/LanguageSwitcher.jsx`, choice kept in `localStorage` `birds.lang`)
  - Bengali font bundled offline: `@fontsource/noto-sans-bengali` 5.2.8 (Bengali subset only, loads on demand)
  - API error messages translated by error code in Bangla mode (`setErrorTranslator` in `api/client.js`); English keeps the server's message
  - `npm run i18n:check` (`BGB/scripts/check-i18n.mjs`): both dictionaries in sync, placeholders match, every `t('key')` in `src/` exists. **From now on edit `en.js`/`bn.js` directly** (they were generated this session from scratch fragments that no longer exist)
  - Fixed while translating: clock showed local time labelled "BDT" (now Asia/Dhaka, "BST"); fake "Security Level: Level 4" in the user menu; "TLS 1.3 Active" badge now only on HTTPS; "Encrypted Logs" claim → "Tamper-evident log"; incident form's server-validation mapping (Zod `fieldErrors`) was broken; KPI labels wrap instead of truncating
- **Spec #4 / #32**: local username/password sign-in is the active method (user decision: AD/LDAP details not provided). Admin › Security & System has a **DEMO** "Directory Sign-in (AD/LDAP)" card (`AdminDirectory.jsx`) with sample settings
- **Specs #41/#42 verified**: no horizontal overflow or console errors at phone (390px) / tablet / desktop in **Chrome, Edge and Firefox**; full workflow test passes in Chrome and Firefox
- **E-mail notifications (spec #23)**: transactional outbox (`email_outbox` table) + worker (`server/src/modules/notifications/mailer.ts`, Nodemailer 10.0.10). Mail for submitted/approved/rejected/returned to the in-app recipients; messages carry reference + link only (no title/notes). Claims rows with `FOR UPDATE SKIP LOCKED`, retries with back-off, max 5 attempts. Config `SMTP_HOST/PORT/SECURE/USER/PASSWORD`, `MAIL_FROM`, `APP_BASE_URL`, `MAIL_TRANSPORT` (smtp|json|none; default none without SMTP_HOST). `GET /admin/mail`, `POST /admin/mail/test`. UI card in Admin › Security & System (`AdminMail.jsx`) shows "Not configured" until SMTP is set
- **Archiving + retention (specs #44, #45)**: `incidents.archived_at/archived_by` + DB CHECK (only Closed/Rejected), setting `archive.after_days` (default 365). Admin archive/restore (`POST /incidents/:id/archive|unarchive`, restore needs a reason), daily job + `POST /admin/archive/run` under an advisory lock, `GET /admin/archive` summary (active / archived / due / past retention). Lists exclude archived by default (`archived=exclude|include|only`), statistics include them. Timeline + audit (`ARCHIVE_INCIDENT`, `UNARCHIVE_INCIDENT`, `ARCHIVE_RUN`). UI: archive filter on Incidents, archived banner + Archive/Restore on detail, "Archiving & Retention" card in Admin. Nothing is ever deleted automatically (DOUBT-012)
- **Evidence encryption at rest (spec #27)**: `EncryptedStorage` wrapper in `server/src/config/storage.ts` (AES-256-GCM, storage key as AAD, header `BIRDSEV1`). `EVIDENCE_ENCRYPTION_KEY` (base64, 32 bytes; `npm run keys:evidence`) — **required in production**, set in the local `.env`. Tampered files → download 409 `EVIDENCE_TAMPERED` + audit; swapped-in plaintext refused unless it matches the upload hash; pre-encryption files still readable
- `API_RATE_LIMIT_PER_MINUTE` env (default 100; local `.env` = 1000 because dev StrictMode + browser tests exceed 100)
- `getConfig` now lists settings that have no DB row yet (shows their default)
- Migration `20261009011145_email_outbox_and_archiving` (applied to the dev DB)
- Tests: `mail-archive.test.ts` (8), `encryption.test.ts` (5) → **103/103 pass**; server typecheck clean; frontend build clean; `npm audit` 0 in both
- **OpenAPI 3.1 spec — IN PROGRESS, NOT VALID YET**: `server/docs/api/openapi.yaml` written (all routes, schemas, errors, auth/rate-limit docs). Validation with `@apidevtools/swagger-parser` still fails: plain YAML values inside `{ … }` flow mappings that contain commas (e.g. the `Q` parameter `description: Reference number, title, …`) must be quoted. Swagger UI is not wired yet

### Decisions & rationale
- Self-made i18n (context + JSON-like dictionaries) instead of a library: ~865 strings, no plural rules needed, no new runtime dependency
- Data entered by users (titles, categories, unit names) is never translated; only interface text and fixed values
- E-mail via outbox so rolled-back actions never send mail and SMTP outages don't lose messages; minimal content because mail may leave BGB's network
- Archived = out of working lists, still in statistics and readable; retention only flags records (deletion of evidential records needs a human decision)
- Encryption wraps the storage interface so the future S3/MinIO driver gets it for free

### Problems / notes
- Seed incidents and timelines carry **future dates** (e.g. 25-10-2026 while today is 09-10-2026); new timeline entries therefore sort *before* seeded ones and the dashboard trend peaks in October. Consider re-dating the seed relative to "today"
- Dev DB now has extra test incidents BIRDS-2026-1021 … 1028 from browser test runs
- The browser test scripts (Playwright, in this session's scratchpad) are not in the repo; worth adding an `e2e/` folder later
- Uncommitted: all of Session 10's changes — commit when the user asks

### Blockers / waiting on
- SMTP details (to switch e-mail on), AD/LDAP details (DOUBT-002), hosting decision (DOUBT-010), partial drafts (DOUBT-011), retention disposal rule (DOUBT-012), AV product (DOUBT-009), user target (DOUBT-001)

### Next session — TODO
1. **Fix `server/docs/api/openapi.yaml` validation** (quote comma-containing values inside flow mappings), then serve it: `GET /api/v1/openapi.json` + Swagger UI at `/api/docs` in development (§27.3). Validate with `npx @apidevtools/swagger-parser`-style check
2. Update `server/README.md` (mail, archiving, encryption, rate-limit env, OpenAPI) and `BGB/README.md` (Bangla, `i18n:check`)
3. Deployment pack (spec #56/#27): Nginx config with TLS + `/api` proxy, PM2 ecosystem review, installation guide (`server/docs/installation-guide/`)
4. Security docs (specs #49/#50): `docs/security/owasp-assessment.md`, `npm audit` evidence; ZAP scan if a tool is available
5. Documentation set (spec #52): user manual (per role), admin manual, DB schema/ERD
6. UAT test cases (spec #57, `docs/uat/test-cases.xlsx`), training material outline (spec #53)
7. S3/MinIO storage driver (spec #33) when an instance is available; customization of form fields (spec #55) if wanted
8. Consider re-dating seed data; add the Playwright e2e tests to the repo

---
## Session 11 — 2026-10-09 (+06:00)

### What was done
- **OpenAPI 3.1 spec fixed** (`server/docs/api/openapi.yaml`): three unquoted values containing commas inside `{ … }` (the shared `Q` parameter, the audit `q` parameter, the audit `actions` list). One failed schema validation; the other two silently produced bogus extra keys. Now valid (`@apidevtools/swagger-parser`), 45 paths / 56 operations
- **Served** (`server/src/apiDocs.ts`): `GET /api/v1/openapi.json` (public) + Swagger UI at `/api/docs` (`swagger-ui-express` 5.0.1; YAML read with `yaml` 2.9.1). New env `API_DOCS` (unset = on except in production). Swagger UI doesn't persist the pasted token
- **`test/openapi.test.ts`** (3 tests): spec is valid OpenAPI 3.1; its method+path set equals the routers' routes in both directions; JSON and UI are served
- Fixed a pre-existing typecheck error in `test/encryption.test.ts` (`noUncheckedIndexedAccess`); `npm run typecheck` was failing in the last commit
- Verified: typecheck clean, build clean, 106 tests; Swagger UI rendered in headless Chrome under the Helmet CSP with all 56 operations and no console errors
- Docs: `server/README.md` (API documentation section), `.env.example`, CLAUDE.md §1/§11/§27.3, requirements-status (#31 → DONE, #52 note)

### Decisions & rationale
- Keep the YAML hand-written (not generated from Zod) and guard it with a route-coverage test: no new build step, and drift fails CI
- API docs off by default in production: the document maps every route. `API_DOCS=true` publishes them deliberately (e.g. TEC demo)

### Problems / notes
- **Flaky test**: `mail-archive.test.ts` › "queues mail for reviewers on submission…" failed in 1 of 3 full runs (passed alone and in the other runs). Not related to this change: no mail worker runs during tests. Needs investigation
- §27.3 "example request/response for every endpoint" is not complete (27 examples)
- `npm run db:start` on Windows keeps the calling shell attached to Postgres's output; harmless

### Blockers / waiting on
- Unchanged: hosting decision (DOUBT-010), SMTP, AD/LDAP (DOUBT-002), AV (DOUBT-009), user target (DOUBT-001)

### Next session — TODO
1. Investigate the flaky mail test
2. Decide demo hosting (DOUBT-010), then the deployment pack: Nginx TLS + `/api` proxy, PM2 review, installation guide (specs #56, #27)
3. `BGB/README.md`: Bangla + `i18n:check`
4. Security docs (#49/#50): OWASP assessment, `npm audit` evidence, ZAP scan
5. Documentation set (#52): user manual, admin manual, DB schema/ERD; fill in remaining OpenAPI examples
6. UAT test cases (#57), training outline (#53)
7. Re-date seed data; move Playwright e2e tests into the repo

**Added after the session summary — demo hosting decided (DOUBT-010 resolved).** No VPS is available, so the TEC demo will run on **Render (API + built SPA on one URL) + Supabase (Postgres + Storage for evidence)**, Singapore region, demo data only. Not built yet. Full plan, findings and setup steps: `server/docs/installation-guide/demo-hosting-render-supabase.md`. This replaces TODO item 2 above; revised order for the next sessions:
1. Serve the SPA from Express (one Render service, same-origin cookie); CSP check incl. map tiles
2. S3 storage driver (`STORAGE_DRIVER=s3`) for Supabase Storage, wrapped by `EncryptedStorage` (spec #33)
3. `render.yaml` + Supabase role/migration/seed steps; the user creates the accounts and enters secrets
4. Deploy and verify (full workflow on the live URL, evidence survives a restart, real client IPs in the audit log)
5. Then: flaky mail test, `BGB/README.md`, security docs, documentation set, UAT (items 1, 3–7 above)

---
## Session 12 — 2026-10-09 (+06:00)

### What was done
- Committed the hosting decision (`1f435aa`). Compared Vercel (frontend + serverless API) with Render for the user, who then chose **Render (app) + Supabase (DB + Storage)**. Reasons against Vercel: 4.5 MB request-body cap (evidence is 50 MB and encrypted server-side), no background timers (mail outbox, archive job), per-instance in-memory rate limits, Hobby plan non-commercial
- **SPA served by the API** (`server/src/spa.ts`, env `SERVE_SPA_DIR`): hashed assets cached 1 year, `index.html` `no-cache`, client-route fallback; `/api/*` and missing files stay JSON 404s. Own CSP for the SPA: self + `*.tile.openstreetmap.org` + Google Fonts, no inline scripts
- **S3 storage driver** (`STORAGE_DRIVER=s3`, `S3_ENDPOINT/REGION/BUCKET/ACCESS_KEY_ID/SECRET_ACCESS_KEY/FORCE_PATH_STYLE`) in `src/config/storage.ts`, wrapped by `EncryptedStorage`; `@aws-sdk/client-s3` 3.1141.0; CRC checksums only when required (S3-compatible stores)
- `TRUST_PROXY` now accepts a hop count / true / false (Express would have read `"1"` as an IP address)
- `render.yaml` (Blueprint: Singapore, Free plan (user decision; Starter if always-on is needed), `autoDeploy: false`, health check, env incl. secret files for JWT keys + Supabase CA; evidence limit 49 MB for Supabase free plan's 50 MB object cap)
- `server/prisma/sql/supabase-demo-access.sql`: revokes Supabase `anon`/`authenticated` access to `public`, grants app role `birds` data-only privileges
- `npm run keys -- --out <dir>` for separate demo JWT keys
- Guide rewritten as step-by-step: `server/docs/installation-guide/demo-hosting-render-supabase.md`
- **Fixed the flaky mail test**: `processOutbox()` sends one batch of 20 (oldest first) and other test files leave mail pending, so when vitest's file order put more than 20 rows ahead, the test's rows weren't in the batch. Test now drains the queue
- Tests: `storage-s3.test.ts` (4), `spa-serving.test.ts` (4). **114/114 pass three runs in a row**; typecheck clean; `npm audit --omit=dev` 0
- Verified locally: clean copy of the repo builds with the Blueprint build command under `NODE_ENV=production`; compiled server serves the SPA; headless Chrome (all pages, map tiles, fonts, deep-link reload, Swagger UI) shows no CSP violations or errors; `TRUST_PROXY=1` logs the forwarded client IP; the access SQL on a simulated Supabase DB: `birds` reads/writes, can't update `audit_log`, can't disable its triggers ("must be owner"), can't read `_prisma_migrations`; `anon` denied

### Decisions & rationale
- Migrations, seed and privilege script run as `postgres` from the developer PC; Render only runs the app as `birds`. Keeps the superuser password off Render and makes the audit triggers untouchable by the app login
- Supabase Data API switched off **and** grants revoked: two locks, because the project's anon key is public by design
- TLS to Supabase verified against its CA (secret file), not `no-verify`
- `autoDeploy: false` so a push can't redeploy during the TEC session

### Problems / notes
- The local Postgres cluster was stuck (Windows "could not reserve shared memory region", error 487): it listened but reset every connection. A fast stop/start fixed it
- Testing `TRUST_PROXY` wrote one `LOGIN_FAILED` audit entry for `auditor` (IP 203.0.113.7) in the **dev** DB; the account was reset with `demo:reset-user`
- Not yet confirmed: whether `prisma migrate deploy` accepts `sslrootcert` in the URL (fallback noted in the guide); whether Render reaches Supabase's pooler without issues
- A copy of `server/.env` was left in this session's scratchpad (`render-sim/server/.env`); a safety hook blocked deleting it. It's outside the repo; delete it by hand
- Local `master` is 1 commit ahead of `origin`; Render deploys from GitHub, so it needs a push

### Blockers / waiting on
- User: Supabase project + Render account/service, secrets entered (guide steps 1–4)
- Unchanged: SMTP, AD/LDAP (DOUBT-002), AV (DOUBT-009), user target (DOUBT-001), partial drafts (DOUBT-011), retention disposal (DOUBT-012)

### Next session — TODO
1. Deploy with the user (guide steps 1–5) and run the live verification checklist; mark the guide DEPLOYED
2. `BGB/README.md`: Bangla + `i18n:check`, demo hosting pointer
3. Security docs (#49/#50): OWASP assessment, `npm audit` evidence, ZAP scan (can run against the Render URL)
4. Documentation set (#52): user manual, admin manual, DB schema/ERD; remaining OpenAPI examples
5. UAT test cases (#57), training outline (#53)
6. Re-date seed data; move Playwright e2e tests into the repo

**Added after the session summary — first deployment (2026-10-09).** Live at https://birds-demo.onrender.com (Render Free plan, Supabase Singapore); health OK and sign-in works. Problems hit and fixed: (1) JWT secret files missing, then pasted incorrectly → login 500 while startup looked fine; the key pair is now checked at startup (`tokens.ts`). (2) Error logs showed `"err":{}` (Error objects serialize to `{}` in JSON); the error handler and audit-write failure now log name/message/stack. (3) `TRUST_PROXY=1` logged Render's own 10.x proxy address; now `loopback,uniquelocal` (`render.yaml`; the dashboard value must be changed by hand, as Blueprint edits don't update an existing service). The Supabase `postgres` password was pasted in chat and the user was asked to reset it. Commit `0e80a49`. Still to do: the live verification checklist in the guide (evidence upload + restart, audit IPs, all roles), then mark the guide DEPLOYED.

**Added later — two live issues fixed (not yet deployed).** (1) **Map blocked by OpenStreetMap**: Helmet's default `Referrer-Policy: no-referrer` applied to the SPA once Express served it, and OSM refuses tile requests without a Referer. `spa.ts` now sends `strict-origin-when-cross-origin` (origin only, never page paths). The earlier local tile check counted HTTP responses and missed the block image. Production note: OSM's public tiles aren't for operational use; BGB production needs its own tile server or a licensed provider. (2) **No evidence preview**: it was never built (only icon + download). New `components/incidents/EvidencePreview.jsx`: a View (eye) button for JPEG/PNG/GIF/MP4 on the incident page and in the edit form's saved files, opened on request in a dialog (blob URL, revoked on close). Not automatic thumbnails: every open is fetched with the token and audited. Inline opens are now audited as `VIEW_EVIDENCE` (downloads stay `DOWNLOAD_EVIDENCE`); i18n keys added in both languages. Verified: 114 tests, `i18n:check`, and a headless-Chrome run (upload PNG → View renders 64x48 on both pages, tiles carry the Referer). Video preview not exercised in the browser test. Dev DB has new test incidents BIRDS-2026-1029…1031.

**Added later — evidence shown automatically (user request).** The click-to-open View button is replaced by in-place media: `components/incidents/EvidenceMedia.jsx` loads JPEG/PNG/GIF/MP4 evidence on the incident page (large) and in the edit form (small), fetched with the access token one file at a time (videos up to ~50 MB are decrypted in server memory; Render free has 512 MB); clicking an image enlarges it from the loaded copy. Files picked but not yet uploaded show from the browser's own copy (no server call). Server: an automatic view is audited once per user per file per 10 minutes (`VIEW_DEDUPE_MS` in `evidence.service.ts`, per process like the audit-trail view de-dup); downloads are always audited. Tests: evidence test covers the repeat-view rule; 114/114; headless Chrome confirms image + video load with no click, enlarge works, form shows uploaded and picked files. Dev DB: test incident BIRDS-2026-1032 added.

**Added later — "recent incidents first".** The list already sorts by `createdAt` desc; the problem was the seed data, 17 of 20 incidents dated after today (up to 25-10-2026), so anything filed today sorted below them (and the trend charts peaked in late October). `prisma/seed.ts` now shifts every seed date (incident dates, created/timeline/evidence/audit timestamps, dates inside evidence metadata text) by whole days so the newest seed event is yesterday in Bangladesh; gaps and times of day are kept. `SEED_FIXED_DATES=true` (set by `test/globalSetup.ts`) keeps the original dates so tests stay deterministic. Checked on a throwaway DB: created 14-09..07-10, last timeline 08-10 (today 09-10), audit chain intact; 114/114 tests. Existing databases keep their old seed until reset (seed only fills empty tables; timeline/audit are append-only): the live Supabase DB needs `prisma migrate reset` + seed + `supabase-demo-access.sql`, which wipes all live data. Lesson: Bash-tool heredocs collapse `\` in Python sources; a `\b` turned into a backspace character in seed.ts — write regex-bearing lines from a file or check with `cat -A`.

**Added later — "section 1" usability features (user request after a gap review).**
- Incidents page: views **All / Needs my action / My incidents / My drafts** (badge counts for action + drafts; tabs shown by role: filers get My*, reviewers/filers get Needs my action, auditors none), **date range**, **Sector → Battalion → BOP** filters (from `meta.hierarchy`), **sort** (filed newest/oldest, incident date, reference); view and filters live in the URL. Old `?date=` links still work
- Server: `needsAction=true` list filter = statuses the role can act on (`actionableStatuses()` in `workflow.ts`, not own) + own Returned; `meta.canAct`; `canDiscard` on incidents
- **Discard draft**: `DELETE /incidents/:id` (creator, never-submitted Draft only). Timeline is append-only, so it's a soft delete: migration `20261009121335_discard_drafts` adds `discarded_at/discarded_by` + CHECK (Draft only); `visibilityWhere`/`canSee` hide discarded records everywhere (list, detail, GIS, reports); timeline "Discarded" + audit `DISCARD_DRAFT`; archive summary excludes them. UI: "Discard draft" button with optional reason on the detail page
- **Unsaved-changes warning** on the incident form (`hooks/useUnsavedChanges.jsx`): browser prompt on close/reload, dialog on in-app link clicks. `<BrowserRouter>` has no `useBlocker`, so the browser Back button isn't covered
- OpenAPI updated (DELETE route, `needsAction`, `canAct`, `canDiscard`); README, CLAUDE.md §19.3, requirements-status #16
- Verified: `my-work.test.ts` (7) → **121/121**; headless Chrome 24 checks across batt_op / sector_off / auditor; 390 px width in English and Bangla without overflow
- **Live deploy needs the new migration** on Supabase (`npm run db:deploy` as postgres, or the planned reset, which applies it). The table-level grants in `supabase-demo-access.sql` cover new columns

**Added later — "section 2" workflow usability (user request).**
- **Return/reject reason banner** (`components/incidents/ReasonBanner.jsx`) on the incident page and in the edit form: who, when, the reason, and "edit and submit again" for the filer
- **Overdue indicator**: migration `status_since_and_comments` adds `incidents.status_changed_at` (backfilled from the timeline: start of the current status run) kept by a DB trigger on every status change; setting `workflow.overdue_days` (default 3, 1–90, Admin › Workflow card). Overdue = Submitted/Reviewed/Verified/Approved/Returned, not archived, longer than the setting. `overdue` + `statusChangedAt` on every incident DTO, `overdue=true` list filter, `summary.overdue`. UI: red badge in list rows and the detail header, "Submitted since … (n d)" line (says "today" under a day), "Waiting time" filter
- **Comments**: `incident_comments` table, append-only by trigger (`birds_forbid_modification`); `POST /incidents/:id/comments`; allowed for roles that file (`create`) or review (workflow table), not on drafts or archived records; notifies the creator and earlier commenters in scope (type `comment`); audited `COMMENT_INCIDENT`. UI card `IncidentComments.jsx`; read-only roles see a note
- **Single-incident print/PDF** (`PrintableIncident.jsx`, print-only): crest, CONFIDENTIAL // OPERATIONAL top and bottom, all fields, evidence with SHA-256, timeline, comments, signature lines, "printed by … (BST)". `POST /incidents/:id/print` audits `PRINT_INCIDENT` first; no audit, no print. Print stylesheet forces white paper
- **Dashboard "Waiting for you"** (`components/dashboard/WorkQueue.jsx`): Need my action / of those overdue / Returned to me / My drafts / Overdue in my area, each a link to the filtered list; tiles by role
- Bug found by the browser run: `timeAgo(iso, t)` needs `t` (CLAUDE.md §8 listed `timeAgo(iso)`; corrected)
- Verified: `workflow-extras.test.ts` (7) → **128/128**; headless Chrome 21 checks (sector_off, batt_op, auditor, hq_admin) incl. a generated A4 PDF that was inspected; section 1 browser suite re-run clean
- Live: the new migration must reach Supabase (`npm run db:deploy` or the planned reset). Grants: `incident_comments` is a new table, so **re-run `supabase-demo-access.sql`** after migrating

**Added later — "section 3" (user request).**
- **Header search** (`components/layout/GlobalSearch.jsx`): suggestions from the list API, Enter opens the highlighted result, a full or 4-digit reference (current year), or `/incidents?q=`; "/" focuses it; shown from 1024 px (Incidents page search below that). The Incidents page now follows `?q=` changes while mounted. Header decluttered: clock and "HQ ONLINE" badge only from 1536 px (the header overflowed at 1024/1280 with the sidebar open)
- **Map**: date range; display modes Points / Clusters (`leaflet.markercluster` 1.5.3, clusters coloured by worst severity) / Heatmap (`leaflet.heat` 0.2.0, severity-weighted). Plugins need a global `L`: `lib/leafletGlobal.js` (sets `window.L`) is imported first by `lib/leafletPlugins.js`; both only in the MapView chunk. Popup links navigate in-app. Legend moved below the filters
- **Related incidents**: `GET /incidents/:id/related` (same BOP or within 5 km, ±30 days, max 8; haversine; visibility rules) + card on the detail page with the reason ("Same BOP · 1 day apart")
- **Duplicate warning**: `GET /incidents/similar` (±1 day and within 1 km, or same BOP + category; max 5; `excludeId`; `create` permission) + amber panel in the form from step 2 (debounced; advisory, never blocks; links in the same tab so the unsaved-changes guard applies — a second tab could trip refresh-token reuse detection)
- **Dashboard period**: All / 7 / 30 / 90 days / This year / Custom for summary, category, sector, recent list and trend (daily ≤31 days, weekly ≤183, monthly beyond); the work queue stays current (fetches its own overdue count)
- **Profile** (`/profile`, user menu): `GET /auth/profile` (account, own unrevoked sessions with "This device", last 15 own sign-in/security audit events) and `POST /auth/sessions/revoke-others` (audited `SESSIONS_REVOKED`)
- Tests: `nearby-profile.test.ts` (6) → **134/134**; headless Chrome section 3 suite (25 checks) plus sections 1 and 2 re-run clean; 390 px without overflow; `npm audit` 0
- Test-script lessons: scripts must wait for responses after tab clicks (count requests by `pageSize`), and data-dependent checks must tolerate earlier runs (lists are capped). The dev DB now holds test incidents up to BIRDS-2026-1078 — the planned reset clears them
- Live: no new migration this time; deploy + the pending reset from the previous block

**Added later — professional government UI redesign (user request: "government site, professional, no emojis; actions written as Review/Approve").**
- Audit by the ui-ux-designer agent on 21 screenshots (prioritised report), then implemented:
- **Design system** (`index.css`): `.btn-primary` (bgb-700), `.btn-secondary` (white, bordered), `.btn-danger-outline`, `.btn-sm`; strong focus ring; flat cards (`rounded-lg`, slate border, `shadow-xs`); always-visible scrollbars (the auto-hiding thumb hid the Incidents table's action column at 1440 px); tighter table cells. Badges -800 on -50 with -200 border (several failed WCAG contrast); severity badge has a colour dot
- **Text actions everywhere**: Incidents list (View / Edit / Review / Verify / Approve; reference number is the link), incident page (forward step primary, Return secondary, Reject/Discard red outline, evidence Verify/Download/Remove), form remove buttons, audit "Details", users table, category Edit/Deactivate (subcategory on/off moved from click-to-toggle chips into the Edit dialog with checkboxes)
- **Removed gimmicks**: pulsing/ping dots, NEW/LIVE tags, v2.4 badges, gradients, glow/blur blobs, hover lift/scale, dashboard hero banner, login marketing panel and feature chips, rainbow icon tiles (workflow, settings, permissions, category list), per-action audit chip colours (now neutral, red only for security alerts). Hard-coded `CATEGORY_META` (category names in code) deleted
- **Pages**: login rewritten (crest, system name, plain form, Show/Hide text toggle, "Forgot password?" inline hint, authorised-use notice); header = one page title + search + clock (≥1536 px) + language + bell + plain user menu; sidebar flat active item, footer "Border Guard Bangladesh · Version 2.4"; dashboard toolbar + neutral `StatCard` (one style, red only for alerts); analytics/reports toolbars and neutral KPIs; form stepper, severity radio group, Submit only on the last step; workflow tab = numbered stages + rules table; admin underline tabs; permissions matrix checkboxes; switches show On/Off; profile sign-in events table; map list scrolls in its card; toasts at the bottom on phones
- **Labels**: page titles and headings reworded (no "Command"/"Tactical"/"Intelligence"); 184 EN labels to sentence case automatically, 63 reworded in both languages, audit action names from ALL CAPS to sentence case. Helper scripts in the session scratchpad (`set_i18n.py` set/delete with nested keys)
- `common.view`-style labels reused; new keys: login.*, nav.org/version/crestAlt, common.on/off, audit.details, wf.stageN/thTransition/thRule, cat.usedBy/subcategoriesActive, profile.th*, form.steps, detail.verify, an.range.label
- CLAUDE.md §9 "Aesthetics / UX" and rule 11 rewritten as the standing design rules; memory note saved
- Verified: build, `i18n:check` (988 keys), all three browser suites (sections 1–3) pass after updating label expectations, no horizontal overflow on 11 pages × 390/768 px × EN/BN; before/after screenshots in the scratchpad (`ui-before/`, `ui-r4/`). Server untouched (134/134 from before)

**Added later — login page layout (user request, two iterations).** Whole page is the dark-green banner: organisation side on the left (crest, Border Guard Bangladesh, "Headquarters, Pilkhana, Dhaka", system name, one-line purpose `login.about`, authorised-use notice, copyright) and the sign-in form as a white card on the right; language switch top-right. Stacked on phones/tablets with the notice under the card. New keys `login.hq`, `login.about` (EN + BN). Checked at 1440/1024/390 px and in Bangla; section 1 browser suite passes.

**Added later — messaging, voice messages, audio calls and call log (user request; DOUBT-013).** Owner's choices: anyone can contact anyone; 1:1 and group chats, 1:1 calls; messages are permanent; free hosted TURN for the demo, BGB's own coturn in production.
- **Database** (migration `20261009135617_messaging_and_calls`): `conversations` (direct `direct_key` unique per pair / group with title), `conversation_members` (`last_read_id`, `left_at`), `messages` (text / voice / system; append-only triggers), `calls` (ringing/answered/ended/declined/missed/cancelled/failed, `caller <> callee`); CHECK constraints; page id `messages` granted to every role
- **Realtime channel** `WS /api/v1/ws` (`src/realtime/hub.ts`): first frame authenticates with the access token (4001 otherwise), Origin check (403), session re-checked every 60 s, ping 30 s. `src/realtime/bus.ts`: PostgreSQL LISTEN/NOTIFY (`birds_events`, ids only), so it works across PM2 processes. `authenticateToken()` split out of the auth middleware for reuse
- **Messaging module**: directory, conversations, history paging, text, voice (WebM/Ogg/MP4/MP3 by magic bytes, 10 MB, 0.3–300 s, encrypted with the evidence key + SHA-256, integrity-checked on playback), read markers, group add/leave; audited `MESSAGE_GROUP_CREATE/ADD/LEAVE`, `UPLOAD_REJECTED`
- **Calls module**: signalling over the channel (`call.invite/accept/decline/cancel/end/signal`), busy detection, ring timeout `CALL_RING_SECONDS` (30), disconnect ends the call, missed-call notification (type `call`), `CALL` audit entry; `GET /calls` (own), `/calls/all` (admin or audit), `/calls/ice` (`STUN_URLS`, `TURN_URLS/USERNAME/CREDENTIAL`); stale records closed on start-up
- **Frontend**: `api/realtime.js` (one socket per tab, re-auth after token refresh, backoff reconnect, one refresh attempt on 4001), `api/messaging.js`, `api/calls.js`; `context/CommsContext.jsx` (mounted in Layout: unread count, WebRTC call state machine, Web Audio ring tones in `utils/tones.js`, `CallPanel` fixed bottom-right so calls follow the user across pages); `pages/Messages.jsx` (list + thread, two panes on desktop, one on phones; new message / new group dialogs, members dialog, load earlier, day separators, live updates, read marking only while the tab is visible, catch-up after reconnect); `components/messaging/Composer.jsx` (Enter sends; record → stop → listen → send/discard); `pages/CallLog.jsx` (My calls; All calls for admin/audit roles; Call back). Sidebar "Messages" with unread badge + "Call log"; header titles; permissions matrix row; missed-call notifications open the call log; Vite proxy `ws: true`
- 114 new i18n keys (EN + BN; 1104 total). OpenAPI: Messaging and Calls tags with the socket protocol, 15 paths. README sections Messaging / Calls / Realtime channel; CLAUDE.md §2, §5, §10, §19.10; `.env.example` and `render.yaml` (TURN vars, `sync: false`)
- Verified: server **148/148** (`messaging.test.ts` 8, `realtime-calls.test.ts` 6; fixed an order-dependent unread assertion). Headless Chrome with fake microphones, two users + auditor + admin, 29 checks, twice clean: live delivery and badge, voice record/send/play, group, a real WebRTC call (connects, timer, mute, hang up), declined, missed (with notification), call log, auditor's all-calls tab, audit trail, permissions row, 390 px layout, Bangla. Bug found and fixed by the run: the list's unread count could go stale when the read event fired before the socket connected (list now refreshes after marking read and after every reconnect; the open thread catches up too)

### Next session — TODO (messaging)
1. Live deploy: run the new migration on Supabase (`npm run db:deploy` as `postgres`, or the planned reset), then re-run `supabase-demo-access.sql` (four new tables); set `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL` on Render from a free TURN provider
2. The Render free plan sleeps after 15 min idle: a sleeping service can't ring anyone, so test calls with both users signed in
3. Ask BGB the DOUBT-013 questions (records rules for messages; allowed STUN/TURN servers)


---
## Session — 2026-10-11 10:58 (BST)

### What was done
- Checked why the messaging release isn't visible on Render. The code is deployed: `origin/master` = local `8ecbc2a`, the live bundle contains the Messages/Call log code, and `/api/v1/messaging/*` returns 401/403, not 404. Profile, overdue and the relative seed dates work on live.
- Root cause: the Supabase database **doesn't have migration `20261009135617_messaging_and_calls`**. That migration grants the `messages` page to every role; live `auditor` permissions don't include `messages`, so the sidebar hides Messages and Call log, and the API returns 403. Test sign-in as `auditor` on live (LOGIN/LOGOUT audit entries).

- Owner then migrated Supabase and tested a live call; it dropped. Live call #1: `ended`, reason `connection lost`, after 29 s, so a participant's realtime socket closed and the server ended the call at once, though the WebRTC audio is browser to browser. A 150 s probe socket on live stayed open (Render's proxy answers the server's pings itself), so stable sockets don't drop; blips do (network, sleep, phone lock, a session revoked by signing in elsewhere). Live `/calls/ice` has no TURN (`relay: false`).
- **Fix: calls survive a reconnect.** Server: on socket close a call waits `CALL_RECONNECT_SECONDS` (new env, default 30, 1–120) instead of ending; client message `call.resume {callId}` reattaches it (`call.resumed`; `call.ended` if it's already over); cross-process via a new bus event `call.resumed`, and a log line when a participant drops. Browser (`CommsContext.jsx`): sends `call.resume` whenever the channel comes back during a call; a drop before the invite was confirmed ends the attempt with the offline toast; on `pagehide` it sends end/cancel/decline so closing a tab still ends the call at once; on a failed WebRTC connection the caller restarts ICE once (callee waits 15 s for it) before giving up.
- Docs: README Calls, OpenAPI Calls tag, `.env.example`. Tests: the disconnect test now covers resume, end after the wait, and resume after the end; **148/148**. Headless Chrome, two users, real WebRTC call on a local build: callee's socket closed twice mid-call → reconnects, call and timer continue, remote audio track live, hang-up after resume ends both, tab close ends the other side in ~50 ms (script `call-drop.mjs` in this session's scratchpad).

- **Messenger-style messaging (owner request).** `Messages.jsx`: list with large tinted avatars, pill search, "preview · time" line, bold + count badge when unread; thread on white with rounded bubbles (own green on the right, others grey on the left), runs of one sender within 5 min share joined corners and one small avatar at the end of the run, sender name above a run in groups, time separator on a new day or after a 15 min gap, full time as tooltip + screen-reader text. `Avatar.jsx`: muted tint per name (green/sky/indigo/teal/slate/violet; never red/amber/orange). `VoiceMessage.jsx`: own player (play/pause, progress bar with seek, time) instead of the browser control; audio still fetched on first play.
- **Voice in one step**: microphone starts recording, Send stops and sends at once, bin icon cancels; no review step (owner's choice). The 5-minute limit sends what was recorded. Composer is a pill text box that grows with the text, between round microphone and send buttons. CLAUDE.md §9 now allows icon-only buttons in the chat bar.
- i18n: + `msg.cancelRecording`, `msg.pauseVoice`, `msg.sendingVoice`; `msg.recordHint` reworded; removed unused `msg.stop`, `msg.reviewRecording`, `msg.discard` (1104 keys, check passes).
- **Louder call tones** (`utils/tones.js`): incoming ring is now a trilling double ring (square wave alternating 1046/1318 Hz at 16 Hz, two 0.45 s bursts every 2.6 s) through a compressor with make-up gain. Measured with an OfflineAudioContext render: RMS 0.051 → 0.390 (about +18 dB), peak 0.87 (no clipping). Ringback 0.033 → 0.197 RMS.
- Verified on a local build: messaging UI suite (`msg-ui.mjs`, 9 checks: bubble colour, joined corners, left/right, one-step voice send, live arrival and playback with progress, cancel sends nothing, 390 px without overflow) and the call-drop suite again; screenshots in this session's scratchpad `shots/`.
- TURN for the owner: Metered (metered.ca) free plan: sign up → TURN server → create a credential → copy the iceServers it shows into `TURN_URLS` (comma-separated turn:/turns: URLs), `TURN_USERNAME`, `TURN_CREDENTIAL`. Free allowance figures differ between Metered's pages, so check the dashboard.

- Owner committed and pushed that work as `ed444fd` ("fixed calling"); TURN credentials from Metered go in Render env (`Metadata.txt`, now git-ignored).
- **Group chat admin controls (owner request; DOUBT-014).** Migrations `20261010234748_group_admin_controls` (member `role`, `removed_by`; conversation photo columns; `conversation_join_requests`; `notifications.conversation_id`) and `20261010235000_group_admin_controls_integrity` (CHECKs, one open request per person per group, decided requests immutable by trigger, existing groups get an admin). Server (`messaging.service.ts`): creator is admin; admin adds directly, a member's additions become requests (admins notified, type `group`); approve/reject (requester notified); remove member; make/unmake admin (always one left; last admin leaving hands over to the longest-standing member); rename; group photo (JPEG/PNG/WebP by bytes, 2 MB, encrypted, SHA-256, integrity-checked on read; old file deleted); each change is a system message + audit entry (`MESSAGE_GROUP_REQUEST/APPROVE/REJECT/REMOVE/ROLE/RENAME/COVER`). `POST /members` now returns `{ conversation, added, requested }`.
- Frontend: `components/messaging/GroupDialog.jsx` replaces the members dialog ("Group settings": photo, rename, pending requests with Approve/Reject, members with Admin label, Make admin / Remove as admin / Remove, Add people or Request to add, Leave). Photo is cropped to a 512 px JPEG square in the browser (drops EXIF/GPS). `Avatar` shows group photos (`photoUrl`, fetched with the token, one object URL per version). Pending count on the Group settings button for admins. Group notifications open the conversation. Bug fixed on the way: system messages (rename, photo, members) now appear live in the open thread (catch-up when the conversation's latest message is newer than the one shown). `fetchBlob` now passes `background`. 35 i18n keys (1139 total).
- Tests: `group-admin.test.ts` (6) → server **154/154**; OpenAPI documents the 8 new routes. Browser suite `group-ui.mjs` (13 checks, three users: member request → badge → approve, rename, photo, make admin, remove, removed member loses the group, promoted member gets controls, system messages live, 390 px layout); phone layout fixed (actions wrap under the name).

- Supabase migration: the owner's `db:deploy` dropped (P1017) after the integrity migration's SQL had run but before Prisma recorded it; the retry then hung on Prisma's advisory lock, held by the dead session. Checked every object existed (4 CHECKs, partial unique index, guard function and trigger; no live groups, so no admins to backfill), ended the stale session (`pg_terminate_backend`, lock 72707369 only) and ran `prisma migrate resolve --applied 20261010235000_group_admin_controls_integrity`. `migrate status`: up to date. The Supabase session pooler resets connections now and then (ECONNRESET seen twice): just retry.

- **Installable app (PWA; owner request: many users on phones).** `public/manifest.webmanifest` (BIRDS, standalone, theme #164716, shortcuts New incident / Incidents / Messages), icons from the crest (`public/icons/`: 192, 512, maskable 512 on white with the crest in the safe zone, 180 apple-touch), `public/sw.js` (network-first page loads with the last index.html as offline fallback, cache-first `/assets/*` capped at 120 entries, stale-while-revalidate for other site files; never `/api`, non-GET or other origins), `utils/pwa.js` (registers in production builds only; keeps `beforeinstallprompt`), "Install app" in the user menu (browser prompt; iPhone/iPad get Share → Add to Home Screen steps), `index.html` manifest + Apple meta tags, safe-area padding for the app frame, call panel and toasts, offline notice in the app and on the sign-in page (`hooks/useOnline.js`). 8 i18n keys (`pwa.*`, 1147 total).
- Verified (headless Chrome, `pwa-check.mjs` + `pwa-install.mjs`): manifest parsed with no errors, worker controls the page, Chrome reports no installability errors (normal profile; Playwright's default contexts count as incognito), after signing in and opening pages nothing under /api is cached, Install app triggers the prompt, the app opens offline with the notice. Messaging suite re-run clean. Test lesson: an attached CDP session overrides `context.setOffline` (navigator.onLine stayed true) — detach it first.
- Not done (possible next): web push, so calls and messages reach a phone while the app is closed (needs VAPID keys and a push subscription table); offline drafting of incidents.

- **Push notifications for calls and messages (owner request; DOUBT-015).** Server: `web-push` 3.6.7; env `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` (`npm run keys:vapid`; off without keys); migration `20261011004447_push_subscriptions` (bound to `refresh_tokens.id`, cascade); module `modules/push` (config, status, subscribe with `resume` that never takes over another user's device, unsubscribe; audited `PUSH_SUBSCRIBE` / `PUSH_UNSUBSCRIBE`; `pushToUsers` sends only to live sessions, deletes 404/410 devices, never throws). Pushes are sent once at the source: messages (`afterMessage`), call invite (urgency high, TTL = ring time), never-answered call ends (`call-ended` missed). Payloads carry names only. Hub `onClientReady`: a socket that connects while its user's call rings gets `call.incoming` (opening BIRDS from the call notification shows the call).
- Frontend: `api/push.js`, `utils/push.js` (state, enable/disable, resume after sign-in, close notifications by tag, language to the worker), `sw.js` push + notificationclick (texts EN/BN in the worker, language cached in `birds-prefs` which the activate clean-up now keeps; messages collapse per conversation with a count; call notification vibrates, requires interaction, closes itself after the ring time; missed call replaces it; nothing while a BIRDS window is in front; a tap asks the open app to change page instead of reloading, so the in-memory sign-in survives). `PushSettings.jsx`: profile card "Notifications on this device" (states On / Off / Blocked / Install the app first / Not available / Not supported) and a one-time prompt on Messages. The app closes a conversation's notifications when it is opened and a call's when the app rings. 26 i18n keys (1170).
- Tests: `push.test.ts` (4: registration + validation + audit + no takeover; message push to others only, no text, stops after sign-out; dead device deleted; call push, replay on connect, missed-call push) with the sender replaced; `vitest.config.ts` generates a throwaway VAPID pair per run (no key in the repo) → **158/158**. Real end to end in Chrome through FCM (`push-e2e.mjs`, 8 checks: turn on, message notification with BIRDS closed, no text, "2 new messages", incoming call, same notification becomes "Missed call", Bangla) and `push-tap.mjs` (tap navigates without reload; opening BIRDS while a call rings shows Answer). Call and messaging suites re-run clean. Note: the first subscription in a fresh Chrome profile took ~28 s (FCM registration); the button now says "Turning on…".
- Deploy needs: `npm run keys:vapid` → `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` on Render, and `npm run db:deploy` on Supabase (one new migration).


---
## Session — 2026-10-11 (continued) — owner's three issues after deploying

### What was done
- Checked live first: push enabled, TURN configured (`relay: true`), new code deployed; calls #9 and #10 answered for 40-55 s (connected, so signalling and ICE work); **no device on live had push turned on** (no `push_subscriptions` rows, no `PUSH_SUBSCRIBE` audit). That explains "no notification outside the app" and "nothing while BIRDS is in the background" (phones suspend background tabs and their sound; only push reaches them).
- **1. Connected but no sound.** Most likely cause: mobile browsers (iPhone above all) only play audio that a tap started; the remote stream was attached in `ontrack` and `play()` failures were swallowed. `CommsContext.jsx`: the Call/Answer tap now starts the `<audio>` element (playsinline) on an empty MediaStream before anything is awaited, and the remote track is added to that same stream; if the browser still blocks it, the panel shows **Turn on sound**. While active, `getStats()` every 2 s checks audio bytes in/out; after ~6 s without, the panel says "No sound is arriving from X" / "Your microphone is not sending sound". Verified under Chrome's `document-user-activation-required` policy (`call-audio.mjs`): both sides play, bytes flow both ways, no warnings. Not reproducible in Chrome: iOS Safari's own rule; the owner should retest on the same phones.
- **2. Messenger-like call outside the app.** Call notification now rings again every 4 s (renotify: sound + vibration) for the ring time, requires interaction, and has **Decline** / **Answer** (Android/desktop). Decline works without signing in: `POST /calls/:id/decline { token }`, token in the push = HMAC(callId:callee:exp) keyed from the VAPID private key; refuses tampered/expired/other-call tokens. Answer opens `/messages?answer=<id>`; the app answers when the replayed call arrives (also when BIRDS was open in the background). A full-screen lock-screen call UI isn't possible for a web app (needs a native app); stated in DOUBT-015.
- **3.** The "Turn on notifications" suggestion now shows on every page (Layout), not only Messages.
- 3 i18n keys (1173). OpenAPI: decline route, call payload. Server **159/159** (`push.test.ts` +1: decline with token only). Real FCM test `push-ring.mjs`: Decline/Answer actions present, notification re-shown (timestamp moves), then "Missed call". Call-drop suite clean; messaging suite 3/4 runs clean (one timing flake in the test's own check right after a voice send).

- **GIS map framed on Bangladesh (owner request).** `lib/leaflet.js` `BD_VIEW` (Bangladesh + ~50 km: 20.15-27.1 N, 87.55-93.2 E) and `BD_LIMIT` (19.7-27.6 N, 87.0-93.75 E); `components/map/BangladeshFrame.jsx`: can't zoom out past the whole of Bangladesh for the map's size (recomputed on resize), `maxBounds` with viscosity 1, and a light mask with a thin edge over everything outside the frame (tiles are square and reach past it). Tile layers load only tiles touching the frame (`bounds`, `noWrap`). GIS page: opens fitted to Bangladesh with quarter-step zoom, map 440 px / 620 px from `sm`. Incident page's small map uses the same frame. Verified (`map-frame.mjs`, desktop 1440 and phone 390): zoom-out stops at Bangladesh, dragging to India/Bay of Bengal stays in the frame, no tile requested entirely outside it.

- **Keep the free Render service awake (owner wants to stay on the free plan).** `src/keepAwake.ts`: with `KEEP_AWAKE_MINUTES` (0-14, default 0 = off) the server requests `APP_BASE_URL/api/v1/health` that often; through Render's front door that counts as traffic, so the 15-minute idle stop never comes. `render.yaml` sets 10 (Blueprint value; set it in the dashboard too). Verified locally with 1 minute: the request arrives (200). Limits: one always-on free service uses ~744 of 750 free hours a month (only one free service in the workspace); if the service is ever stopped (deploy failure, Render maintenance) the self-ping can't wake it, so an outside monitor (UptimeRobot free, 5-minute check of /api/v1/health) is the backup and also the uptime record for spec #40. The health check also queries the database, which keeps the Supabase free project from pausing for inactivity.

### Decisions & rationale
- Pushes carry names only, never message text, and only reach devices whose session is live (DOUBT-015); a different user on the same browser doesn't inherit them.
- A web app can't show a full-screen call on a locked phone; the call notification re-rings every 4 s with Answer/Decline instead. Decline uses a signed one-call token because the service worker has no sign-in.
- Messages UI follows the owner's Messenger request (CLAUDE.md §9 exception for the chat bar).
- Stay on Render's free plan, kept awake by a self-ping (`KEEP_AWAKE_MINUTES=10`).

### State at the end of the session
- Live demo: https://birds-demo.onrender.com; all migrations on Supabase (latest `20261011004447_push_subscriptions`); TURN (Metered) and VAPID keys set on Render. Everything up to the GIS map frame is pushed; the keep-awake change is committed locally only if the owner did so after this note.
- Server tests 159/159; i18n 1173 keys (EN = BN); browser suites in this session's scratchpad (calls, messaging, groups, PWA, push, map).
- Requirements: 38 DONE, 8 IN PROGRESS, 12 NOT STARTED (9 of those deferred for the demo by the owner, 1 commercial).

### Blockers / waiting on
- Owner: push `keepAwake` work and set `KEEP_AWAKE_MINUTES=10` on Render (+ optional UptimeRobot on `/api/v1/health`)
- Owner: on each phone, turn notifications on (iPhone: install first, iOS 16.4+) and retest calls; report the phone/browser if "No sound is arriving" appears
- BGB: DOUBT-001 (concurrent users), DOUBT-009 (antivirus); confirm DOUBT-013/014/015 assumptions
- BGB: a sample of their official report/memo format (letterhead, classification marking, reference number style, signature blocks) for the print redesign (DOUBT-016)

### Next session — TODO (BGB documentation set, CLAUDE.md §27)
1. Demo script: the 58 TEC specs in order, each with the screen, demo account and steps that prove it
2. Security assessment (§27.7): OWASP Top 10 mitigation matrix, `npm audit`, OWASP ZAP scan of the live demo + remediation, password/session/encryption policies
3. UAT test cases (§29) covering all 58 specs
4. User manual (§27.2) and system administration manual (§27.1), with screenshots
5. Installation & deployment guide for BGB servers (§27.5), database documentation with ERD + table dictionary (§27.4), backup & recovery procedure (§27.6, production plan)
6. Training plan and slides (§28)
7. **Official report print format (owner, 2026-10-11: the current printouts don't look official).** Redesign the printed/PDF reports (Reports page and the single-incident print) to BGB's official format: letterhead (crest, "Border Guard Bangladesh", headquarters/unit), security classification top and bottom, memo/reference number and date line, subject line, numbered paragraphs or tables in a formal layout, page numbers ("Page x of y"), prepared/checked/approved signature blocks with name, rank, appointment and unit, distribution list, and a Bangla version. Ask BGB for a sample official report or memo first (DOUBT-016); without one, follow the Bangladesh government memo layout (Secretariat Instructions)
8. Before the TEC session: reset + re-seed the live database (clears test chats/calls), sign in once per demo account, rehearse on the real phones

---
## Session — 2026-10-11 (continued) — professional report format

### What was done
- **Reports page shown and printed as a formal BGB document** (owner: "the system generates the report but not professional"). New `components/reports/OfficialReport.jsx`, an A4 sheet on screen that prints/saves as PDF exactly as shown: crest and letterhead (Government of the People's Republic of Bangladesh / Border Guard Bangladesh / Headquarters, Pilkhana, Dhaka-1205 / BIRDS), CONFIDENTIAL // OPERATIONAL at the top and bottom of every printed page (outer table thead/tfoot repeat per page), reference number and date line, subject, numbered paragraphs (1 scope and parameters table, then the template's sections, then a certificate), Prepared by (filled from the user) / Checked by / Approved by signature blocks, distribution, "printed by" line, "Page x of y" through `@page` margin boxes (Chrome/Edge). Serif type (`.official-doc` in `index.css`), black on white, plain-text severity/status, totals rows, Ser columns.
- Sections per template: operational = summary, category, sector, register; statistical = summary, severity, category with subcategories, sector; high-threat = summary, sector, register; sector-audit = summary, sector (with severity columns and risk score), category, register.
- **Server**: `POST /api/v1/reports/print` (permission `reports`, same query as `/reports/operational`) issues `BGB/BIRDS/RPT/<year>/NNNN` from a per-year counter in `system_config` (`report.next_serial.<year>`, same pattern as incident IDs, no migration) and writes `PRINT_REPORT` to the audit trail with type, reference, count and filters. Print button: reference first, then `window.print()`; no audit entry, no print. OpenAPI documented; `reports.test.ts` +2 → server **161/161**, `tsc` clean.
- **Printing fix for every page**: the app frame (`Layout.jsx`) was fixed to the screen height with overflow hidden, so printouts were cut to one page; it now flows across pages in print.
- Reports toolbar: the icon-only reset button is now a named "Reset" button; label classes match the design system.
- i18n: `rep.doc.*` (EN/BN), `rep.resetBtn`, audit label `PRINT_REPORT`; 18 unused `rep.*` keys removed (1215 keys, check passes).
- Verified with headless Chrome on a local build (`report-check.mjs` in this session's scratchpad): 7-page A4 PDF of the operational report with header/footer and page numbers on every page, reference issued (0001, 0002, ...), statistical and sector-audit templates, Bangla, phone 390 px with no horizontal overflow; single-incident print still renders.

### Decisions & rationale
- Layout follows the Bangladesh government memo pattern (DOUBT-016 option 2, now ASSUMED) because no BGB sample was available; wording lives in i18n so it can be changed to BGB's sample without code changes to the layout logic.
- Reference numbers are issued only when printing (not when viewing) so each paper copy is traceable to one audit entry.

### Blockers / waiting on
- BGB: sample official report/memo to confirm letterhead, classification wording, reference style, signature and distribution blocks (DOUBT-016)

### Next session — TODO
1. Apply the same official layout to the single-incident print (`PrintableIncident.jsx`)
2. Deploy: no migration needed; push and let Render rebuild
3. Then continue the documentation set (demo script, security assessment, UAT cases)

---
## Session — 2026-10-11 (continued) — incident annex with evidence; overview on screen, preview for printing

### What was done
- **Owner: "include every incident in detail, each with its evidence; images previewed, videos with a thumbnail".** New option on Reports, "Include full details of each incident", adds **Annex A** to the printed report: one page (or more) per incident (`components/reports/IncidentAnnex.jsx`) with "Annex A to <ref> dated <date>", particulars table, narrative (a-d), evidence figures numbered Fig. A-n.i (photographs and images reproduced at print size; a video shows a still frame with a play mark, "still frame at m:ss / duration", resolution, and a note that the recording is kept in BIRDS; documents listed with a short box; files missing from storage say so), caption with type, size, capture time/camera/GPS (EXIF), upload time, evidence no. and full SHA-256; record history and comments. The register gets an "Annex" column (A-1, A-2, ...). Max 100 incidents (message when there are more).
- Previews: `utils/evidencePreview.js` (images reduced to 1600 px JPEG; video frame at 1 s, skipping near-blank frames by luminance spread, then 25/50/75 %; 20 s timeout, "still frame not available in this browser" for codecs it can't decode) and `hooks/useEvidencePreviews.js` (one file at a time, token-authenticated inline fetch, so the server records VIEW_EVIDENCE; object URLs revoked).
- **Owner: "on screen show the system report overview; when printing, print the preview".** The Reports page is again an in-app overview (`components/reports/ReportOverview.jsx`: stat cards, category and sector tables, incident list with badges and links). **Print / PDF** opens `components/reports/PrintPreview.jsx`, a full-screen preview of the formal document (portal on <body>; Close / Print; Escape closes; progress line while the annex and evidence previews load; Print disabled until ready). Print issues the reference + audit entry, then prints exactly the preview; print CSS hides the app behind it (`body:has(> .print-preview)`), so no blank first page. The annex is fetched only while the preview is open. Ctrl+P on the overview prints only a line pointing to Print / PDF.
- Server: `GET /api/v1/reports/details` (permission `reports`; same filters, scope and order as the register; `incidentDetailsFor()` in incidents.service reuses the incident-page DTO; `{ incidents, total, limit: 100, truncated }`); `POST /reports/print?details=1` notes "with full incident details" in the PRINT_REPORT audit entry. OpenAPI documented; tests +3 → **164/164**, `tsc` clean.
- Fixes: report document uses `table-fixed` (on phones the sheet no longer grows past the screen); register/sector tables drop their screen min-width in print (right edge was cut).
- i18n: `rep.annex.*`, `rep.ov.*`, preview/option texts (1263 keys, check passes).
- Verified in Chrome (scripts in this session's scratchpad: `seed-evidence.mjs`, `seed-video.mjs`, `annex-check.mjs`, `preview-check.mjs`, `phone-annex.mjs`): test incidents BIRDS-2026-1094 (JPEG, PNG, MP4, PDF) and BIRDS-2026-1095 (H.264 MP4 recorded in Chrome) on the **local** database; 43-page PDF with 27 annex pages, photos and a correct video still frame; reference issued; no blank page; Bangla; 390 px without overflow; annex not requested until the preview opens.

### Decisions & rationale
- Video thumbnails are made in the browser from the decrypted file (no ffmpeg on the server, nothing extra stored); the PDF of a video can only carry a still frame, so the caption says where the recording is kept.
- Annex capped at 100 incidents to keep printouts and evidence loading manageable.

### Next session — TODO
1. Owner review of the overview + preview flow and Annex A; then commit and push (no migration)
2. Apply the formal layout to the single-incident print (`PrintableIncident.jsx`) — could reuse `IncidentAnnex`
3. Documentation set (demo script, security assessment, UAT cases)

---
## Session — 2026-10-11 (continued) — formal single-incident printout

### What was done
- **Owner: make the individual incident print/PDF professional.** "Print / PDF" on the incident page now opens the same print preview as Reports, showing the incident as a formal BGB document (`components/incidents/PrintableIncident.jsx`, rewritten): letterhead, classification on every page, document reference and date, subject "Incident report: <id> — <title>", the full record (particulars, narrative a-d, evidence figures Fig. 1..n with photos reproduced, video still frames, documents listed, SHA-256; record history; comments), a certificate ("true copy of incident record ... as held in BIRDS at ..."), signature blocks prefilled from the record (reporting officer = filer with unit and filing date; reviewed by / approved by = last Reviewed / Approved entries in the history), distribution, printed-by line, "Page x of y". Evidence previews load only while the preview is open.
- Shared pieces: `components/reports/OfficialDocument.jsx` (frame: letterhead, thead/tfoot classification, ref/date, subject; `Section`, `SignatureBlock`, `Signatures`, `Distribution`, table classes) now used by both the report and the incident printout; `IncidentRecord` exported from `IncidentAnnex.jsx` (used by Annex A and the incident printout); the A4 `@page` rule moved into `PrintPreview`.
- Server: `POST /incidents/:id/print` now returns `{ reference, printedAt }` (was 204) from the same per-year series as reports (`utils/printReference.ts`, used by both); the PRINT_INCIDENT audit entry names the reference. OpenAPI updated; `workflow-extras.test.ts` checks the reference → server **164/164**, `tsc` clean.
- i18n: `print.subject`, `print.fig`, `print.certify`, `print.signReviewer`; `print.signFiler` in sentence case; 7 unused `print.*` keys removed (1260 keys, check passes).
- Verified in Chrome (`incident-print.mjs`): BIRDS-2026-1094 → 3-page A4 PDF with the photo, image, video still frame and PDF entry, reference BGB/BIRDS/RPT/2026/0011; BIRDS-2026-1001 in Bangla with Reviewed by Lt. Col. Karim and Approved by Maj. Alam prefilled; report preview flow re-checked (no regression).

### Next session — TODO
1. Owner review of the report + incident printouts; then commit and push (no migration)
2. Documentation set (demo script, security assessment, UAT cases)

---
## Session — 2026-10-11 (late) — tender details filled; NEXT SESSION: START HERE

### Done
- Tender details in `tender-submission/build/tender.js` (Grace International; tender "Development of Centralized Access Control Integration System — B. BIRDS ... Phase II" — exact wording to confirm with the owner; e-GP tracking no. 1347267). Rebuilt 01–05 (.docx) and 06 deck with them: headers, footers, signature block (tenderer prefilled; signatory/date left blank to sign), technical proposal §2 now says company verification documents are submitted separately + a roles table; proposed values (RPO 15 min, RTO 4 h, 2 TB storage, 10-week plan, training days, support times, Sun–Thu 9–17 support) are now stated without brackets.
- API docs restyled (server/docs/api/docs-theme.css, docs-header.js, src/apiDocs.ts): BIRDS header, Swagger branding removed, BGB colours, collapsed groups, filter, schemas hidden. openapi test passes.
- Demo video 07 re-made with Indian male voice "Psi" (Kokoro, local); George version kept in tender-submission/build/video-out/. Root `.gitignore` ignores tender-submission/.

### Next session — TODO (in this order)
1. Re-make the video so the intro/closing cards show "Grace International · e-GP 1347267" (edit cards in tender-submission/build/video/video.mjs to use tender.js, run `bash tender-submission/build/video/make-video.sh <scratch dir with seed-video.mjs, seed-evidence.mjs, seed-messages.mjs>`; those seed scripts were in the session scratchpad — recreate them in build/video/ if missing). Stop port 4100 server afterwards.
2. Update tender-submission/README.md: placeholders filled; remaining owner checks (tender name wording, proposed commitment values, sign/seal/date).
3. Security self-assessment + test results (OWASP Top 10 table, npm audit both projects, 164 server tests) as 08 document; clarification letter to BGB (DOUBT-001/009/016).
4. Full server test run, then commit and push (print/report work, API docs restyle, .gitignore, living docs). No migration needed.
5. Optional: reset local dev DB (3 test incidents "Yaba consignment…"/"Night movement…" created by scripts).

---
## Session — 2026-10-11 (late, continued) — submission date set

### What was done
- Checked all tender documents (01–06) for placeholders: only the date and the signatory fields were blank; "[100/250/500]" in item 38 is BGB's own wording and stays.
- Submission date **18/10/2026** added as `DATE` in `tender-submission/build/tender.js` and used in the header date line and the signature-block date of 01 and 04; documents 01–05 regenerated (`node build.js`).

### Next session — TODO
- Unchanged from the previous block; still to fill by hand: authorised signatory name, designation, signature and seal (01 and 04). `tender-submission/README.md` steps 1 and 5 are out of date.
- Speaker notes for the whole presentation (06): new `tender-submission/build/speaker-notes.js` (script per slide; "Show:" live-demo hints with the demo account; "If asked:" answers), used by `deck.js` for all 53 slides (build fails if a slide has no note). Rebuild: `NODE_PATH=./node_modules PPTX_SKILL=<pptx skill dir> node deck.js` in `build/`. Slide content unchanged.
- API docs fixes (owner): (1) Swagger's validator badge disabled (`validatorUrl: 'none'` in `src/apiDocs.ts`; `null` is dropped by swagger-ui-express) — on the live site it showed a broken "Error" image and tried to send the spec URL to validator.swagger.io; (2) every tag now has a one-line description, and the long Messaging/Calls/Push texts moved to the introduction as "Realtime channel (messaging)", "Calls", "Push notifications" sections (tag descriptions aligned in a column via `docs-theme.css`, hidden on phones); (3) `messages` added to the page-permission list. openapi test 3/3, `tsc` clean. Live updates on the next push.

---
## Session — 2026-10-12 — GIS map: zoom in on a point, zoom buttons, back to the whole map

### What was done
- New `BGB/src/components/map/FocusZoom.jsx`: `focusOn(map, latlng)` flies to the point at zoom 13 (or keeps a closer zoom), placing it below the centre so its popup fits inside the map; `ZoomControls` shows zoom in / zoom out and a close (×) button only while the map is closer than the whole-Bangladesh view. × closes the popup and flies back to `BD_VIEW`. Column at the top right on tablet/desktop; row at the bottom right on phones (below the popup).
- `MapView.jsx`: clicking a point (Points mode) calls `focusOn`; Leaflet's always-on +/- removed (`zoomControl={false}`), `maxZoom={18}`; popups `autoPan={false}` (focusOn positions them). `MapLayers.jsx`: same for single markers in Clusters mode (cluster bubbles keep zooming to their bounds, and the buttons appear).
- `index.css`: no browser focus box on a map point after a mouse click (keyboard focus still shows).
- i18n: `map.zoomIn`, `map.zoomOut`, `map.resetView` (EN + BN); `i18n:check` 1263 keys OK; build OK.
- Browser check (Chromium, 390 / 820 / 1440 px, hq_admin): no buttons on the overview; click a point → zoomed, popup shown, buttons shown; +/− work; × → whole map, buttons and popup gone; cluster click → buttons shown; no page errors.

### Next session — TODO
- Owner review of the map behaviour; commit and push (no migration).
- Then the earlier list (video cards, tender README, 08 security assessment, clarification letter).
- (same session) Owner: removed the hourglass icon from the red "Overdue · N d" badge (`components/ui/Badges.jsx` `OverdueBadge`), now text only like the status/severity badges. Build OK.
- (same session) Owner: "GIS initial view looks static". `FitToIncidents` (FocusZoom.jsx): after loading, the map flies from the whole country to the area of the shown incidents (padding 48, max zoom 11, 1.2 s; instant with reduced motion), and again when filters change the set (mode switches don't move it; nothing shown = whole country). Points mode markers are now count discs (`L.divIcon`, class `map-location` in index.css): incident count on the severity colour, 26–42 px by count, dark text (≥5:1 on all severity colours), busiest on top where they overlap, hover ring. Browser-checked at 390/1440 px: 21 locations, Critical filter → 6, click/zoom/close still pass, no errors.
- (same session) Owner: "Show all incidents" from a map point, and the map as it was left on return.
  - Points are now **one per BOP** (at the spot where most of its incidents were recorded; no-BOP incidents still by spot), so a point's count equals the BOP filter on the list. Data showed BOPs spread over several spots (BOP Teknaf: 5).
  - Popup: "Show all N incidents" (`map.showAll`) → `/incidents?archived=include&sector&battalion&bop` + the map's filters (archived included because the GIS endpoint includes archived records). Checked: Teknaf + Submitted = 29 on the marker and "Incidents (29)" on the list.
  - Map state in the URL (`category, severity, status, dateFrom, dateTo, mode, v=lat,lng,zoom, at=<open location>`), replace-navigation; on arrival a saved view is restored instead of fitting to the incidents (`FitToIncidents` `ready`/`keepFirst`), and the open popup is reopened (next tick, after markers mount — dev StrictMode remounts them).
  - "Back to the map" link (`map.backToMap`) on the incidents list and incident detail when opened from the map (router state `backTo`, kept across the list's own filter changes); browser Back works too. Guard so Leaflet's popupclose during teardown doesn't write to the next page's URL.
  - Browser-checked at 390/1440 px: Show all → list (29) → Back to the map → same URL, filter and open popup; map → incident → "Back to the map" label → browser Back → same; earlier zoom checks still pass; no errors. i18n 1265 keys; build OK.
- (same session) Owner: "look at the analysis part, maybe it needs improving".
  - Found: all 85 local incidents (and the 20 seed incidents, which are shifted to the seeding day) fall in one month, so the 1-year trend shows a single spike. **Data question for the owner** (spread seed incidents over the past 12–18 months; live demo would need a reseed).
  - Server: `GET /reports/by-location` (hotspot BOPs: total, high/critical, weighted score, latest date; `limit` 1–50) and `GET /reports/by-time` (24 hours + 7 weekdays Monday-first, each with high/critical); OpenAPI entries; 2 new tests in `reports.test.ts`; full suite **166/166**; CLAUDE.md §19.7 table updated.
  - Analytics page: trend as a line chart (incidents with light fill, high/critical red, previous year dashed); category doughnut → sorted horizontal bars split high/critical vs low/medium; new "When incidents happen" (busiest hour, night share, hour and weekday charts) and "Hotspots (BOPs)" table; overdue link on the Pending KPI; explanation lines for risk ratio/score. Every chart point/bar, hotspot and sector opens the incidents list with the page's period, units and the clicked value (archived included). Browser-checked at 1440/390: hotspot → 19, overdue → 15 (match); severity/trend lists are +1 because the list shows the user's own draft, which analytics excludes. 14 i18n keys (1279).
- (same session) Owner: "redesign the security & system page, fix styling" (Admin › Security & system).
  - Problems found: password/session/workflow cards had no padding (`bodyClassName="py-1"` turns off Card padding, so rows touched the card edges); ragged two-column masonry with large gaps; bold text, grey inner boxes and three different status-pill styles; system status at the very bottom.
  - New layout: **System status** overview first (API, database, e-mail delivery, sign-in method as words + icon; Check button; server time; "changes apply immediately and are audited"), then one column of sections with a sticky section menu on wide screens that marks the current section (IntersectionObserver). New `pages/admin/SettingsParts.jsx` (`SettingsSection` with description + footer, `StatGrid`, `StatusText`, `InfoRow`); archive, e-mail, directory and reference-number sections rebuilt on it. `AdminMail` now receives the shared `/admin/mail` result (`mail` prop) so the overview and the section use one request.
  - `ConfigRow`: consistent padding, fixed control column so fields and switches line up, unit after number fields (`set.unit.*`, units removed from the labels), range as "allowed 8–64"; switches stay beside the label on phones. Also used by Operations (checked, unchanged look).
  - i18n +15 keys (1294); build OK; browser-checked at 1440/390; save (overdue 3 → 4 → 3) and section menu jump/highlight work; no errors.
- (same session) Owner: "redesign the operations tab as well" (Admin › Operations, all DEMO).
  - Same layout as Security & system: demo notice, then a **Production operations** overview (one tile per area: name, spec number, what production adds, "Planned for production"), then one column of sections with the section menu. Sections built on `SettingsSection`/`InfoRow`/`StatGrid`; tables use the standard `th` style; HA node states are Sample text instead of coloured dots; load-test target user counts (100/250/500) shown as real values, results as Samples.
  - Section menu moved to `SettingsParts.jsx` (`SectionMenu`, used by both tabs); it now follows the scroll position (capture-phase scroll listener, since the page scrolls inside the layout) and marks the last section at the end of the page.
  - Demo markers (`components/ui/Demo.jsx`) brought within CLAUDE.md §9: DemoBadge 12 px semibold, sentence case ("Demo"), Sample 12 px, notice text 14 px; DemoButton follows the given button size.
  - i18n +17 keys (1311); build OK; browser-checked at 1440/390; Security & system save + menu still pass; no errors.

---
## Session — 2026-10-12 (continued) — full demonstration dataset

### What was done
- Owner: "remove all data from the database and add sufficient data to show all the features; previous year and recent; real images and videos; Bangla and English in the incident details; every incident with evidence."
- New `server/prisma/demo/` (see its README): `demo-data.ts` (users, real border units, deterministic incident generator), `demo-templates.ts` (30 bilingual scenarios with real police stations), `demo-seed.ts` (wipe + load), `make-docs.ts` (PDF seizure lists/reports via Chromium, Bangla shaped correctly), `media/` (37 photos + 7 videos from Wikimedia Commons, resized/trimmed, EXIF kept; 97 PDFs; `CREDITS.md`). npm scripts `db:demo` (needs `DEMO_RESET=yes`) and `db:demo:docs`; `tsconfig` includes `prisma/demo`.
- Local database wiped and loaded: 21 users, 130 incidents (Apr 2025 – Oct 2026, 5 sectors/10 battalions/32 BOPs), 926 timeline rows, 80 comments, 361 evidence files (86 MB, encrypted, SHA-256, EXIF), 279 notifications, 10 conversations / 50 messages (3 groups, admins, cover photo, pending join request), 16 calls, 2,472 audit entries in time order — hash chain intact. Queues: newest reports waiting at each step, ~13 overdue, 27 archived by the nightly job, Capt. Hasan has 2 returned + 2 drafts (+1 discarded).
- Wipe: append-only tables refuse TRUNCATE, so the owner disables user triggers inside one transaction, truncates all tables, re-enables (rolls back on error); local evidence folder or S3 prefixes cleared.
- Browser-checked: dashboard trend now has a 19-month shape; incidents list mixes English/Bangla titles with overdue badges; analytics comparisons; map covers the whole border; incident detail shows photos with camera EXIF, the night drone video, Bangla-named PDF; evidence integrity verify → intact (also on an archived 2025 record); messages and audit trail; operator view. Server tests 166/166.
- DOUBT-017 logged (fictional records at real places, CC media, source EXIF dates).

### Next session — TODO
- Owner decision: reseed the live demo (Render + Supabase). Run from a machine with the live env: `DATABASE_URL=<supabase> STORAGE_DRIVER=s3 S3_*=… EVIDENCE_ENCRYPTION_KEY=<live key> DEMO_RESET=yes npm run db:demo`, then restart the Render service. This wipes everything on the live demo.
- Commit and push today's work (map, analytics, admin redesigns, demo dataset — about 30 MB of media).

---
## Session — 2026-10-12 (continued) — presentation and documents rebuilt on the demo data

### What was done
- Live demo reseeded by the owner from this machine (`server/.env.live`, git-ignored; `DOTENV_CONFIG_PATH=.env.live DEMO_RESET=yes npm run db:demo`): 130 incidents, 361 evidence files in Supabase storage, audit chain intact. Evidence first failed on live with "failed its integrity check": the seed's `EVIDENCE_ENCRYPTION_KEY` differed from Render's; owner told to make the keys equal (set Render's key to the seed's, or reseed with Render's).
- Screenshots re-captured from a freshly reseeded local copy (identical to live; voice/call/print scenes would otherwise leave records on live): ~110 screens at 1440 × 900 (scale 1.5), phone 390, tablet 820, plus real printed PDFs (operational, statistical, high-threat, sector reports; report with full incident annex, 42 pages; single-incident printout) rendered to page images, the Excel export rendered from the real file, and a generated seizure list. Voice message recorded with Chromium's fake microphone; real two-browser audio call (ringing, incoming, connected, call log). Capture scripts (lib/a/b/c.cjs) in the session scratchpad.
- `tender-submission/build`: deck rebuilt as `deck.js` (layouts: screen, two, three, fit for portrait images, grid5; custom opening/solution/delivery slides) + `slides.js`/`slides-b.js` (content and speaker notes; `speaker-notes.js` retired to `shots-old/`). 119 slides: opening 5, solution 3, 11 sections (access, registration, workflow, tracking, GIS, analytics, reports & printing, audit, administration, platform, messaging & calls), value additions + BGB infrastructure, delivery (implementation items, work plan, training & documents, warranty), compliance matrix, thanks. Requirement badges per screen; notes per slide with "Show:" hints; figures in notes checked against the screenshots. Images as 1700 px JPEG (`shots-jpg/`) → 15 MB deck; `validate.py` passed; every slide rendered through PowerPoint and reviewed (fixed: form title typed into the header search, stretched portrait images, a wrong badge).
- Annex B (`extras.js`): +5 value additions (location markers with counts; zoom / show all / back to the map; hotspots and time patterns; click-through from every chart; system status overview) → 32. Annex A (`notes.js`): items 18, 19, 46 updated. Demo Guide (`demo.js`): loading the dataset, ready-made records to open, detailed GIS and analytics steps, report templates, system status. Technical Proposal: 166 tests, map/analytics capabilities. Documents 01–05 regenerated (`node build.js`); PDFs of all six exported to `PDF's/` (Word via a background job with SaveAs2: Word hung when exporting straight into the folder whose name has an apostrophe; the old .pptx copy there removed). `tender-submission/README.md` updated.

### Next session — TODO
1. Owner: set `EVIDENCE_ENCRYPTION_KEY` on Render equal to `.env.live` (or reseed with Render's key), redeploy; check evidence on live; then delete `server/.env.live`; reset the Supabase database password (exposed in chat) and update Render.
2. Re-make the demonstration video (07): it shows the old designs and sample data.
3. Commit and push (code + demo dataset + docs); tender-submission/ is git-ignored by design.
4. Remaining owner checks in the tender pack (signatory, seal, tender name wording, commitment values).

---
## Session — 2026-10-12 (continued) — messaging and call check

### What was done
- Live end-to-end check (two browsers, op_46bgb ↔ op_33bgb): text delivered live, voice message recorded, sent and played, call rang, was answered, connected (TURN relay present) and hung up. All working.
- Cause of the owner's failed test (audit trail, 14:20–14:21 BST): hq_admin called Lt. Col. Karim (sector_off) three times, all cancelled. sector_off had not signed in since the demo reseed, which removes every session and push subscription, so no device could ring.
- New: the caller is told when the callee cannot receive the call. `call.ringing` now carries `reach` ('online' | 'push' | 'offline') (`reachOf()` in `server/src/modules/calls/calls.realtime.ts`: connected now, or a session seen in the last 35 min → online; only a notification-enabled device → push; otherwise offline). `CallPanel.jsx` shows it while ringing (amber for offline). Texts `calls.reachOffline` / `calls.reachPush` in en + bn. Test added in `test/realtime-calls.test.ts`; full suite 167/167; checked in the browser.

### Next session — TODO
1. Deploy to Render (owner). After any reseed, every demo device must sign in again and switch on "Notifications on this device".
2. Earlier items stand: delete `server/.env.live`, reset the Supabase password, re-make video 07, commit and push.

---
## Session — 2026-10-13 — call history in the chat

### What was done
- Tender pack questions (no file changes): keep the signatory block in 01 and 04; options for signing the soft copy (scanned signature + seal image, printed/scanned signature pages, or a DSC). Waiting for the owner's choice and the signatory details.
- **Calls in the chat**: every finished call (completed, missed, declined, cancelled, not connected/busy) is now also an entry in the direct conversation between the two people, opened if they had none. Migration `20261013120000_call_entries_in_chat`: `messages.call_id` (unique, FK → calls), kind `call` added to `messages_kind_check`, `messages_call_check` (kind = call ⇔ call_id set). Applied to the local dev database.
- Server: `recordInChat()` in `calls.service.ts`, called from `finalise()` (the one place every finished call passes through); the caller is the sender; read for the caller, and for the callee only when answered or declined (a missed call is unread). Pushed live as `message.new`. Never fails the call. `callSummary()` (exported) gives the plain body ("Missed call", "Call, 95 s"). Message DTO now carries `call { id, status, callerId, calleeId, durationSeconds, endReason }`. OpenAPI `Message` schema updated.
- Frontend (`pages/Messages.jsx`): `CallEntry` card on the caller's side: phone icon, label for this viewer (Outgoing / Incoming call · duration, Missed call in red, Call not answered, You declined the call, …), time, "Call back" button in direct chats. Conversation list preview shows the same label. 12 `msg.call.*` keys in en + bn (`i18n:check` OK); build OK.
- Demo dataset: `seedCalls()` runs first and its calls are merged into the pairs' direct chats in time order (pairs who only called get a chat of call entries); missed calls from the last day are unread. Checked on the test database (16 call entries, order and read markers correct).
- Tests: `realtime-calls.test.ts` checks the entries (completed + busy; declined + missed with unread 1). Server **167/167**, typecheck clean.

### Decisions & rationale
- Linked message row (not a copy of the call data): the call record stays the single source; the chat entry is append-only like every message.
- Calls made before this change are not back-filled (inserting them would put old entries after newer messages, since threads are ordered by id). Reloading the demo dataset gives the full history.

### Next session — TODO
1. Live: Render does NOT run migrations (build = npm ci + build, start = npm start). First `DOTENV_CONFIG_PATH=.env.live npx prisma migrate deploy` from `server/` (new code needs `messages.call_id`), then push/deploy, then `DOTENV_CONFIG_PATH=.env.live DEMO_RESET=yes npm run db:demo` so the live chats show the call history; locally `DEMO_RESET=yes npm run db:demo` if wanted.
2. Signature/seal for the tender soft copy once the owner sends them.
3. Earlier items stand: delete `server/.env.live`, reset the Supabase password, re-make video 07, commit and push.

---
## Session — 2026-10-13 (continued) — in-call controls, long-text overflow

### What was done
- **In-call controls** (`components/messaging/CallPanel.jsx`, `context/CommsContext.jsx`, new `utils/audioDevices.js`): Mute (existing), **Speaker / Earpiece** one-tap switch (shown where the browser lets a page choose the output and names both, i.e. some phones), **Hold / Resume** (stops the microphone and silences the other person), **Audio** settings (microphone list with live switch via `replaceTrack`, sound output list via `setSinkId`, Firefox "Choose sound output" via `selectAudioOutput`, volume slider; where the browser can't choose an output it says so), **Open chat** with the person, **Minimise** to a one-line bar (Show / Hang up), Hang up. Mute and hold are sent to the other side as `call.signal {state}` (server relays it unchanged; comment updated), so their panel says "X has muted their microphone" / "X has put the call on hold"; resent after a reconnect. **Connection quality** (good / weak / poor from round-trip time and packet loss in the existing stats loop). **Screen wake lock** during the call. Last microphone/output remembered per browser (localStorage, convenience only). "No sound" warnings suppressed while either side is muted or holding on purpose. 23 `calls.*` keys in en + bn (`i18n:check` OK).
- **Long unbroken text overflowing on phones**: `body { overflow-wrap: anywhere }` in `index.css` (breaks inside a word only when nothing else fits), tables keep `break-word` and scroll in their own box; explicit `break-words` classes that overrode it removed; chat bubble column gets `min-w-0`; print cells of user text (`IncidentAnnex`, `OfficialReport`) use `wrap-anywhere`.
- Verified in headless Chrome with fake microphones (two users, phone 390 px + desktop): long text wraps with no sideways scroll; call connects, "Good connection" shown; mute and hold reach the other side; hold mutes playback; device lists fill (3 inputs, 4 outputs); volume 0.4 applied; minimise/show; Open chat navigates; call entries appear in both chats after hang-up. Speaker/earpiece toggle not testable on a computer (needs a phone that names both outputs).

### Decisions & rationale
- Speaker/earpiece only where the browser exposes the routes: a web page cannot force the route on iPhone (no `setSinkId`) and on many Android browsers; there the panel shows the Audio settings note instead of a button that would do nothing.
- Global `overflow-wrap: anywhere` instead of per-field fixes, so every current and future user-text spot is covered; tables excluded so their columns don't squeeze words.

### Next session — TODO
1. Owner: test on real phones (Android Chrome, iPhone Safari) whether the Speaker/Earpiece button appears, and report the phone/browser if not.
2. Live deploy steps from the previous block (migrate live DB first, deploy, reload demo dataset).
3. Commit and push.

---
## Session — 2026-10-13 (continued) — incoming call screen

### What was done
- **Incoming call screen** (`CallPanel.jsx` `IncomingScreen`): when BIRDS is open, an incoming call takes the whole screen on a phone (large photo/initials, name, role · unit, round Decline / Message / Answer buttons with their names) and is a dialog over a dimmed page on a computer. Answer has focus; nothing scrolls behind it.
- **Decline with a message**: three ready replies (en + bn: can't talk / on duty / call again in 10 minutes); declines and sends the reply in the chat with the caller (`declineWithMessage` in `CommsContext.jsx`), toast on success or failure.
- While a call rings in: vibration on Android browsers (`navigator.vibrate`, repeated every 3 s, stopped on answer/decline), the tab title alternates with "Incoming call: {name}", the screen is kept awake (wake lock now covers ringing too).
- **Phone in-call view** is full screen (person in the middle, controls at the bottom, round Hang up); **Minimise** returns to the app with a one-line bar; Open chat minimises first. Computers keep the bottom-right card. Avatar gets a `2xl` size. 10 new `calls.*` keys in en + bn.
- Verified in headless Chrome (phone 390 px + computer): full-screen incoming on the phone, vibration pattern recorded and cancelled, reply sent and shown in the caller's chat after "Call declined", full-screen call with quality, minimise/show, phone ringing screen, computer incoming dialog, answer and hang up. Fixed: the Message button's icon was white on white.

### Decisions & rationale
- A web page cannot wake a locked phone or show over other apps; that remains the push notification's job. The full screen applies whenever BIRDS is open (any tab state), which is what a browser allows.
- No pulsing/animation on the incoming screen (government style); ring tone and vibration carry the urgency.

### Next session — TODO
1. Owner: test on real phones (incoming screen, vibration on Android, speaker/earpiece button).
2. Live deploy steps (migrate live DB first, deploy, reload demo dataset); commit and push.

---
## Session — 2026-10-15 (BST)

### What was done
- Tender documents 01–05 now use the official Grace International letterhead (from `Final Submission Documents/Grace_International_Editable_Notepad.docx`): `tender-submission/build/build.js` draws the pad's header wave + company name and footer wave + address/phone/e-mail/QR on every page, with the pad's margins; document name, e-GP number and "Page X of Y" sit in the footer, right-aligned beside the address lines and left of the QR code. Landscape annexes use stretched waves (`build/letterhead/*-wide.png`, QR not distorted). Duplicate tenderer-name line removed from document tops.
- Regenerated DOCX, exported PDFs with Word (`tender-submission/PDF's/`), copied DOCX + PDF to `Final Submission Documents/`. Previous versions in `tender-submission/backup-before-letterhead/`.

### Decisions & rationale
- Letterhead built into the generator rather than pasted by hand, so regenerating keeps it.
- Presentation: separate letterhead copy `06-...-Letterhead.pptx` (+ PDF) made by `build/letterhead-deck.py` from the finished deck (content scaled into the space between the bands); the original deck is unchanged. Video (07) not on the pad.

### Next session — TODO
- Re-make the demonstration video; remaining items from the previous session.

---
## Session — 2026-10-15 (BST), part 2: spec mismatch fixes

### What was done
- Reviewed all tender documents against `projectDetails.md`. Document 01 matches the specification word for word (58 rows, rules 1–5, headings). Logical mismatches found and fixed below.
- **#17**: dashboard "Verified" card (Verified + Approved + Closed; `summary.verified`).
- **#16**: incident type (sub-category) filter: `subcategory` on `/incidents` and the shared report filters; Incidents page select narrowed by category.
- **#14**: reviewer modifies before approval: `PATCH /incidents/:id` now `incidents` permission; an officer with a workflow action on someone else's Submitted/Reviewed/Verified report (`canModify`, `canModifyAsReviewer` in `workflow.ts`) edits with a required `reason`; only changed fields written; `MODIFY_INCIDENT` audit with old → new values; timeline "Modified by reviewer"; creator notified ("Incident Modified"). UI: "Modify report" button, form in reviewer mode (notice, no drafts/evidence changes, reason dialog), Admin › Workflow note; edit route now `incidents`.
- **#10/#11**: office documents as evidence: DOCX/XLSX/PPTX, DOC/XLS/PPT, ODT/ODS/ODP, RTF, detected on content (`evidence/zip.ts`, `fileType.ts`), macro-enabled refused; document properties (title, author, last modified by, created, modified) in `metadata.document`, shown on the incident page and in printouts.
- Tests: 171 server tests pass (new: reviewer modify, type filter, verified count, office documents); frontend build and i18n check (1,375 keys) pass; checked in Chrome against the local server.
- Wording: Annex A #10, #11, #12 (investigation notes as comments), #14, #16, #17, #25; Annex B terms c and d (features that serve a specified item are not removable), SMTP row; Demo Guide (ten scenes, modify step, type filter, Verified card, Word file); Technical Proposal (integrity, uploads, workflow, 171 tests).
- Deck: 16 screenshots re-captured from a temporary copy of the demo dataset (database `birds_shots`, dropped afterwards), replaced originals in `build/shots-replaced-2026-10-15/`; 3 new slides (office documents, reviewer modification, its record) → 122 slides. Regenerated documents 01–05, both decks and all PDFs; copied to `Final Submission Documents/`.

### Decisions & rationale
- "Verified incidents" (#17) counted as passed verification (Verified, Approved, Closed), stated on the card.
- Reviewer modification is limited to the officer who may act at the current stage, never the filer, never after approval (keeps #25 and separation of duties).
- Reviewers cannot add/remove evidence; they return the report if evidence is missing.

### Blockers / waiting on
- **Live demo (https://birds-demo.onrender.com) does not yet have these changes**: they must be committed and deployed before the TEC demo; Annex A marks them as Demonstrated.
- Local `birds` database has two test incidents (BIRDS-2026-1084, 1085, "UI check") from the browser check; reload the demo dataset locally if needed.

### Next session — TODO
1. Commit and deploy to the live demo; reload the live demo dataset.
2. Re-make the demonstration video (still outdated).

---
## Session — 2026-10-15 (BST), part 3: infrastructure sizing for 700 users

### What was done
- Measured one API process on the demo dataset (mixed read workload as hq_admin, rate limit raised for the test): about 700 req/s, p95 < 100 ms, no errors at 100 concurrent clients (i7-12700H laptop). Measured bytes per row (audit 432 B, messages ~1.3 KB, notifications 512 B, incidents ~3.7 KB).
- Technical Proposal §7 rewritten: 7.1 workload basis (700 users = 500 + 40 % reserve; ~165 req/s average, ~500 peak; planning 350 req/s per process; 20,000 incidents/yr assumed; ~15 GB/yr database, ~0.5 TB/yr files; 10-year retention), 7.2 recommended (700) vs minimum (500) configuration with totals, 7.3 why each component is needed and what happens without it; network figures. §9 and §12: load test at 100/250/500/700, acceptance at 500. Annex A #38 and the deck updated. Proposal now 14 pages. Regenerated and copied to `Final Submission Documents/`.

### Decisions & rationale
- Server counts and sizes unchanged from the earlier proposal (they already carry 700 users: one application server alone covers the peak about 5×); what changed is the justification and the cheaper minimum option for comparison.
- Incident volume (20,000/yr) and per-user activity are assumptions; confirm with BGB, they drive storage cost.
- Follow-up (owner): the documents must not mention 700 users. §7 now says "dimensioned for the 500 concurrent users of item 38 with reserve capacity"; figures recalculated for 500 (≈115 req/s average, ≈350 peak, ≈10 GB/yr database); configuration columns "Recommended: 500 users with reserve" / "Minimum: 500 users, no reserve"; load test back to 100/250/500; Annex A #38 and deck updated. Server sizes unchanged (they still carry about 700 users internally). Verified: no "700" in any submitted PDF.

---
## Session — 2026-10-15 (BST), part 4: Flash Alert feature

### What was done
- New feature **Flash Alert** (owner request; extension of specs #23 notifications and #58): an officer with the new `raise_alert` permission (HQ Administrator, Sector Officer by default) warns every officer in the target sectors (or all units) of an imminent threat, with subject, intelligence, action required, last-seen place/time/GPS, validity (6 h – 7 days), optional linked incident and photo/video/document evidence.
- Mandatory false-alert declaration ("raising a false alert is a punishable offence"; time stored, audited, red warning on the form, record shown on the alert).
- Delivery: recipients fixed at raising; realtime event + web push (urgency high, no content on the lock screen) + 30 s background poll. Full-screen red takeover with siren and vibration until acknowledged (siren can be silenced); red banner on every page while active; sidebar "Flash alerts" with count; updates notify again (toast).
- Sender/HQ admin: updates, resolve / cancel with a note; acknowledgement progress and recipient list (also for admin/audit roles). Expiry derived from valid_until.
- Server: migration `20261015120000_flash_alerts` (4 tables, CHECKs, append-only triggers, recipient guard trigger, `raise_alert` grants), `modules/alerts/*`, bus/push types, OpenAPI (11 operations, `FlashAlert` schema). 13 new tests; full suite 184 passing.
- App: `api/alerts.js`, `context/AlertsContext.jsx`, `components/alerts/*` (takeover, banner, badges, media), pages `Alerts`, `AlertForm`, `AlertDetail`; routes, sidebar, header titles; service worker push; `alarm` tone; 150+ i18n keys (en/bn). Evidence file-type list moved to `helpers.js` (shared). Bangla: letter-spacing disabled under `html[lang=bn]` (conjuncts were pulled apart).
- Browser-tested end to end on a temporary copy of the demo dataset (dropped afterwards): raise with photo → takeover on another desktop after 67 ms and on a phone; acknowledge; banner; update toast; Bangla phone view.

### Decisions & rationale
- Name "Flash Alert": FLASH is the highest military message precedence; priorities Flash / Immediate.
- Every user receives alerts (no page permission); only raising is a permission, so admins can grant it to an intelligence role.
- Legal wording kept general ("under the applicable laws and BGB rules"), no specific Act cited until BGB confirms.
- Recipients cannot see who else acknowledged; sender, HQ admins and auditors can.

### Next session — TODO
1. Documentation for Flash Alert: Annex B value addition row (+ infrastructure: push, realtime already listed), Annex A #23/#58 notes, Technical Proposal modules table, Demo Guide scene, deck slides (re-capture screens), then regenerate documents and the letterhead copies.
2. Add a resolved example alert to the demo dataset (`server/prisma/demo`) so the demo shows history.
3. Commit and deploy (live demo needs `prisma migrate deploy` for the new migration).
