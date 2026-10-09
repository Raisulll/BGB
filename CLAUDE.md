# BIRDS – Border Incident Reporting & Documentation System
## Claude Code Intelligence Guide

> **Project**: BIRDS Phase II — HQ Border Guard Bangladesh (BGB)
> **Frontend root**: `BGB/` (React + Vite SPA)
> **Status**: Backend API (`server/`) implemented; the frontend runs entirely on it (Session 9). Remaining: backups, logging/ops, LDAP, documentation, UAT.

---

## 1. Project Context

BIRDS is an **enterprise-grade, military-grade** web portal for centralized recording, management, verification, tracking, analysis, and reporting of border incidents across all BGB organizational levels (HQ → Sector → Battalion → BOP).

The system is evaluated by a **Technical Evaluation Committee (TEC)** against 58 formal technical specifications (see `projectDetails.md`). Every feature added or modified must be traceable to one or more spec items. Non-compliance disqualifies the bid.

---

## 2. Repository Layout

```
Tender/
├── CLAUDE.md                   ← this file
├── projectDetails.md           ← 58-item TEC technical specifications (source of truth)
└── BGB/                        ← frontend SPA (the only codebase right now)
    ├── index.html
    ├── vite.config.js          ← Vite 8 + React plugin + TailwindCSS v4 plugin
    ├── package.json
    ├── vercel.json             ← SPA rewrite rule for Vercel deployment
    ├── public/
    │   └── bgb.png             ← Official BGB emblem (use in all headers & reports)
    └── src/
        ├── main.jsx            ← Entry: BrowserRouter → ToastProvider → AppProvider → App
        ├── App.jsx             ← Route definitions + RequireAuth + RequirePermission guards
        ├── index.css           ← Global styles (TailwindCSS v4 @import, custom CSS vars)
        ├── api/                ← REST client: client.js (token, refresh, errors, downloads)
        │                         + auth, incidents, users, audit, notifications, reports, admin
        ├── context/
        │   ├── AppContext.jsx  ← Session, policy, form reference data, notification feed (API-backed)
        │   └── ToastContext.jsx
        ├── utils/
        │   ├── helpers.js      ← Shared pure utilities (date/BST formatting, styles, file helpers)
        │   └── activity.js     ← Last user-input time (idle logout + background polling)
        ├── hooks/
        │   ├── useApi.js       ← Load-on-deps hook (abort, stale-response guard) + useDebounced
        │   ├── useIdleLogout.js
        │   └── useMediaQuery.js
        ├── pages/
        │   ├── Login.jsx           → /login
        │   ├── Dashboard.jsx       → / (index)
        │   ├── Incidents.jsx       → /incidents
        │   ├── IncidentForm.jsx    → /incidents/new  and  /incidents/:id/edit
        │   ├── IncidentDetail.jsx  → /incidents/:id
        │   ├── ChangePassword.jsx  → /change-password
        │   ├── MapView.jsx         → /map
        │   ├── Analytics.jsx       → /analytics
        │   ├── Reports.jsx         → /reports
        │   ├── AuditTrail.jsx      → /audit
        │   └── admin/
        │       ├── Admin.jsx       → /admin (tab shell)
        │       └── AdminUsers / AdminPermissions / AdminCategories / AdminOrg / AdminWorkflow / AdminSettings
        ├── components/
        │   ├── layout/
        │   │   ├── Layout.jsx          ← Shell with Sidebar + Header + <Outlet/>
        │   │   ├── Sidebar.jsx
        │   │   ├── Header.jsx
        │   │   └── NotificationsMenu.jsx
        │   ├── incidents/
        │   │   └── IncidentList.jsx
        │   ├── dashboard/              ← Dashboard sub-components (charts, KPI cards, etc.)
        │   └── ui/
        │       ├── Badges.jsx          ← StatusBadge, SeverityBadge
        │       ├── Card.jsx
        │       ├── EmptyState.jsx
        │       ├── ErrorState.jsx      ← failed-load message + Retry
        │       ├── Modal.jsx           ← Modal, OneTimeSecret
        │       ├── ReasonDialog.jsx    ← reason prompt (return/reject/evidence removal)
        │       ├── Spinner.jsx
        │       ├── StatCard.jsx
        │       └── Toggle.jsx
        └── lib/                        ← (reserved for future shared lib code)
```

---

## 3. Tech Stack & Tooling

| Layer | Technology | Notes |
|---|---|---|
| Framework | React 19 | Strict Mode enabled |
| Build | Vite 8 | `npm run dev` → `localhost:5173` |
| Routing | React Router DOM v7 | `<BrowserRouter>`, lazy-loaded routes |
| Styling | **TailwindCSS v4** (via `@tailwindcss/vite` plugin) | No separate config file — uses `@import "tailwindcss"` in `index.css` |
| Maps | Leaflet 1.9 + react-leaflet 5 | Import `leaflet/dist/leaflet.css` in `main.jsx` |
| Charts | Chart.js 4 + react-chartjs-2 5 | Register components before use |
| Icons | FontAwesome 6 Free | Import `@fortawesome/fontawesome-free/css/all.min.css` in `main.jsx` · **Zero emoji policy** — use FA icons everywhere |
| Export | Native `Blob` + `URL.createObjectURL` | See `downloadFile()` in `helpers.js` |

**Important TailwindCSS v4 note**: There is **no `tailwind.config.js`**. All customization is done in `index.css` using `@theme { ... }` blocks. Do **not** create a v3-style config file.

---

## 4. State Management (API + AppContext)

The server is the source of truth (CLAUDE.md §16–§19, `server/README.md`). Pages load their own data through `src/api/*` and `useApi()`; `AppContext` only holds what every page needs. Import via `useApp()`.

```js
const {
  booting,               // true while the session is restored from the refresh cookie
  currentUser,           // { id, name, username, role, scope, email, mustChangePassword, permissions[] } | null
  policy,                // { sessionTimeoutMinutes, password: { minLength, requireUppercase, requireNumber, requireSpecial } }
  login(username, pwd),  // async → { user } or { error, locked }
  logout(reason),        // async; 'manual' (default) | 'timeout' (audited as SESSION_TIMEOUT)
  changePassword(cur, next), refreshUser(),
  hasPermission(user|null, pageId),   // from the server's effective permissions
  meta, reloadMeta(),    // GET /incidents/meta: categories, scoped org hierarchy, severities, statuses
  notifications, unreadCount, refreshNotifications(), markAllRead(), markRead(id),
} = useApp();
```

- **Mutations** call the API module directly (e.g. `incidentsApi.workflow(id, 'review')`) and use the returned record. The server validates, audits and notifies; the frontend never writes audit entries.
- **Workflow buttons** come from `incident.actions` and `incident.canEdit` in API responses. There is no client-side workflow table; the single table is `server/src/modules/incidents/workflow.ts`.
- **Errors**: API errors are `ApiError { status, code, message, details }`; show `errorMessage(err)`. 401 `TOKEN_INVALID` is refreshed transparently; other 401s end the session.

### Workflow state machine (server-enforced)

```
Draft → Submitted → Reviewed → Verified → Approved → Closed
                 ↘ Returned (back to the filing officer; reason required)
                 ↘ Rejected (reason required)
```

| Action | From | Who |
|---|---|---|
| submit | Draft, Returned | the filing officer only |
| review | Submitted | Sector Officer, Verifier/Approver, HQ Administrator |
| return / reject | Submitted, Reviewed, Verified | same as review; reason required |
| verify / approve | Reviewed / Verified | Verifier/Approver, HQ Administrator |
| close | Approved | HQ Administrator |

Plus: users act only within their scope, and nobody acts on an incident they filed (DOUBT-008).

---

## 5. RBAC – Roles & Permissions

| Role | pageIds granted |
|---|---|
| `HQ Administrator` | dashboard, incidents, create, map, analytics, reports, audit, admin |
| `Sector Officer` | dashboard, incidents, create, map, analytics, reports |
| `Battalion Operator` | dashboard, incidents, create, map |
| `Verifier/Approver` | dashboard, incidents, map, analytics, reports |
| `Auditor` | dashboard, incidents, analytics, reports, audit |

These are the factory defaults (`role_permissions`, editable in Admin > Permissions Matrix). The UI reads each user's effective pages from `currentUser.permissions`; the server enforces them on every request.

