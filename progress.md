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
