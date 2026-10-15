# BIRDS – TEC Requirements Status Tracker

> **Source of truth**: `projectDetails.md` (58 items)  
> **Status legend** — defined in `CLAUDE.md §31.2`:
> - `NOT STARTED` — no work done
> - `IN PROGRESS` — actively being worked on
> - `FRONTEND DONE` — React demo implements this; backend not yet wired
> - `BACKEND DONE` — API + DB layer done; frontend may still use mock data
> - `DONE` — fully implemented end-to-end, tested
> - `BLOCKED` — blocked, reason in Notes
> - `N/A (INFRA)` — infrastructure/ops requirement, not a code task
> - `SEE DOUBT` — ambiguity logged in `doubt.md`
>
> **Update rule**: Update this file immediately whenever a spec item changes state.  
> Last updated: **2026-10-11** (Session 13 — messaging, calls, push notifications, installable app, live demo on Render)

---

| Spec# | Title | Status | Layer | Notes |
|:---:|:---|:---|:---|:---|
| 1 | System Type — BIRDS enterprise system | `DONE` | Both | SPA + REST API + PostgreSQL working end-to-end (Session 9); infrastructure items tracked separately below |
| 2 | Centralized web-based, 3-tier architecture | `DONE` | Both | React SPA → `/api/v1` (same-origin proxy) → PostgreSQL; frontend fully on the API, no seed data in the browser (Session 9) |
| 3 | Role-Based Access Control (RBAC) | `DONE` | Both | Server permission middleware + data scopes; UI menus/routes from the user's effective permissions; Admin users + permission matrix on the API (Sessions 5, 7, 9) |
| 4 | Authentication (username/password + AD/LDAP) | `DONE` | Both | Local accounts: bcrypt + RS256 JWT, refresh cookie, lockout, forced change after reset (Sessions 4, 9). AD/LDAP shown as DEMO in Admin › Security & System until BGB supplies directory details (user decision 2026-10-09; DOUBT-002) |
| 5 | Incident Registration (create, edit, review, submit) | `DONE` | Both | 3-step wizard on the API: draft, submit, edit/resubmit after return; browser-tested (Session 9) |
| 6 | Incident Classification (categories, subcategories, severity) | `DONE` | Both | Admin > Categories (create, rename unused, add subcategories, (de)activate); form dropdowns from `/incidents/meta` (Session 9) |
| 7 | Incident Details (all fields) | `DONE` | Both | All fields captured in the form and shown on the detail page from the API |
| 8 | Geographical Information (GPS + map) | `DONE` | Both | Device GPS or manual entry (no invented coordinates); detail map + `GET /gis/incidents` map (Session 9). 2026-10-15: offline map (no internet): `server/map/bangladesh.pmtiles` served by the API, drawn with protomaps-leaflet, Bangla place names |
| 9 | Border Sector Information (org hierarchy) | `DONE` | Both | Form limited to the user's units; Admin > Org Hierarchy adds units (Session 9) |
| 10 | Evidence & Document Management | `DONE` | Both | Upload in the wizard (type/size checked client-side, content-checked server-side), download, removal with reason; browser-tested (Session 9) 2026-10-15: office documents accepted (Word, Excel, PowerPoint current/legacy, OpenDocument, RTF; detected on content, macro-enabled refused); document properties kept (#11). |
| 11 | Media Metadata preservation | `DONE` | Both | SHA-256 + EXIF/GPS stored; shown on the detail page with an on-demand integrity check (Session 9) |
| 12 | Incident Timeline (chronological history) | `DONE` | Both | Append-only timeline incl. return/reject reasons and evidence events, shown in BST (Session 9). Session 12: append-only comments (DB triggers), time-in-current-step (`status_changed_at`, DB trigger) |
| 13 | Workflow Management (Draft→…→Closed) | `DONE` | Both | Buttons from the server's `actions`; full submit → review → return → resubmit path browser-tested (Session 9) |
| 14 | Verification & Approval (review, return, reject, etc.) | `DONE` | Both | Reason dialog for return/reject; separation of duties and scope enforced by the server. Session 12: return/reject reason banner on the incident and edit form; "Needs my action" view; overdue flag (`workflow.overdue_days`) in lists, detail, filter and dashboard 2026-10-15: reviewer **modifies** a report before approval (Submitted/Reviewed/Verified, officer with a workflow action at that stage, never own report): reason required, `MODIFY_INCIDENT` audit with old → new values, "Modified by reviewer" timeline entry, filer notified. |
| 15 | Incident Tracking (unique ref# + search by ref#) | `DONE` | Both | `BIRDS-<year>-NNNN` from the server; search box on the Incidents page |
| 16 | Search Facility (advanced filter) | `DONE` | Both | Header search (reference number or title, suggestions, "/" shortcut; Session 12). Server-side filters + pagination; URL-preset filters from the dashboard (Session 9). Session 12: views All / Needs my action / My incidents / My drafts, date range, Sector→Battalion→BOP filters, sort; view + filters kept in the URL 2026-10-15: incident type (sub-category) filter on Incidents and in the shared report filters. |
| 17 | Dashboard (role-based KPIs) | `DONE` | Both | All figures from `/reports/*`, scoped per user; invented baseline numbers removed (Session 9). Session 12: "Waiting for you" work queue; period selector (7/30/90 days, year, custom) for KPIs, charts and trend 2026-10-15: "Verified" card (passed verification: Verified, Approved, Closed; `summary.verified`). |
| 18 | GIS/Map Dashboard | `DONE` | Both | MapView on `GET /gis/incidents` with server-side filters (Session 9). Session 12: date range, marker clustering (severity-coloured) and severity-weighted heatmap; related incidents (same BOP / 5 km) on the detail page. 2026-10-11: map framed on Bangladesh and the border strip (no panning/zooming away, outside masked) 2026-10-12: clicking a point zooms in on it; zoom in/out and close (back to the whole map) buttons while zoomed in; one point per BOP with "Show all N incidents" (incidents list filtered to that BOP and the map filters) and the map restored as left on return. |
| 19 | Analytics & Statistics | `DONE` | Both | Analytics page on the reports API (severity, sector risk, category with subcategory breakdown); placeholder metrics removed (Session 9) 2026-10-12: trend as lines (incidents, high/critical, previous year), category as sorted bars, hotspot BOPs and time-of-day/weekday patterns (`/reports/by-location`, `/reports/by-time`), every chart opens the matching incidents. |
| 20 | Trend Analysis (by day/week/month/quarter/year) | `DONE` | Both | Granularity selector + previous-year comparison on `/reports/trends` (Session 9) |
| 21 | Reporting (configurable operational reports) | `DONE` | Both | Reports page on `/reports/operational` (4 templates, all filters) (Session 9). 2026-10-11: Reports page redesigned as a formal BGB document (letterhead, classification on every page, server-issued reference `BGB/BIRDS/RPT/<year>/NNNN`, numbered sections per template, signature blocks, distribution, page numbers; EN/BN); each print audited (`PRINT_REPORT`). On screen an in-app overview; Print / PDF opens a preview of the formal document, which is what prints. Optional Annex A: every incident in full on its own page with evidence (photos shown, video still frames, documents listed, SHA-256), max 100. Single-incident print uses the same formal layout and preview (reference from the same series, signatures prefilled from the record history). Layout assumed until BGB sends a sample (DOUBT-016) |
| 22 | Export (PDF, Excel, CSV) | `DONE` | Both | Excel/CSV generated and audited by the server, downloaded from Reports, Analytics and Audit; PDF via browser print (DOUBT-004). Session 12: single-incident print/PDF with crest, banner, timeline, evidence hashes, comments; each print audited (`PRINT_INCIDENT`). 2026-10-11: Reports page redesigned as a formal BGB document (letterhead, classification on every page, server-issued reference `BGB/BIRDS/RPT/<year>/NNNN`, numbered sections per template, signature blocks, distribution, page numbers; EN/BN); each print audited (`PRINT_REPORT`). On screen an in-app overview; Print / PDF opens a preview of the formal document, which is what prints. Optional Annex A: every incident in full on its own page with evidence (photos shown, video still frames, documents listed, SHA-256), max 100. Single-incident print uses the same formal layout and preview (reference from the same series, signatures prefilled from the record history). Layout assumed until BGB sends a sample (DOUBT-016) |
| 23 | Notifications (workflow event alerts) | `DONE` | Both | In-app per-user notifications (Session 9) + e-mail via transactional outbox for submission/approval/rejection/return (Session 10). E-mail switches on when SMTP details are set; tested with the json transport. Session 12: comment notifications (in-app). 2026-10-11: web push to phones/browsers for calls and messages while BIRDS is closed (names only, never message text; bound to the sign-in session; DOUBT-015) |
| 24 | Audit Trail (tamper-evident logging) | `DONE` | Both | Audit page on the API: search, paging, real row/prev hashes, on-demand chain verification, CSV/Excel export (Session 9). 2026-10-11: group admin actions, call declines and push device on/off are audited too |
| 25 | Data Integrity (prevent unauthorized alteration) | `DONE` | Both | Server blocks edits outside Draft/Returned, non-creator edits, invalid transitions and races (409); evidence guards + SHA-256 verify; DB append-only triggers |
| 26 | Data Security (access controls + architecture) | `IN PROGRESS` | Both | RBAC + scopes, Helmet, CORS, rate limits, in-memory access token + httpOnly cookie; evidence encrypted at rest (Session 10). TLS deployment config pending (#27) |
| 27 | Encryption (HTTPS/TLS + data at rest) | `IN PROGRESS` | Infra+Backend | Evidence files AES-256-GCM at rest, key required in production (Session 10). Pending: Nginx TLS config; DB volume encryption is an infrastructure task |
| 28 | Session Security (timeout, concurrent control) | `DONE` | Both | Server idle timeout + single session; client idle sign-out audited as SESSION_TIMEOUT; background polling doesn't keep sessions alive (Session 9). Session 12: profile page shows own sessions + sign-in events, "sign out other sessions". 2026-10-11: push notifications stop as soon as the session is signed out or revoked |
| 29 | Password Security (policy + lockout) | `DONE` | Both | Server policy + lockout; change-password page, forced change after reset, admin reset with one-time temporary password (Session 9) |
| 30 | Database (enterprise RDBMS) | `DONE` | Backend | PostgreSQL + Prisma 7; 3 migrations, integrity CHECKs and append-only triggers |
| 31 | REST API / Integration interface | `DONE` | Backend | All §19 groups live + archive/mail admin routes (Session 10). OpenAPI 3.1 in `server/docs/api/openapi.yaml`, served at `/api/v1/openapi.json` + Swagger UI `/api/docs` (on outside production, `API_DOCS`); a test keeps it valid and in step with the routers (Session 11). Backup routes deferred with #34 |
| 32 | AD/LDAP Integration | `NOT STARTED` | Backend | Deferred until BGB provides directory details (user decision 2026-10-09, DOUBT-002). Shown in Admin › Security & System with a DEMO badge |
| 33 | File Storage (centralized + configurable retention) | `IN PROGRESS` | Backend | Storage interface + local-disk driver with quotas (Session 6); S3-compatible driver (`STORAGE_DRIVER=s3`: MinIO / AWS S3 / Supabase Storage), encrypted like local (Session 12). Retention flags past-retention records (Session 10); disposal rule open (DOUBT-012). Group photos and voice messages use the same encrypted storage with SHA-256 checks (2026-10-11) |
| 34 | Backup (automated scheduled) | `NOT STARTED` | Backend | Deferred: not needed for the demo version (user decision 2026-10-09). Production plan unchanged: `node-cron` + `pg_dump` §22 Shown in Admin › Operations with a DEMO badge (not functional). |
| 35 | Disaster Recovery | `NOT STARTED` | `N/A (INFRA)` | Deferred for the demo version (user decision 2026-10-09). Production plan: PostgreSQL streaming replication to a DR site, docs §22 Shown in Admin › Operations with a DEMO badge (not functional). |
| 36 | High Availability | `NOT STARTED` | `N/A (INFRA)` | Deferred for the demo version (user decision 2026-10-09). Production plan: PM2 cluster + load balancer Shown in Admin › Operations with a DEMO badge (not functional). |
| 37 | Scalability | `NOT STARTED` | Both | Modular arch + DB indexing planned; load test needed §26 |
| 38 | Concurrent Users (100/250/500) | `NOT STARTED` | Backend | Deferred for the demo version (user decision 2026-10-09). Production plan: k6 load test §26; target unclear (DOUBT-001) Shown in Admin › Operations with a DEMO badge (not functional). |
| 39 | Performance (< 3s response) | `NOT STARTED` | Backend | Deferred for the demo version (user decision 2026-10-09). Production plan: measure under load §26 Shown in Admin › Operations with a DEMO badge (not functional). |
| 40 | Availability (99.5% SLA) | `NOT STARTED` | `N/A (INFRA)` | Deferred for the demo version (user decision 2026-10-09). Production plan: uptime monitoring + hosting SLA Shown in Admin › Operations with a DEMO badge (not functional).. Demo hosting: the free Render service keeps itself awake (`KEEP_AWAKE_MINUTES`); an outside uptime monitor (UptimeRobot) is recommended as backup and record |
| 41 | Mobile Responsiveness | `DONE` | Frontend | Verified at 390 / 820 / 1440 px with no horizontal overflow (Session 10). Installable as an app on phones (PWA: manifest, icons, service worker caching app files only; opens offline with a notice; safe areas on iPhone), 2026-10-11 |
| 42 | Browser Support (Chrome, Edge, Firefox) | `DONE` | Frontend | Verified in Chrome, Edge and Firefox; full workflow e2e passes in Chrome and Firefox (Session 10) |
| 43 | Localization (English + Bangla) | `DONE` | Frontend | Full English/Bangla interface with switcher, bundled Bengali font, translated API errors; `npm run i18n:check` (Session 10). User data is shown as entered. Bangla wording needs review by a fluent officer (DOUBT-003) |
| 44 | Data Retention (configurable policy) | `DONE` | Both | `data.retention_days` + `archive.after_days` editable; records past retention flagged for review, never auto-deleted (Session 10, DOUBT-012) |
| 45 | Data Archiving (with audit trail) | `DONE` | Both | Archive/restore + daily job, timeline + audit entries, archive filter in UI (Session 10) |
| 46 | Administrative Module | `DONE` | Both | Admin UI fully on the API: users, permissions, categories, org hierarchy, settings, system status (Session 9). Backup/log endpoints Phase 5 |
| 47 | Configuration (without code changes) | `DONE` | Both | Policies, session, retention and backup settings, permissions, categories and hierarchy editable in the Admin UI (Session 9). Session 12: `workflow.overdue_days` (Admin › Security & System › Workflow) |
| 48 | Logging & Monitoring | `IN PROGRESS` | Backend | Winston (app/error/security logs) + Morgan HTTP log (Session 4). Daily rotation + `/admin/logs/summary`: deferred for the demo version (user decision 2026-10-09). Shown in Admin › Operations with a DEMO badge (not functional). |
| 49 | Security Hardening (OWASP Top 10) | `IN PROGRESS` | Backend | Helmet, CORS whitelist, rate limits, Zod validation, pinned RS256, generic login errors, `npm audit` clean (Session 4). ZAP scan Phase 4 |
| 50 | Vulnerability Assessment | `NOT STARTED` | Backend | OWASP ZAP + npm audit before UAT §20; report in `docs/security/` |
| 51 | Source Code Ownership | `DONE` | Both | Full source in this repository |
| 52 | Documentation (all manuals) | `IN PROGRESS` | Docs | CLAUDE.md + READMEs done; API documentation (OpenAPI 3.1 + Swagger UI) done (Session 11). Remaining sets §27: user, admin, DB schema, installation, backup/recovery, security |
| 53 | Training | `NOT STARTED` | Docs | 3 training courses + slides planned §28 |
| 54 | Warranty & Support (1 year) | `NOT STARTED` | `N/A (INFRA)` | Commercial commitment — not a code task |
| 55 | Customization (forms, workflows, hierarchy) | `IN PROGRESS` | Both | Categories, hierarchy, permissions and policies configurable in the Admin UI (Session 9). Custom form fields / workflow stages are not configurable |
| 56 | Deployment (installation + commissioning) | `IN PROGRESS` | Infra+Docs | README deployment guide done; full install guide §27.5 planned. TEC demo hosting: Render + Supabase (DOUBT-010). Built and tested locally in Session 12 (`render.yaml`, SPA served by the API, S3 driver, Supabase access SQL, step-by-step guide in `server/docs/installation-guide/demo-hosting-render-supabase.md`). **Live since 2026-10-10** at https://birds-demo.onrender.com (all migrations applied on Supabase, TURN relay and VAPID keys configured). Remaining: full installation guide for BGB servers (§27.5) |
| 57 | Acceptance Testing (UAT) | `NOT STARTED` | Docs | Test case document + UAT run planned §29 |
| 58 | Future Expansion (GIS, mobile, surveillance) | `DONE` | Both | Leaflet GIS done; modular architecture supports expansion. Session 12 extension (owner request, DOUBT-013): direct/group messaging, voice messages, 1:1 WebRTC audio calls and call log over a realtime WebSocket channel (PostgreSQL LISTEN/NOTIFY bus for multi-process); permission `messages`; server tests + headless browser suite pass. Session 13: calls survive reconnects, Messenger-style chat, one-tap voice, group admins (requests, remove, roles, rename, photo; DOUBT-014), push notifications with ringing call notifications and Answer/Decline (DOUBT-015), installable app (PWA), GIS map framed on Bangladesh; live on Render |

---

## Summary

| Status | Count |
|---|---|
| `DONE` | 38 |
| `FRONTEND DONE` | 0 |
| `IN PROGRESS` | 8 |
| `NOT STARTED` | 12 |
| **Total** | **58** |