---

## 6. Demo Credentials

| Role | Username | Password | Unit |
|---|---|---|---|
| HQ Administrator | `hq_admin` | `Admin@123` | HQ |
| Sector Officer | `sector_off` | `Sector@123` | Sector-7 |
| Battalion Operator | `batt_op` | `Batt@123` | 17 BGB |
| Verifier/Approver | `verifier` | `Verify@123` | Sector-7 |
| Auditor | `auditor` | `Audit@123` | HQ |

---

## 7. Data Model – Incident Object (API shape)

`GET /incidents/:id`; list rows omit the long text fields, timeline and evidence.

```js
{
  id: 'BIRDS-2026-1021',      // BIRDS-<year>-<4-digit seq>, auto-generated by createIncident()
  title: string,
  category: string,           // Smuggling | Illegal Crossing | Security Threat | ...
  subcategory: string,
  date: 'YYYY-MM-DD',         // store as ISO; ALWAYS display as DD-MM-YYYY
  time: 'HH:MM',
  severity: 'Low' | 'Medium' | 'High' | 'Critical',
  sector: string,
  battalion: string,
  bop: string,
  lat: number,                // GPS latitude
  lng: number,                // GPS longitude
  description: string,        // narrative
  personsInvolved: string,
  actionTaken: string,
  outcome: string,
  status: string,             // see workflow state machine
  createdBy: string,          // user.id
  createdByName: string,
  createdAt: string,          // ISO timestamp (UTC); display in BST via formatDateTime()
  actions: string[],          // workflow actions the current user may take now
  canEdit: boolean,           // current user may edit/submit (creator, Draft/Returned)
  timeline: [                 // append-only history
    { action, user, userId, status, notes, date }
  ],
  evidence: [                 // { id, name, mimeType, size, sha256, metadata, uploadedAt, available, downloadUrl }
  ]
}
```

---

## 8. Shared Utilities (`src/utils/helpers.js`)

| Export | Purpose |
|---|---|
| `formatDateDisplay(str)` | Any date → `DD-MM-YYYY`; ISO timestamps give the Bangladesh calendar date |
| `formatDateTime(iso, { withSeconds })` | ISO timestamp → `DD-MM-YYYY HH:MM[:SS]` in BST |
| `timeAgo(iso)` | "5 min ago" style for feeds |
| `todayISO()` | Today in Bangladesh as `YYYY-MM-DD` (date inputs) |
| `validatePassword(pwd, policy.password)` | Client-side check mirroring the server policy |
| `isAdmin(user)` | Display hint only |
| `formatFileSize(bytes)` / `fileKind(mime)` / `FILE_ICONS` | Evidence display |
| `STATUS_STYLES` / `SEVERITY_STYLES` / `SEVERITY_HEX` | Badge classes; chart/marker colours |
| `cn(...classes)` | Conditional class joiner |

Downloads (exports, evidence) go through `downloadFrom()` in `src/api/client.js`, which sends the access token.

---

## 9. Design System & Conventions

### Date formatting — CRITICAL RULE
All dates **must** be displayed as `DD-MM-YYYY`. Use `formatDateDisplay()` from `helpers.js` everywhere. Dates are stored internally as ISO strings or `YYYY-MM-DD`.

### Branding
- Use `/bgb.png` (official BGB crest) in: Login page, Header/Sidebar, printable reports.
- Apply the text "CONFIDENTIAL // OPERATIONAL" classification banner to all generated reports.

### Aesthetics / UX
- **Military / command-center aesthetic**: dark/deep navy primary palette, amber/gold accents.
- **No emoji** anywhere in the UI — use FontAwesome icons exclusively.
- Smooth micro-animations and transitions are encouraged (hover effects, sidebar transitions).
- Responsive layout required: desktop, laptop, tablet.
- Browser support: Chrome (current), Edge (current), Firefox (current).

### Localization
- Primary language: **English**.
- Interface must be capable of supporting Bangla labels. Use Unicode-safe string handling.

---

## 10. Route Map

| Route | Page | Requires Permission |
|---|---|---|
| `/login` | `Login.jsx` | Public (redirects to `/` if already logged in) |
| `/` | `Dashboard.jsx` | `dashboard` |
| `/incidents` | `Incidents.jsx` | `incidents` |
| `/incidents/new` | `IncidentForm.jsx` | `create` |
| `/incidents/:id` | `IncidentDetail.jsx` | `incidents` |
| `/change-password` | `ChangePassword.jsx` | (just auth; forced while `mustChangePassword`) |
| `/incidents/:id/edit` | `IncidentForm.jsx` | `create` |
| `/map` | `MapView.jsx` | `map` |
| `/analytics` | `Analytics.jsx` | `analytics` |
| `/reports` | `Reports.jsx` | `reports` |
| `/audit` | `AuditTrail.jsx` | `audit` |
| `/admin` | `Admin.jsx` | `admin` |

All routes except `/login` are wrapped in `<RequireAuth>`. Permission-gated routes additionally use `<RequirePermission pageId="...">` which redirects to `/` on failure.

---

## 11. Specification Compliance Checklist

Each item maps to the 58 specs in `projectDetails.md`. **`requirements-status.md` is the authoritative tracker**; this table is a summary and may lag behind it.

