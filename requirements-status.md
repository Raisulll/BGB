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
> Last updated: **2026-10-09** (Session 9 — frontend wired to the API)

---

| Spec# | Title | Status | Layer | Notes |
|:---:|:---|:---|:---|:---|
| 1 | System Type — BIRDS enterprise system | `DONE` | Both | SPA + REST API + PostgreSQL working end-to-end (Session 9); infrastructure items tracked separately below |
| 2 | Centralized web-based, 3-tier architecture | `DONE` | Both | React SPA → `/api/v1` (same-origin proxy) → PostgreSQL; frontend fully on the API, no seed data in the browser (Session 9) |
| 3 | Role-Based Access Control (RBAC) | `DONE` | Both | Server permission middleware + data scopes; UI menus/routes from the user's effective permissions; Admin users + permission matrix on the API (Sessions 5, 7, 9) |
| 4 | Authentication (username/password + AD/LDAP) | `IN PROGRESS` | Both | Backend: bcrypt + RS256 JWT login/refresh/logout/me (Session 4, 30/30 e2e checks). LDAP pending (DOUBT-002) |
| 5 | Incident Registration (create, edit, review, submit) | `DONE` | Both | 3-step wizard on the API: draft, submit, edit/resubmit after return; browser-tested (Session 9) |
| 6 | Incident Classification (categories, subcategories, severity) | `DONE` | Both | Admin > Categories (create, rename unused, add subcategories, (de)activate); form dropdowns from `/incidents/meta` (Session 9) |
| 7 | Incident Details (all fields) | `DONE` | Both | All fields captured in the form and shown on the detail page from the API |
| 8 | Geographical Information (GPS + map) | `DONE` | Both | Device GPS or manual entry (no invented coordinates); detail map + `GET /gis/incidents` map (Session 9) |
| 9 | Border Sector Information (org hierarchy) | `DONE` | Both | Form limited to the user's units; Admin > Org Hierarchy adds units (Session 9) |
| 10 | Evidence & Document Management | `DONE` | Both | Upload in the wizard (type/size checked client-side, content-checked server-side), download, removal with reason; browser-tested (Session 9) |
| 11 | Media Metadata preservation | `DONE` | Both | SHA-256 + EXIF/GPS stored; shown on the detail page with an on-demand integrity check (Session 9) |
| 12 | Incident Timeline (chronological history) | `DONE` | Both | Append-only timeline incl. return/reject reasons and evidence events, shown in BST (Session 9) |
| 13 | Workflow Management (Draft→…→Closed) | `DONE` | Both | Buttons from the server's `actions`; full submit → review → return → resubmit path browser-tested (Session 9) |
| 14 | Verification & Approval (review, return, reject, etc.) | `DONE` | Both | Reason dialog for return/reject; separation of duties and scope enforced by the server |
| 15 | Incident Tracking (unique ref# + search by ref#) | `DONE` | Both | `BIRDS-<year>-NNNN` from the server; search box on the Incidents page |
| 16 | Search Facility (advanced filter) | `DONE` | Both | Server-side filters + pagination; URL-preset filters from the dashboard (Session 9) |
| 17 | Dashboard (role-based KPIs) | `DONE` | Both | All figures from `/reports/*`, scoped per user; invented baseline numbers removed (Session 9) |
| 18 | GIS/Map Dashboard | `DONE` | Both | MapView on `GET /gis/incidents` with server-side filters (Session 9) |
| 19 | Analytics & Statistics | `DONE` | Both | Analytics page on the reports API (severity, sector risk, category with subcategory breakdown); placeholder metrics removed (Session 9) |
| 20 | Trend Analysis (by day/week/month/quarter/year) | `DONE` | Both | Granularity selector + previous-year comparison on `/reports/trends` (Session 9) |
| 21 | Reporting (configurable operational reports) | `DONE` | Both | Reports page on `/reports/operational` (4 templates, all filters) (Session 9) |
| 22 | Export (PDF, Excel, CSV) | `DONE` | Both | Excel/CSV generated and audited by the server, downloaded from Reports, Analytics and Audit; PDF via browser print (DOUBT-004) |
| 23 | Notifications (workflow event alerts) | `IN PROGRESS` | Both | In-app: per-user rows, 30 s polling, unread count, mark read, click-through to the incident (Session 9). Email pending SMTP details |
| 24 | Audit Trail (tamper-evident logging) | `DONE` | Both | Audit page on the API: search, paging, real row/prev hashes, on-demand chain verification, CSV/Excel export (Session 9) |
| 25 | Data Integrity (prevent unauthorized alteration) | `DONE` | Both | Server blocks edits outside Draft/Returned, non-creator edits, invalid transitions and races (409); evidence guards + SHA-256 verify; DB append-only triggers |
| 26 | Data Security (access controls + architecture) | `IN PROGRESS` | Both | RBAC + scopes server-side, Helmet, CORS, rate limits, in-memory access token + httpOnly refresh cookie (Session 9). TLS and encryption at rest pending (#27) |
| 27 | Encryption (HTTPS/TLS + data at rest) | `NOT STARTED` | Infra+Backend | Vercel HTTPS for demo; Nginx TLS + AES-256 at rest needed §20 |
| 28 | Session Security (timeout, concurrent control) | `DONE` | Both | Server idle timeout + single session; client idle sign-out audited as SESSION_TIMEOUT; background polling doesn't keep sessions alive (Session 9) |
| 29 | Password Security (policy + lockout) | `DONE` | Both | Server policy + lockout; change-password page, forced change after reset, admin reset with one-time temporary password (Session 9) |
| 30 | Database (enterprise RDBMS) | `BACKEND DONE` | Backend | PostgreSQL + Prisma 7: all 12 tables migrated and seeded (Session 4) |
| 31 | REST API / Integration interface | `IN PROGRESS` | Backend | `/api/v1` live for auth, users, incidents, evidence, GIS, audit, notifications, reports, admin; consumed by the SPA (Session 9). Pending: backup/log admin routes, OpenAPI docs |
| 32 | AD/LDAP Integration | `NOT STARTED` | Backend | `ldapjs` integration planned §24 — SEE DOUBT-002 |
| 33 | File Storage (centralized + configurable retention) | `IN PROGRESS` | Backend | Storage interface + local-disk driver with quotas (Session 6). S3/MinIO driver and retention job pending |
| 34 | Backup (automated scheduled) | `NOT STARTED` | Backend | Deferred: not needed for the demo version (user decision 2026-10-09). Production plan unchanged: `node-cron` + `pg_dump` §22 Shown in Admin › Operations with a DEMO badge (not functional). |
| 35 | Disaster Recovery | `NOT STARTED` | `N/A (INFRA)` | Deferred for the demo version (user decision 2026-10-09). Production plan: PostgreSQL streaming replication to a DR site, docs §22 Shown in Admin › Operations with a DEMO badge (not functional). |
| 36 | High Availability | `NOT STARTED` | `N/A (INFRA)` | Deferred for the demo version (user decision 2026-10-09). Production plan: PM2 cluster + load balancer Shown in Admin › Operations with a DEMO badge (not functional). |
| 37 | Scalability | `NOT STARTED` | Both | Modular arch + DB indexing planned; load test needed §26 |
| 38 | Concurrent Users (100/250/500) | `NOT STARTED` | Backend | Deferred for the demo version (user decision 2026-10-09). Production plan: k6 load test §26; target unclear (DOUBT-001) Shown in Admin › Operations with a DEMO badge (not functional). |
| 39 | Performance (< 3s response) | `NOT STARTED` | Backend | Deferred for the demo version (user decision 2026-10-09). Production plan: measure under load §26 Shown in Admin › Operations with a DEMO badge (not functional). |
| 40 | Availability (99.5% SLA) | `NOT STARTED` | `N/A (INFRA)` | Deferred for the demo version (user decision 2026-10-09). Production plan: uptime monitoring + hosting SLA Shown in Admin › Operations with a DEMO badge (not functional). |
| 41 | Mobile Responsiveness | `FRONTEND DONE` | Frontend | TailwindCSS responsive throughout |
| 42 | Browser Support (Chrome, Edge, Firefox) | `FRONTEND DONE` | Frontend | Vite + standard ES modules |
| 43 | Localization (English + Bangla) | `FRONTEND DONE` | Both | English complete; Bangla i18n framework not yet added — SEE DOUBT-003 |
| 44 | Data Retention (configurable policy) | `IN PROGRESS` | Both | `data.retention_days` editable in Admin > Security & System (marked as pending); retention/archiving job not built |
| 45 | Data Archiving (with audit trail) | `NOT STARTED` | Backend | Archive endpoint + audit entry needed; no frontend for it yet |
| 46 | Administrative Module | `DONE` | Both | Admin UI fully on the API: users, permissions, categories, org hierarchy, settings, system status (Session 9). Backup/log endpoints Phase 5 |
| 47 | Configuration (without code changes) | `DONE` | Both | Policies, session, retention and backup settings, permissions, categories and hierarchy editable in the Admin UI (Session 9) |
| 48 | Logging & Monitoring | `IN PROGRESS` | Backend | Winston (app/error/security logs) + Morgan HTTP log (Session 4). Daily rotation + `/admin/logs/summary`: deferred for the demo version (user decision 2026-10-09). Shown in Admin › Operations with a DEMO badge (not functional). |
| 49 | Security Hardening (OWASP Top 10) | `IN PROGRESS` | Backend | Helmet, CORS whitelist, rate limits, Zod validation, pinned RS256, generic login errors, `npm audit` clean (Session 4). ZAP scan Phase 4 |
| 50 | Vulnerability Assessment | `NOT STARTED` | Backend | OWASP ZAP + npm audit before UAT §20; report in `docs/security/` |
| 51 | Source Code Ownership | `DONE` | Both | Full source in this repository |
| 52 | Documentation (all manuals) | `IN PROGRESS` | Docs | CLAUDE.md + README done; 7 document sets planned §27 |
| 53 | Training | `NOT STARTED` | Docs | 3 training courses + slides planned §28 |
| 54 | Warranty & Support (1 year) | `NOT STARTED` | `N/A (INFRA)` | Commercial commitment — not a code task |
| 55 | Customization (forms, workflows, hierarchy) | `IN PROGRESS` | Both | Categories, hierarchy, permissions and policies configurable in the Admin UI (Session 9). Custom form fields / workflow stages are not configurable |
| 56 | Deployment (installation + commissioning) | `IN PROGRESS` | Infra+Docs | README deployment guide done; full install guide §27.5 planned |
| 57 | Acceptance Testing (UAT) | `NOT STARTED` | Docs | Test case document + UAT run planned §29 |
| 58 | Future Expansion (GIS, mobile, surveillance) | `FRONTEND DONE` | Both | Leaflet GIS done; modular architecture supports expansion |

---

## Summary

| Status | Count |
|---|---|
| `DONE` | 28 |
| `BACKEND DONE` | 1 |
| `FRONTEND DONE` | 4 |
| `IN PROGRESS` | 11 |
| `NOT STARTED` | 14 |
| **Total** | **58** |