| Spec# | Requirement | Status | Notes |
|---|---|---|---|
| 1 | System Type — BIRDS enterprise system | DONE | Full SPA demo |
| 2 | Centralized web-based, 3-tier architecture | DONE | React SPA → REST API → PostgreSQL, wired end-to-end (Session 9) |
| 3 | RBAC with configurable roles and access scopes | DONE | AppContext + Admin panel role matrix |
| 4 | Secure authentication + AD/LDAP capability | PARTIAL | Demo credentials in seed; LDAP hook needed |
| 5 | Create, edit, review, submit incident forms | DONE | 3-step IncidentForm.jsx wizard |
| 6 | Configurable incident categories/subcategories/severity | DONE | Seeded; Admin configurable |
| 7 | Full incident details capture | DONE | All fields in form and detail view |
| 8 | GPS coordinates + map visualization | DONE | Leaflet MapView.jsx + GPS fields in form |
| 9 | Organizational hierarchy (Region/Sector/Battalion/BOP) | DONE | Hierarchy selector in form; seed data |
| 10 | Evidence & document attachment | DONE | Drag-and-drop UI in IncidentForm step 3 |
| 11 | Media metadata preservation | PARTIAL | File name/type captured; EXIF metadata needs server-side |
| 12 | Incident timeline (chronological history) | DONE | timeline[] array on every incident |
| 13 | Workflow: Draft→Submitted→Reviewed→Verified→Approved→Closed | DONE | workflowAction() in AppContext |
| 14 | Supervisory review, return, modify, verify, approve, reject | DONE | IncidentDetail.jsx action buttons |
| 15 | Unique reference number + tracking by number/status/date | DONE | BIRDS-<year>-NNNN IDs; filter in Incidents page |
| 16 | Advanced search and filtering | DONE | Incidents page filters |
| 17 | Role-based dashboard with KPIs | DONE | Dashboard.jsx |
| 18 | GIS/Map dashboard | DONE | MapView.jsx with Leaflet markers |
| 19 | Analytics & statistical reports | DONE | Analytics.jsx with Chart.js |
| 20 | Trend analysis (day/week/month/quarter/year) | DONE | 12-month line chart in Dashboard & Analytics |
| 21 | Configurable operational/statistical/management reports | DONE | Reports.jsx with parameter filters |
| 22 | PDF, Excel/CSV export | DONE | Print CSS (PDF), native .xlsx via SheetJS (lazy-loaded), CSV via toCSV() |
| 23 | Notifications for workflow events | DONE | NotificationsMenu.jsx + addNotification() |
| 24 | Comprehensive audit trail | DONE | Server hash-chained audit log; AuditTrail.jsx search, verify, export |
| 25 | Data integrity — prevent unauthorized alteration | DONE | Server-enforced transitions, edit lock, scope, separation of duties; DB append-only triggers |
| 26 | Data security — access controls + encryption | PARTIAL | RBAC in place; TLS/encryption needs backend |
| 27 | HTTPS/TLS + data-at-rest encryption | PARTIAL | Vercel deployment uses HTTPS; DB encryption is backend |
| 28 | Session timeout + concurrent session control | DONE | Server idle timeout + single session; client idle sign-out; background polling doesn't count as activity |
| 29 | Password policy (length, complexity, lockout) | DONE | Server policy + lockout; change-password and admin reset with forced change in the UI |
| 30 | Enterprise relational database | DONE | PostgreSQL + Prisma |
| 31 | Secure REST API | PARTIAL | All §19 groups live except backups and server-side PDF; OpenAPI docs pending |
| 32 | AD/LDAP integration | PENDING | Integration hook architecture needed |
| 33 | Centralized file storage + retention policy | PARTIAL | Local dataUrl in demo; needs cloud/server storage |
| 34 | Automated scheduled backup | PENDING | Backend infrastructure requirement |
| 35 | Disaster recovery site support | PENDING | Infrastructure requirement |
| 36 | High availability / redundancy | PENDING | Infrastructure requirement |
| 37 | Scalability | PENDING | Architecture must support; DB + API layer needed |
| 38 | 100–500 concurrent users | PENDING | Load testing after backend deployment |
| 39 | <3s transaction response time | PENDING | Frontend is fast; backend performance target |
| 40 | 99.5% availability | PENDING | SLA for hosting infrastructure |
| 41 | Mobile responsive | DONE | TailwindCSS responsive classes throughout |
| 42 | Chrome, Edge, Firefox support | DONE | Vite + standard ES modules |
| 43 | English + Bangla localization capability | PARTIAL | English complete; i18n framework needed for Bangla |
| 44 | Configurable data retention policy | PARTIAL | Admin UI placeholder; needs backend |
| 45 | Data archiving with audit trail | PENDING | Backend requirement |
| 46 | Administrative module | DONE | Admin.jsx — users, roles, workflow, security settings |
| 47 | Configurable without code changes | PARTIAL | Partly configurable via Admin UI; full backend config needed |
| 48 | Application logging & monitoring | PARTIAL | Audit log in UI; server-side logging needed |
| 49 | OWASP Top 10 security hardening | PARTIAL | Frontend follows best practices; full assessment on backend |
| 50 | Vulnerability assessment report | PENDING | To be conducted before production deployment |
| 51 | Source code ownership delivered to BGB | DONE | Full source in this repository |
| 52 | Documentation (manuals, API docs, DB schema) | PARTIAL | README complete; full docs set needed |
| 53 | Training for admins, operators, end users | PENDING | Training materials needed |
| 54 | 1-year warranty & support | PENDING | Commercial commitment |
| 55 | Customization of forms/reports/workflows | DONE | Admin panel + configurable seed data |
| 56 | Full deployment & commissioning | PARTIAL | Deployment guide in README; production setup needed |
| 57 | Functional Acceptance Test (UAT) | PENDING | Test cases to be prepared |
| 58 | Future expansion (GIS, mobile, surveillance) | DONE | Leaflet GIS in place; modular architecture |

**Legend**: DONE = Implemented in demo | PARTIAL = Partially implemented | PENDING = Backend/infrastructure required

---

## 12. Development Commands

```bash
# Install dependencies (run inside BGB/)
cd BGB
npm install

# Start dev server → http://localhost:5173
npm run dev

# Production build → BGB/dist/
npm run build

# Preview production build locally
npm run preview
```

---

## 13. Key Coding Rules

1. **Date display**: Always use `formatDateDisplay()` from `helpers.js`. **Never** render raw ISO strings to the user.
2. **Icons**: FontAwesome `<i className="fas fa-...">` only. No emoji, no Material Icons.
3. **Data access**: All data comes from and goes to the API through `src/api/*`. No hard-coded or locally computed business data (no seed arrays, no placeholder figures); if the API lacks something, add it to the API.
4. **Audit logging**: The server audits every significant action. A new server action must call `writeAudit()`; the frontend never writes audit entries.
5. **Permission guards**: New pages need `<RequirePermission>` in `App.jsx`, a page id in the server's `PAGE_IDS` / default `role_permissions`, and `requirePermission()` on their API routes.
6. **TailwindCSS v4**: No `tailwind.config.js`. Customize in `index.css` via `@theme {}`. Do not install v3 utilities.
7. **Chart.js registration**: Always register required Chart.js components before rendering charts. Use `react-chartjs-2` wrappers.
8. **Leaflet CSS**: Already imported in `main.jsx`. Do not add redundant imports in page components.
9. **Code splitting**: All page-level components must use `React.lazy()` + `<Suspense fallback={<Spinner fullScreen />}>` as established in `App.jsx`.
10. **BGB branding**: Always include `/bgb.png` in Login, Header, and all printable report headers.
11. **Military aesthetic**: Maintain the command-center look — deep navy/slate backgrounds, amber/gold accents, clean typography. No casual or consumer-app styling.
12. **Report classification**: All generated/printed reports must include a `CONFIDENTIAL // OPERATIONAL` banner.
13. **Organizational hierarchy**: Sector → Battalion → BOP. Always take units from the API (`meta.hierarchy` or `/admin/org-hierarchy`); never hard-code unit names.
14. **Incident ID format**: `BIRDS-<year>-NNNN` (4-digit zero-padded sequence, e.g. `BIRDS-2026-1021`), allocated only by the server's per-year counter (see DOUBT-006). Never change this format — it is the unique reference number for TEC spec #15.
15. **Export formats**: PDF via browser `window.print()` with CSS `@media print` rules. CSV and Excel are generated by the server (`/reports/export/*`, `/audit/export/*`; banner, BST times, formula-injection guard, audited) and downloaded with `downloadFrom()`.
16. **Session hygiene**: Keep the access token in memory only (`api/client.js`). Polling that the user didn't trigger must pass `background: true` so it doesn't keep an idle session alive (spec #28).
17. **Demo-only features**: Features deferred for the demo version (backups #34, DR #35, HA #36, load/performance/availability #38–#40, log rotation/monitoring #48) are shown in the UI (Admin › Operations) but not built. Mark them with `DemoBadge`, put illustrative values in `Sample`, and use `DemoButton` for actions, so nothing is mistaken for live data. Never show unmarked placeholder figures.

---

## 14. Adding New Features — Checklist

When adding a new feature, verify against this checklist:

- [ ] Which TEC spec items does this feature satisfy? Add a comment in the code.
- [ ] Does it require a new route? → Add to `App.jsx` + the server's page ids / `role_permissions`.
- [ ] Does it mutate data? → Server endpoint with Zod validation + `writeAudit()`; frontend calls it via `src/api/`.
- [ ] Does it generate notifications? → Insert notification rows server-side (notifications module).
- [ ] Does it display dates? → Use `formatDateDisplay()`.
- [ ] Does it render privileged content? → Wrap with `hasPermission()` check.
- [ ] Does it add a new file to `src/`? → Follow the existing folder convention (`pages/`, `components/ui/`, etc.).
- [ ] Does the new UI match the military/command-center design system?

---

## 15. Production Deployment Notes

- **Hosting**: Vercel (config in `BGB/vercel.json`) or any static host with SPA rewrite support.
- **Environment**: All routes rewrite to `index.html` (SPA routing).
- **Backend**: A Node.js/Express or .NET REST API must be added for persistence, AD/LDAP, file storage, and scheduled backup (specs #2, #4, #30–#36, #44–#50).
- **Database**: Enterprise RDBMS (PostgreSQL or Microsoft SQL Server) recommended to satisfy spec #30.
- **Security**: Deploy behind HTTPS/TLS (spec #27). Configure reverse proxy headers. Conduct OWASP Top 10 assessment before UAT (specs #49–#50).
- **File Storage**: Use S3-compatible object storage or local NAS with defined retention policy (spec #33).

---

## 16. Backend Server — Full Implementation Tasks

> **Goal**: Replace every piece of in-memory / seed state with a real, persistent, secured backend that the React frontend talks to via REST API. All 58 TEC specs must be satisfied end-to-end.

### 16.1 Technology Decisions

| Concern | Choice | Rationale |
|---|---|---|
| Runtime | **Node.js 20 LTS** | Matches existing JS ecosystem; dev team continuity |
| Framework | **Express.js 5** | Lightweight, battle-tested, easy REST scaffolding |
| Database | **PostgreSQL 16+** (dev: 18) | Enterprise RDBMS (satisfies spec #30); full ACID, JSON support |
| ORM | **Prisma 7** (`prisma-client` generator + `@prisma/adapter-pg`) | Type-safe schema, migrations, seeding built-in. Datasource URL and seed command live in `server/prisma.config.ts`, not in `schema.prisma` |
| Auth | **JWT (access + refresh tokens)** + bcrypt | Stateless, scalable (satisfies specs #4, #28) |
| File Storage | **MinIO** (self-hosted S3-compat) or AWS S3 | Configurable, scalable (spec #33) |
| File Parsing | **Multer** (multipart) | Middleware for evidence uploads |
| Email/Notify | **Nodemailer** (SMTP) | Workflow notification emails (spec #23) |
| Logging | **Winston** + **Morgan** | Structured app + HTTP logs (spec #48) |
| Validation | **Zod** | Schema validation on every endpoint |
| Rate limiting | **express-rate-limit** | Security hardening (spec #49) |
| LDAP | **ldapjs** | AD/LDAP integration hook (spec #32) |
| Scheduler | **node-cron** | Automated backup jobs (spec #34) |
| Process mgr | **PM2** | Production process management + clustering |

### 16.1a Implementation notes (Phase 1, built 2026-10-08)

`server/README.md` is the operational guide. Points that differ from or extend the plan below:

- **Language/runtime**: TypeScript, ESM (`"type": "module"`, NodeNext). Relative imports use `.js` extensions. Dev: `tsx`. Prisma client is generated into `server/src/generated/prisma` (git-ignored; `postinstall` regenerates it).
- **Local DB**: project-local PostgreSQL 18 cluster in `server/.pgdata` on **port 5433** (`npm run db:start`). App role `birds` is **not** a superuser; `birds_admin` is the cluster superuser.
- **bcryptjs** (pure JS) instead of native `bcrypt` (no build toolchain needed on Windows); same algorithm, cost 12.
- **Sessions**: `refresh_tokens` rows are sessions (UUID id, rotated in place). Access tokens carry `sid`, and every request checks the session row, so logout, single-session, deactivation and idle timeout apply immediately.
- **Rate limiting**: login counts only *failed* attempts; refresh has its own limiter (see DOUBT-007).
- **Error envelope**: `{ error: { code, message, details? } }` everywhere.
- **Integrity SQL** that Prisma can't express lives in `server/prisma/sql/integrity.sql` and is appended to the init migration. Any later change to it needs a new hand-written migration.

### 16.2 Project Structure (Backend)

```
Tender/
├── CLAUDE.md
├── projectDetails.md
├── BGB/                      ← React frontend (existing)
└── server/                   ← NEW — backend root
    ├── package.json
    ├── .env.example           ← environment variable template
    ├── prisma/
    │   ├── schema.prisma      ← full DB schema
    │   ├── migrations/        ← auto-generated migration files
    │   └── seed.ts            ← database seeder (migrated from BGB/src/data/seed.js)
    ├── src/
    │   ├── app.ts             ← Express app factory
    │   ├── server.ts          ← entry point (listen + PM2 cluster)
    │   ├── config/
    │   │   ├── env.ts         ← typed env vars via Zod
    │   │   ├── logger.ts      ← Winston setup
    │   │   └── storage.ts     ← MinIO/S3 client init
    │   ├── middleware/
    │   │   ├── auth.ts        ← JWT verify middleware
    │   │   ├── rbac.ts        ← role/permission guard middleware
    │   │   ├── rateLimiter.ts
    │   │   ├── errorHandler.ts
    │   │   └── requestLogger.ts
    │   ├── modules/
    │   │   ├── auth/
    │   │   │   ├── auth.router.ts
    │   │   │   ├── auth.service.ts
    │   │   │   └── auth.schema.ts
    │   │   ├── users/
    │   │   │   ├── users.router.ts
    │   │   │   ├── users.service.ts
    │   │   │   └── users.schema.ts
    │   │   ├── incidents/
    │   │   │   ├── incidents.router.ts
    │   │   │   ├── incidents.service.ts
    │   │   │   └── incidents.schema.ts
    │   │   ├── evidence/
    │   │   │   ├── evidence.router.ts
    │   │   │   └── evidence.service.ts
    │   │   ├── audit/
    │   │   │   ├── audit.router.ts
    │   │   │   └── audit.service.ts
    │   │   ├── notifications/
    │   │   │   ├── notifications.router.ts
    │   │   │   └── notifications.service.ts
    │   │   ├── reports/
    │   │   │   ├── reports.router.ts
    │   │   │   └── reports.service.ts
    │   │   └── admin/
    │   │       ├── admin.router.ts
    │   │       └── admin.service.ts
    │   └── utils/
    │       ├── pagination.ts
    │       ├── formatDate.ts
    │       └── backup.ts
    └── docs/                  ← generated + hand-written documentation
        ├── api/               ← OpenAPI 3.1 spec (Swagger)
        ├── user-manual/
        ├── admin-manual/
        ├── installation-guide/
        ├── backup-recovery/
        └── db-schema/
```

---

## 17. Database Schema (PostgreSQL via Prisma)

> **Implemented** in `server/prisma/schema.prisma` + `server/prisma/sql/integrity.sql`. Deviations from the SQL below:
> - `users.must_change_password` added (admin-reset flow).
> - `audit_log`: the `GENERATED ... md5(timestamp::text ...)` column is **invalid in PostgreSQL** (timestamptz→text is not immutable). Replaced by a trigger-built **SHA-256 hash chain** (`seq`, `prev_hash`, `row_hash`) + `audit_log_verify()`. Append-only is enforced by triggers that *raise* instead of RULEs that silently do nothing (DOUBT-005).
> - `incident_timeline` also has append-only triggers.
> - `evidence.deleted_at` added (soft delete per §19.4); `incident_subcategories` unique on `(category_id, name)`.
> - `refresh_tokens`: UUID `id`, plus `previous_token_hash`, `rotated_at`, `last_seen_at`, `ip_address`, `user_agent`, `revoked_reason`.
> - `system_config` adds `session.single_session`.
> - Composite indexes `(sector, status)` and `(created_by, status)` from §26 are included.

> Derived directly from `BGB/src/data/seed.js`. Every table below must be created exactly as specified.

### 17.1 Table: `users`

```sql
CREATE TABLE users (
  id            VARCHAR(10) PRIMARY KEY,   -- 'U001', 'U002', ...
  username      VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,     -- bcrypt, rounds=12
  name          VARCHAR(100) NOT NULL,
  role          VARCHAR(50) NOT NULL,      -- FK → roles.name
  scope         VARCHAR(100) NOT NULL,     -- 'HQ', 'Sector-7', '17 BGB'
  email         VARCHAR(150) UNIQUE NOT NULL,
  is_active     BOOLEAN DEFAULT TRUE,
  failed_attempts INT DEFAULT 0,
  locked_until  TIMESTAMPTZ,
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### 17.2 Table: `roles`

```sql
CREATE TABLE roles (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(50) UNIQUE NOT NULL,  -- 'HQ Administrator', etc.
  description TEXT
);
```

### 17.3 Table: `role_permissions`

```sql
CREATE TABLE role_permissions (
  id       SERIAL PRIMARY KEY,
  role     VARCHAR(50) NOT NULL REFERENCES roles(name),
  page_id  VARCHAR(50) NOT NULL,  -- 'dashboard','incidents','create','map','analytics','reports','audit','admin'
  enabled  BOOLEAN DEFAULT TRUE,
  UNIQUE(role, page_id)
);
```

### 17.4 Table: `org_hierarchy`

```sql
CREATE TABLE org_hierarchy (
  id        SERIAL PRIMARY KEY,
  hq        VARCHAR(50) NOT NULL DEFAULT 'HQ',
  sector    VARCHAR(50) NOT NULL,   -- 'Sector-7', 'Sector-11'
  battalion VARCHAR(50) NOT NULL,   -- '17 BGB', '34 BGB', etc.
  bop       VARCHAR(100) NOT NULL,  -- 'BOP Teknaf', 'BOP Ghumdhum', etc.
  UNIQUE(sector, battalion, bop)
);
```

### 17.5 Table: `incident_categories`

```sql
CREATE TABLE incident_categories (
  id           VARCHAR(10) PRIMARY KEY,  -- 'CAT01' ... 'CAT07'
  name         VARCHAR(100) UNIQUE NOT NULL,
  is_active    BOOLEAN DEFAULT TRUE
);

CREATE TABLE incident_subcategories (
  id          SERIAL PRIMARY KEY,
  category_id VARCHAR(10) NOT NULL REFERENCES incident_categories(id),
  name        VARCHAR(100) NOT NULL,
  is_active   BOOLEAN DEFAULT TRUE
);
```

### 17.6 Table: `incidents`

```sql
CREATE TABLE incidents (
  id                VARCHAR(30) PRIMARY KEY,  -- 'BIRDS-2026-XXXX'
  title             VARCHAR(255) NOT NULL,
  category          VARCHAR(100) NOT NULL,
  subcategory       VARCHAR(100),
  severity          VARCHAR(20) NOT NULL CHECK (severity IN ('Low','Medium','High','Critical')),
  status            VARCHAR(20) NOT NULL CHECK (status IN ('Draft','Submitted','Reviewed','Verified','Approved','Closed','Returned','Rejected')),
  incident_date     DATE NOT NULL,
  incident_time     TIME NOT NULL,
  location          VARCHAR(255),
  bop               VARCHAR(100),
  sector            VARCHAR(50),
  battalion         VARCHAR(50),
  lat               DECIMAL(10, 7),
  lng               DECIMAL(10, 7),
  description       TEXT NOT NULL,
  persons_involved  TEXT,
  action_taken      TEXT,
  outcome           TEXT,
  created_by        VARCHAR(10) NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Prevent modification of Approved/Closed/Rejected records by non-admins (enforced at API layer too)
CREATE INDEX idx_incidents_status ON incidents(status);
CREATE INDEX idx_incidents_sector ON incidents(sector);
CREATE INDEX idx_incidents_date ON incidents(incident_date);
CREATE INDEX idx_incidents_category ON incidents(category);
```

### 17.7 Table: `incident_timeline`

```sql
CREATE TABLE incident_timeline (
  id          SERIAL PRIMARY KEY,
  incident_id VARCHAR(30) NOT NULL REFERENCES incidents(id) ON DELETE RESTRICT,
  action      VARCHAR(50) NOT NULL,   -- 'Created', 'Submitted', 'Reviewed', etc.
  user_name   VARCHAR(100) NOT NULL,
  user_id     VARCHAR(10) REFERENCES users(id),
  status      VARCHAR(20) NOT NULL,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
-- Timeline rows are NEVER deleted (append-only, satisfies spec #12 + #25)
```

### 17.8 Table: `evidence`

```sql
CREATE TABLE evidence (
  id            SERIAL PRIMARY KEY,
  incident_id   VARCHAR(30) NOT NULL REFERENCES incidents(id) ON DELETE RESTRICT,
  file_name     VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type     VARCHAR(100) NOT NULL,
  file_size     BIGINT NOT NULL,        -- bytes
  storage_path  VARCHAR(500) NOT NULL,  -- MinIO/S3 object key
  file_metadata JSONB,                  -- preserved EXIF/file metadata (spec #11)
  uploaded_by   VARCHAR(10) REFERENCES users(id),
  uploaded_at   TIMESTAMPTZ DEFAULT NOW()
);
```

### 17.9 Table: `audit_log`

```sql
CREATE TABLE audit_log (
  id          SERIAL PRIMARY KEY,
  timestamp   TIMESTAMPTZ DEFAULT NOW(),
  user_id     VARCHAR(10),   -- can be null for system events
  username    VARCHAR(50) NOT NULL,
  action      VARCHAR(100) NOT NULL,  -- 'LOGIN', 'CREATE_INCIDENT', etc.
  details     TEXT,
  ip_address  INET,
  user_agent  TEXT,
  -- Tamper evidence: hash chain (spec #24)
  row_hash    VARCHAR(64) GENERATED ALWAYS AS (
                md5(timestamp::text || username || action || COALESCE(details,''))
              ) STORED
);
-- Audit log rows must NEVER be deleted or updated (enforced by trigger)
CREATE OR REPLACE RULE no_delete_audit AS ON DELETE TO audit_log DO INSTEAD NOTHING;
CREATE OR REPLACE RULE no_update_audit AS ON UPDATE TO audit_log DO INSTEAD NOTHING;
```

### 17.10 Table: `notifications`

```sql
CREATE TABLE notifications (
  id          SERIAL PRIMARY KEY,
  user_id     VARCHAR(10) REFERENCES users(id),  -- NULL = broadcast
  title       VARCHAR(200) NOT NULL,
  message     TEXT NOT NULL,
  type        VARCHAR(50),   -- 'submission', 'review', 'approval', 'return'
  is_read     BOOLEAN DEFAULT FALSE,
  incident_id VARCHAR(30) REFERENCES incidents(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### 17.11 Table: `system_config`

```sql
CREATE TABLE system_config (
  key         VARCHAR(100) PRIMARY KEY,
  value       TEXT NOT NULL,
  description TEXT,
  updated_by  VARCHAR(10) REFERENCES users(id),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
-- Default rows:
-- ('password.min_length', '8', 'Minimum password length')
-- ('password.require_uppercase', 'true', ...)
-- ('password.require_number', 'true', ...)
-- ('password.require_special', 'true', ...)
-- ('password.max_attempts', '5', 'Failed login threshold before lockout')
-- ('password.lockout_minutes', '15', 'Account lockout duration')
-- ('session.timeout_minutes', '30', 'Idle session timeout')
-- ('data.retention_days', '3650', '10-year retention policy')
-- ('backup.frequency_hours', '24', 'Automated backup interval')
```

### 17.12 Table: `refresh_tokens`

```sql
CREATE TABLE refresh_tokens (
  id          SERIAL PRIMARY KEY,
  user_id     VARCHAR(10) NOT NULL REFERENCES users(id),
  token_hash  VARCHAR(255) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  revoked     BOOLEAN DEFAULT FALSE
);
```

---

## 18. Database Seed Migration

The following seed data (originally in `BGB/src/data/seed.js`, now `server/prisma/data/seed-data.js`) must be migrated to `server/prisma/seed.ts` and loaded into PostgreSQL via `npx prisma db seed`.

### 18.1 Seed checklist

- [x] **5 users** (U001–U005) — hash all plain-text passwords with bcrypt before insert
- [x] **5 roles** from `ROLES` array → insert into `roles` table
- [x] **Default role_permissions** from `DEFAULT_PERMISSIONS` in `AppContext.jsx`
- [x] **ORG_HIERARCHY** — flatten the nested object into flat `org_hierarchy` rows (2 sectors × multiple battalions × multiple BOPs = ~16 rows)
- [x] **7 incident categories** (CAT01–CAT07) + all subcategories → `incident_categories` + `incident_subcategories`
- [x] **20 SEED_INCIDENTS** (BIRDS-2026-1001 through BIRDS-2026-1020) → `incidents` table
- [x] **All timeline arrays** per incident → `incident_timeline` rows (append-only)
- [x] **Evidence metadata** per incident → `evidence` rows (storage_path = placeholder until files uploaded)
- [x] **15 SEED_AUDIT_LOG** entries → `audit_log` rows
- [x] **4 SEED_NOTIFICATIONS** → `notifications` rows
- [x] **PASSWORD_POLICY** + **SESSION_TIMEOUT** + **DATA_RETENTION_DAYS** → `system_config` rows
- [x] **NEXT_INCIDENT_ID** → store as `system_config` row `('incident.next_id', '1021')`

### 18.2 Frontend changes after backend is live

> **Done in Session 9** (2026-10-09). Native `fetch` was used (no axios).

1. [x] **Delete** `BGB/src/data/seed.js` (no longer used for runtime data)
2. [x] **Replace** all `AppContext` in-memory state with `fetch()` / `axios` API calls
3. [x] **Create** `BGB/src/api/` directory with one module per resource:
   - `api/auth.js` — login, logout, refresh
   - `api/incidents.js` — CRUD + workflow actions
   - `api/users.js` — user management
   - `api/audit.js` — audit log fetch
   - `api/notifications.js` — fetch, mark-read
   - `api/reports.js` — generate + export
   - `api/admin.js` — config, permissions
4. [x] **Keep** `AppContext` as a thin state/cache layer; it should hydrate from API on mount

---

## 19. REST API Endpoints (Full Specification)

Base URL: `https://birds.bgb.gov.bd/api/v1`  
All endpoints require `Authorization: Bearer <access_token>` unless marked **Public**.

### 19.1 Auth  (`/api/v1/auth`)

| Method | Path | Description | Spec |
|---|---|---|---|
| POST | `/auth/login` | Username + password login; returns access + refresh tokens | #4, #28 |
| POST | `/auth/logout` | Revoke refresh token, write LOGOUT audit entry | #4, #24 |
| POST | `/auth/refresh` | Exchange refresh token for new access token | #28 |
| POST | `/auth/change-password` | Authenticated user changes own password | #29 |
| POST | `/auth/admin/reset-password` | Admin resets a user's password (temp password) | #29 |

### 19.2 Users  (`/api/v1/users`)

> **Implemented (Session 7)**. See `server/README.md` for guards (no self-demotion, last-admin protection, sessions ended on privilege change).

| Method | Path | Permission | Description | Spec |
|---|---|---|---|---|
| GET | `/users` | admin | List all users | #3 |
| POST | `/users` | admin | Create new user | #3 |
| GET | `/users/:id` | admin | Get user details | #3 |
| PATCH | `/users/:id` | admin | Update user role, scope, active status | #3 |
| DELETE | `/users/:id` | admin | Soft-deactivate user (never hard delete) | #3 |

### 19.3 Incidents  (`/api/v1/incidents`)

> **Implemented (Session 5)** except the two export routes, which move to the reports module. Also added: `GET /incidents/meta` (form reference data) and `GIS /gis/incidents` (§19.9). Behaviour rules (scope, draft privacy, separation of duties, 409 on state conflicts) are in `server/README.md` and DOUBT-008.

| Method | Path | Permission | Description | Spec |
|---|---|---|---|---|
| GET | `/incidents` | incidents | List with pagination + filters (date, status, sector, category, severity, ref#) | #15, #16 |
| POST | `/incidents` | create | Create new incident (Draft or Submitted) | #5 |
| GET | `/incidents/:id` | incidents | Get full incident detail including timeline | #7, #12 |
| PATCH | `/incidents/:id` | create | Edit Draft/Returned incident | #5 |
| POST | `/incidents/:id/submit` | create | Submit Draft → Submitted | #13 |
| POST | `/incidents/:id/review` | reviewer | Submitted → Reviewed | #14 |
| POST | `/incidents/:id/verify` | approver | Reviewed → Verified | #14 |
| POST | `/incidents/:id/approve` | approver | Verified → Approved | #14 |
| POST | `/incidents/:id/close` | admin | Approved → Closed | #14 |
| POST | `/incidents/:id/return` | reviewer | Any → Returned | #14 |
| POST | `/incidents/:id/reject` | reviewer | Any → Rejected | #14 |
| GET | `/incidents/:id/timeline` | incidents | Get append-only timeline | #12 |
| GET | `/incidents/export/csv` | reports | CSV export with same filters | #22 |
| GET | `/incidents/export/excel` | reports | XLSX export | #22 |

### 19.4 Evidence  (`/api/v1/incidents/:id/evidence`)

> **Implemented (Session 6)**, plus `POST /:eid/verify` (SHA-256 re-check). Local-disk storage driver only; the S3/MinIO driver is pending. Details in `server/README.md`.

| Method | Path | Permission | Description | Spec |
|---|---|---|---|---|
| POST | `/incidents/:id/evidence` | create | Upload file(s); preserve metadata | #10, #11 |
| GET | `/incidents/:id/evidence` | incidents | List evidence files | #10 |
| GET | `/incidents/:id/evidence/:eid` | incidents | Download file | #10 |
| DELETE | `/incidents/:id/evidence/:eid` | admin | Soft-delete evidence (requires audit entry) | #10, #24 |

### 19.5 Audit Log  (`/api/v1/audit`)

> **Implemented (Session 8)**, plus `GET /audit/verify` and `GET /audit/export/excel`.

| Method | Path | Permission | Description | Spec |
|---|---|---|---|---|
| GET | `/audit` | audit | Paginated audit log with search/filter | #24 |
| GET | `/audit/export/csv` | audit | Export audit log as CSV | #22 |

### 19.6 Notifications  (`/api/v1/notifications`)

> **Implemented (Session 8)**. Notifications are per-user rows (no broadcasts); email delivery (§23) is pending SMTP details.

| Method | Path | Permission | Description | Spec |
|---|---|---|---|---|
| GET | `/notifications` | any | Get user's own notifications | #23 |
| PATCH | `/notifications/read-all` | any | Mark all as read | #23 |
| PATCH | `/notifications/:id/read` | any | Mark single as read | #23 |

### 19.7 Analytics & Reports  (`/api/v1/reports`)

> **Implemented (Session 8)** except `/reports/print` and `/reports/export/pdf` (Puppeteer deferred, DOUBT-004). KPI/trend/breakdown endpoints accept the `dashboard` **or** `analytics` permission, because the Dashboard shows them to every role.

| Method | Path | Permission | Description | Spec |
|---|---|---|---|---|
| GET | `/reports/summary` | analytics | KPI summary (totals, pending, open, closed) | #17 |
| GET | `/reports/trends` | analytics | Monthly trend data (12-month, by week/month/quarter/year) | #20 |
| GET | `/reports/by-category` | analytics | Incident count grouped by category | #19 |
| GET | `/reports/by-sector` | analytics | Risk distribution by sector | #19 |
| GET | `/reports/by-severity` | analytics | Severity breakdown | #19 |
| GET | `/reports/operational` | reports | Full configurable operational report | #21 |
| GET | `/reports/print` | reports | Print-ready HTML report | #21 |
| GET | `/reports/export/pdf` | reports | Server-rendered PDF via Puppeteer | #22 |
| GET | `/reports/export/excel` | reports | XLSX report | #22 |

### 19.8 Admin  (`/api/v1/admin`)

> **Implemented (Session 7)** except the backup routes (Phase 5). Added: `POST /admin/org-hierarchy`. Config values are typed/range-checked via `CONFIG_DEFAULTS` in `server/src/modules/admin/config.service.ts`.

| Method | Path | Permission | Description | Spec |
|---|---|---|---|---|
| GET | `/admin/config` | admin | Get all system_config values | #47 |
| PATCH | `/admin/config` | admin | Update system config key-values | #47 |
| GET | `/admin/roles/permissions` | admin | Get role → pageIds map | #3 |
| PATCH | `/admin/roles/permissions` | admin | Update a role's permission set | #3 |
| POST | `/admin/roles/permissions/reset` | admin | Reset to factory defaults | #3 |
| GET | `/admin/org-hierarchy` | admin | Get org hierarchy | #9 |
| GET | `/admin/categories` | admin | Get incident categories + subcategories | #6 |
| POST | `/admin/categories` | admin | Add new category | #6 |
| PATCH | `/admin/categories/:id` | admin | Edit category | #6 |
| GET | `/admin/backup/run` | admin | Trigger manual backup | #34 |
| GET | `/admin/backup/list` | admin | List backup records | #34 |

### 19.9 GIS  (`/api/v1/gis`)

| Method | Path | Permission | Description | Spec |
|---|---|---|---|---|
| GET | `/gis/incidents` | map | Incidents with lat/lng for map markers | #8, #18 |

---

## 20. Security Implementation Tasks

> All tasks satisfy specs #26–#29, #49–#50.

- [ ] **Password hashing**: bcrypt with cost factor 12 on every create/update
- [ ] **Password policy enforcement**: Validate against `system_config` policy on every password set. Rules: min length, uppercase, number, special char
- [ ] **Account lockout**: After `max_attempts` failed logins, set `locked_until = NOW() + lockout_minutes`; return 423 Locked
- [ ] **JWT**: Access token TTL = 15 min; Refresh token TTL = 8 hours (matches session timeout); sign with RS256 (asymmetric)
- [ ] **Concurrent session control**: Only 1 active refresh token per user; new login revokes previous refresh token
- [ ] **HTTPS/TLS**: Enforce via reverse proxy (Nginx); redirect all HTTP → HTTPS; HSTS header
- [ ] **Helmet.js**: CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- [ ] **Rate limiting**: 10 login attempts per IP per 15 min; 100 req/min per authenticated user
- [ ] **Input sanitization**: Zod schema validation on all POST/PATCH bodies; parameterized Prisma queries (no raw SQL injection risk)
- [ ] **File upload security**: Whitelist MIME types (image/jpeg, image/png, image/gif, application/pdf, video/mp4, video/quicktime); max 50 MB per file; virus scan hook
- [ ] **Data integrity**: Approved/Closed incidents — block all PATCH/DELETE at service layer; return 403 with audit entry
- [ ] **Audit immutability**: Database-level rules prevent UPDATE/DELETE on `audit_log` (see schema section 17.9)
- [ ] **OWASP Top 10**: Document mitigation for each item before UAT (output must go into `docs/security/owasp-assessment.md`)
- [ ] **Vulnerability Assessment**: Run OWASP ZAP scan + npm audit before production; remediate all Critical/High findings

---

## 21. File Storage Implementation Tasks

> Satisfies specs #10, #11, #33.

- [ ] Set up **MinIO** instance (or configure AWS S3 bucket)
- [ ] Bucket policy: private; all access via pre-signed URLs (TTL = 15 min)
- [ ] **Upload flow**: `POST /evidence` → Multer buffer → extract metadata → upload to MinIO → save `evidence` row
- [ ] **Metadata extraction**: Use `exifr` library to parse EXIF from images; store in `evidence.file_metadata` JSONB
- [ ] **Download flow**: `GET /evidence/:eid` → generate pre-signed URL → redirect (or stream proxy)
- [ ] **Storage limits**: Configurable per-incident max (default: 500 MB); global quota alarm
- [ ] **Retention policy**: Cron job reads `data.retention_days` from `system_config`; archives files older than threshold to cold storage or deletes as per policy
- [ ] **Backup of evidence**: Include MinIO bucket in daily backup job

---

## 22. Backup & Disaster Recovery Tasks

> Satisfies specs #34, #35, #36.

- [ ] **Automated daily backup** (`node-cron`):
  - `pg_dump` → compress → encrypt (AES-256) → upload to off-site storage (S3/SFTP)
  - Log backup result to `audit_log` as `SYSTEM_BACKUP` action
  - Frequency configurable via `backup.frequency_hours` in `system_config`
- [ ] **Backup verification**: Monthly restore test to staging environment; automated checksum verification
- [ ] **Point-in-time recovery**: Enable PostgreSQL WAL archiving for PITR
- [ ] **DR site**: Document steps to replicate PostgreSQL + MinIO to DR environment using streaming replication
- [ ] **RTO/RPO targets**: Define in `docs/backup-recovery/` (e.g. RTO = 4 hours, RPO = 24 hours)
- [ ] **Backup listing endpoint**: `GET /admin/backup/list` returns backup inventory from metadata store

---

## 23. Notification System Tasks

> Satisfies spec #23.

- [ ] Store all notifications in `notifications` table (user_id-scoped)
- [ ] **Workflow triggers**: Every workflow action (`submit`, `review`, `verify`, `approve`, `close`, `return`, `reject`) inserts a notification row for the next responsible role group
- [ ] **Email notifications**: Send email via Nodemailer (SMTP) for: new submission, approval, rejection, return. Templates in `server/src/templates/email/`
- [ ] **Polling endpoint**: `GET /notifications` called by frontend every 30 seconds (or upgrade to SSE/WebSocket in future)
- [ ] **Mark-read**: Frontend calls `PATCH /notifications/read-all` on bell icon click

---

## 24. AD/LDAP Integration Tasks

> Satisfies spec #32.

- [ ] Install `ldapjs` and create `server/src/modules/auth/ldap.service.ts`
- [ ] Config keys in `system_config`: `ldap.enabled`, `ldap.url`, `ldap.bind_dn`, `ldap.bind_password`, `ldap.base_dn`, `ldap.user_filter`
- [ ] **Auth flow with LDAP enabled**:
  1. Try LDAP bind with username + password
  2. If success → lookup or auto-provision user in local `users` table
  3. If LDAP disabled → fall back to local bcrypt auth
- [ ] LDAP connection must be over LDAPS (port 636) or STARTTLS
- [ ] Document setup in `docs/admin-manual/ldap-setup.md`

---

## 25. Logging & Monitoring Tasks

> Satisfies spec #48.

- [ ] **Winston logger**: Levels: error, warn, info, http, debug. JSON format in production
- [ ] **Morgan HTTP logger**: Log all requests with method, URL, status, response time, user IP
- [ ] **Log files**: Rotate daily via `winston-daily-rotate-file`; keep 90 days (configurable)
- [ ] **Security events**: Dedicated `security.log` stream for: failed logins, lockouts, permission denials, suspicious activity
- [ ] **Log storage path**: `/var/log/birds/` on server; also forward to syslog or SIEM if available
- [ ] **Admin monitoring endpoint**: `GET /admin/logs/summary` — last 24h error count, login failures, active sessions

---

## 26. Performance & Scalability Tasks

> Satisfies specs #37–#40.

- [ ] **Database indexes**: Already specified in schema (status, sector, date, category). Add composite: `(sector, status)`, `(created_by, status)`
- [ ] **Pagination**: All list endpoints use cursor-based or offset pagination; default page size = 25, max = 100
- [ ] **Response time target**: < 3 seconds for normal transactions under 500 concurrent users (spec #39)
- [ ] **PM2 cluster mode**: `pm2 start server.js -i max` to use all CPU cores
- [ ] **Connection pooling**: Prisma connection pool size = `(CPU_cores * 2) + 1`
- [ ] **Load testing**: Run k6 or Artillery load test at 100/250/500 VU before UAT; results documented in `docs/performance/load-test-results.md`
- [ ] **Availability monitoring**: Set up uptime monitor (e.g., UptimeRobot) targeting 99.5% SLA (spec #40)

---

## 27. Documentation Deliverables

> Satisfies spec #52. All documents go in `server/docs/`. Submit as PDF to TEC.

### 27.1 System Administration Manual  (`docs/admin-manual/`)
- [ ] Installation prerequisites (Node.js, PostgreSQL, MinIO, PM2, Nginx)
- [ ] Environment variable reference (`.env.example` annotated)
- [ ] Database setup + migration commands (`npx prisma migrate deploy`)
- [ ] Seeding production data (`npx prisma db seed`)
- [ ] Starting / stopping / restarting the server (PM2 commands)
- [ ] SSL/TLS certificate configuration (Nginx + Let's Encrypt or internal CA)
- [ ] LDAP/AD integration setup
- [ ] Backup schedule configuration
- [ ] Log file locations and rotation policy
- [ ] Role permissions matrix configuration
- [ ] System config parameter reference (all `system_config` keys)
- [ ] User account lifecycle (create, modify, deactivate, lockout, reset)

### 27.2 User Manual  (`docs/user-manual/`)
- [ ] Login and logout
- [ ] Dashboard overview by role (Battalion Operator view vs. HQ Admin view)
- [ ] Filing a new incident — step-by-step (3-step wizard)
- [ ] Attaching evidence files (types, size limits)
- [ ] Tracking an incident by reference number
- [ ] Workflow actions (submit, review, verify, approve, close, return, reject) with who can do what
- [ ] Using the GIS map
- [ ] Search and filter on Incidents page
- [ ] Running and exporting reports (PDF, Excel, CSV)
- [ ] Viewing audit trail (Auditor role)
- [ ] Notifications — what triggers them and how to clear them
- [ ] Changing own password

### 27.3 API Documentation  (`docs/api/`)
- [ ] **OpenAPI 3.1 YAML** spec covering all endpoints in Section 19
- [ ] Swagger UI served at `/api/docs` in development mode
- [ ] Authentication section (JWT Bearer, token refresh flow)
- [ ] Error response format (standard JSON error envelope)
- [ ] Rate limiting headers documented
- [ ] Example request/response for every endpoint

### 27.4 Database Documentation  (`docs/db-schema/`)
- [ ] Entity-Relationship Diagram (ERD) — export from Prisma or draw manually
- [ ] Table dictionary — every table, column, type, constraint, index described
- [ ] Data flow diagram — how incident data moves through lifecycle
- [ ] Backup and restore procedures

### 27.5 Installation & Deployment Guide  (`docs/installation-guide/`)
- [ ] System requirements (OS, RAM, disk, CPU)
- [ ] Step-by-step fresh server installation (Ubuntu 22.04 LTS recommended)
- [ ] PostgreSQL 16 setup
- [ ] MinIO setup
- [ ] Node.js + PM2 setup
- [ ] Nginx reverse proxy + SSL configuration
- [ ] Environment variables configuration
- [ ] Database migration and seeding
- [ ] First-run checklist
- [ ] Verifying the installation (smoke test URLs)
- [ ] Updating to a new version (zero-downtime deploy procedure)

### 27.6 Backup & Recovery Procedure  (`docs/backup-recovery/`)
- [ ] Backup schedule and storage locations
- [ ] Manual backup trigger steps
- [ ] Restore procedure (step-by-step from backup)
- [ ] Point-in-time recovery using WAL
- [ ] DR site failover procedure
- [ ] RTO and RPO definitions and targets
- [ ] Backup verification checklist

### 27.7 Security Assessment Report  (`docs/security/`)
- [ ] OWASP Top 10 mitigation matrix (each item: risk, mitigation applied, status)
- [ ] Vulnerability Assessment report (OWASP ZAP scan results + remediation)
- [ ] Password policy documentation
- [ ] Session management policy
- [ ] Data classification and access control matrix
- [ ] Encryption standards used (bcrypt, AES-256, TLS 1.3, RS256 JWT)

---

## 28. Training Deliverables

> Satisfies spec #53.

- [ ] **System Administrator Training** (2-day course): covers all admin manual topics; hands-on server management
- [ ] **Operator Training** (1-day course): covers user manual; incident filing, workflow, reports
- [ ] **Auditor Training** (half-day): audit trail inspection, export, compliance verification
- [ ] **Training slides** in `docs/training/` (PowerPoint + PDF)
- [ ] **Quick Reference Cards** — 1-page laminated reference per role

---

## 29. Acceptance Testing (UAT) Checklist

> Satisfies spec #57.

- [ ] Test case document in `docs/uat/test-cases.xlsx` covering all 58 TEC specs
- [ ] Test environment set up matching production specs
- [ ] All 5 demo user roles exercised in testing
- [ ] Full incident lifecycle tested: Draft → Submitted → Reviewed → Verified → Approved → Closed
- [ ] Return and reject workflow tested
- [ ] Evidence upload + metadata preservation tested
- [ ] Export (PDF, Excel, CSV) verified for correct data
- [ ] GIS map verified with real GPS coordinates
- [ ] Audit log verified for tamper-evidence (no edit/delete possible)
- [ ] Session timeout tested (auto-logout after configured idle period)
- [ ] Account lockout tested (n failed attempts → locked)
- [ ] RBAC tested: each role can only access permitted pages
- [ ] Performance test: < 3s response under load (spec #39)
- [ ] Responsive layout tested on mobile, tablet, desktop

---

## 30. Implementation Sequence (Recommended Order)

```
Phase 1 — Foundation (Week 1–2)
  1. Set up server/ project structure
  2. Configure PostgreSQL + Prisma schema
  3. Run migrations
  4. Run prisma db seed (migrate all seed.js data)
  5. Implement auth module (login, JWT, refresh, logout)
  6. Implement RBAC middleware

Phase 2 — Core Incidents API (Week 3–4)
  7. Incidents CRUD + workflow endpoints
  8. Incident timeline (append-only)
  9. Evidence upload (Multer + MinIO)
  10. Update frontend AppContext to call API

Phase 3 — Supporting Modules (Week 5)
  11. Audit log endpoints
  12. Notifications system
  13. Reports + analytics endpoints
  14. Admin config endpoints

Phase 4 — Security Hardening (Week 6)
  15. Rate limiting, Helmet, CORS lockdown
  16. Password policy enforcement
  17. Account lockout
  18. File upload security (MIME whitelist, size limit)
  19. OWASP ZAP scan + remediation

Phase 5 — Operations (Week 7)
  20. Automated backup job (node-cron)
  21. Logging + log rotation
  22. PM2 cluster + Nginx reverse proxy
  23. LDAP integration (if AD available)
  24. Load testing (k6 @ 100/250/500 VU)

Phase 6 — Documentation & UAT (Week 8)
  25. Write all documentation deliverables (Section 27)
  26. Prepare training materials (Section 28)
  27. Prepare UAT test cases (Section 29)
  28. Run UAT with TEC
  29. Remediate UAT findings
  30. Production go-live
```

---

## 31. Living Documents — Mandatory Maintenance Protocol

> These three files **must** be kept up to date throughout the entire project. Claude must update them at the end of every working session before stopping.

### 31.1 `progress.md` — Session Log

**Location**: `e:/Tender/progress.md`  
**Purpose**: A chronological log of what was done, what was decided, and what is next. Acts as a persistent memory between sessions.

**Update rule**: Claude **must** append a new session block to `progress.md` at the end of every session, even if the session was short. Never overwrite previous entries.

**Required format for each session block**:

```markdown
---
## Session — YYYY-MM-DD HH:MM (timezone)

### What was done
- Bullet list of completed tasks, files created/modified, decisions made

### Decisions & rationale
- Key architectural or design decisions made this session, with reasons

### Blockers / waiting on
- List anything that is blocked (e.g., waiting for server credentials, waiting for client input)

### Next session — TODO
- Ordered list of the very next tasks to pick up
```

### 31.2 `requirements-status.md` — TEC Specification Tracker

**Location**: `e:/Tender/requirements-status.md`  
**Purpose**: The single authoritative tracker for all 58 TEC requirements. Updated whenever any spec item changes status.

**Status values**:

| Status | Meaning |
|---|---|
| `NOT STARTED` | No work done yet |
| `IN PROGRESS` | Actively being worked on this session or next |
| `FRONTEND DONE` | Implemented in the React demo; backend not yet wired |
| `BACKEND DONE` | API + DB layer implemented; frontend may still use mock |
| `DONE` | Fully implemented end-to-end (frontend + backend + tested) |
| `BLOCKED` | Cannot proceed; reason stated in Notes column |
| `N/A (INFRA)` | Infrastructure/operational requirement; not a code task |
| `SEE DOUBT` | Requirement is ambiguous; logged in `doubt.md` |

**Update rule**: After implementing or partially implementing any spec item, update its row in `requirements-status.md` immediately. Do not leave stale statuses.

### 31.3 `doubt.md` — Ambiguity & Clarification Log

**Location**: `e:/Tender/doubt.md`  
**Purpose**: Any TEC requirement that is unclear, contradictory, under-specified, or has an implementation decision that needs client confirmation must be logged here **before** making assumptions.

**Required format for each doubt entry**:

```markdown
---
## DOUBT-XXX — [Short title]

**TEC Spec**: #[number] — [spec title]  
**Raised on**: YYYY-MM-DD  
**Status**: OPEN | RESOLVED | ASSUMED  

### The ambiguity
Clear description of what is unclear or contradictory in the spec.

### Options considered
1. Option A — [description + implications]
2. Option B — [description + implications]

### Assumption made (if proceeding)
If proceeding without client input: state exactly what assumption was made.

### Resolution (if resolved)
Date resolved, who confirmed, and what was decided.
```

**Update rule**: When a doubt is resolved (client clarifies, or assumption is validated), update the entry status to `RESOLVED` or `ASSUMED` and fill in the Resolution section. Never delete doubt entries.

---

### 31.4 Summary — File Maintenance Rules

| File | When to update | Who updates |
|---|---|---|
| `progress.md` | End of **every** Claude session — append new block | Claude |
| `requirements-status.md` | Whenever a spec item changes state | Claude |
| `doubt.md` | As soon as an ambiguity is identified | Claude; resolved by human |

> **Critical**: If Claude starts a new session and has not read all three files, it **must** read them before doing any work. They are the ground truth of project state.
