# BIRDS – Ambiguity & Clarification Log (`doubt.md`)

> Log any unclear, under-specified, or contradictory TEC requirements here **before** making assumptions.  
> Format defined in `CLAUDE.md §31.3`.  
> Never delete entries. Update status when resolved.

---

## DOUBT-001 — Concurrent User Target Not Specified

**TEC Spec**: #38 — Concurrent Users  
**Raised on**: 2026-10-08  
**Status**: OPEN

### The ambiguity
Spec #38 reads: *"The proposed system shall support a minimum of [100/250/500] concurrent users..."*

The value is written in brackets with three options separated by slashes. This is an unfilled placeholder in the tender document — the client has not specified which tier they actually require.

### Options considered
1. **Option A — Target 100 VU**: Minimum viable, easiest to provision and test. Risk: may be undersized if BGB has many field units.
2. **Option B — Target 250 VU**: Middle ground, reasonable for a national border force with sector + battalion operators.
3. **Option C — Target 500 VU**: Conservative enterprise sizing, most expensive to provision but gives best future headroom.
4. **Option D — Design for 500, test at all three**: Architect for 500, run load tests at 100/250/500 and document results for all tiers.

### Assumption made (if proceeding)
**Proceeding with Option D**: Design and implement the backend to support 500 concurrent users (PM2 cluster, connection pooling, indexed queries). Load tests will be run at all three tiers (100/250/500 VU) and all results documented. The TEC can confirm acceptance at whichever tier they require.

### Resolution (if resolved)
*Not yet resolved. Client must clarify during tender Q&A or pre-contract meeting.*

---

## DOUBT-002 — AD/LDAP Infrastructure Availability Unknown

**TEC Spec**: #32 — AD/LDAP Integration  
**Raised on**: 2026-10-08  
**Status**: ASSUMED

### The ambiguity
Spec #32 says the system shall be *"capable of integrating with existing BGB Active Directory/LDAP infrastructure."* It is unclear:
1. Does BGB actually have an Active Directory or LDAP server currently running?
2. If yes, what is the server address, base DN, and bind credentials?
3. Should LDAP be the **primary** authentication method, or a **secondary option** alongside local passwords?
4. If LDAP is unavailable (e.g., network outage), should local password auth be a fallback, or should login be blocked entirely?

### Options considered
1. **Option A — LDAP primary, local fallback**: Try LDAP first; if it fails or LDAP is disabled in config, fall back to local bcrypt auth. Most flexible.
2. **Option B — LDAP only, no fallback**: Pure LDAP. Risk: system unusable if AD server is down.
3. **Option C — Both independent**: Admin can configure each user as either LDAP-authenticated or locally-authenticated. Complex but maximally flexible.

### Assumption made (if proceeding)
**Proceeding with Option A**: Implement LDAP as an optional configurable mode (toggled via `ldap.enabled` in `system_config`). When enabled, LDAP is tried first; failure falls back to local auth. When disabled, only local bcrypt auth is used. This is the safest approach for a tender demo.

### Resolution (if resolved)
*Not yet resolved. Client must provide LDAP server details (URL, base DN, bind credentials) before LDAP integration can be completed and tested.*

**Update 2026-10-09 (Session 10):** Per the user, BGB has not provided directory details yet, so local username/password accounts are the sign-in method (spec #4 marked DONE on that basis). AD/LDAP (spec #32) is deferred and shown in Admin › Security & System as a DEMO card with sample settings. Revisit when BGB supplies the server, bind account and group mapping.

---

## DOUBT-003 — Bangla Localization Depth Unclear

**TEC Spec**: #43 — Localization  
**Raised on**: 2026-10-08  
**Status**: ASSUMED

### The ambiguity
Spec #43 reads: *"Interface shall support English and shall be capable of supporting Bangla labels/content where required."*

The phrase *"where required"* and *"capable of supporting"* is ambiguous:
1. Does TEC expect a **full Bangla UI** (every label translated)?
2. Or just **certain fields** in Bangla (e.g., location names, person names, incident descriptions can be typed in Bangla)?
3. Or just that the system handles Unicode correctly (no garbled text when Bangla is input)?
4. Is a **language toggle** (EN/BN) expected in the interface?

### Options considered
1. **Option A — Unicode input only**: Ensure all text fields accept and correctly store/display Bangla Unicode. No translated UI labels. Minimal effort.
2. **Option B — Language toggle**: Implement i18n (react-i18next) with English as default; Bangla translation strings added for all labels. Full-effort, time-consuming.
3. **Option C — Partial Bangla**: Add a language toggle but only translate critical operational labels (dashboard KPIs, incident categories, workflow status labels) into Bangla.

### Assumption made (if proceeding)
**Proceeding with Option A for now**: All text fields use UTF-8 and correctly handle Bangla Unicode input and display. The i18n framework (`react-i18next`) will be scaffolded but Bangla translation strings are left as a placeholder pending client confirmation on depth of Bangla requirement.

### Resolution (if resolved)
*Not yet resolved. Client must clarify whether a full Bangla UI translation is expected or just Unicode support.*

**Update 2026-10-09 (Session 10):** Implemented: the whole interface (labels, messages, fixed values such as status/severity/role) in English and Bangla with a switcher; data entered by users is shown as entered; exports and e-mails remain English; digits stay Latin. Bangla wording was drafted by the developer and **must be reviewed by a fluent BGB officer** before the TEC demonstration (`BGB/src/i18n/bn.js`).

---

## DOUBT-004 — PDF Export: Browser Print vs. Server-Side

**TEC Spec**: #22 — Export (PDF)  
**Raised on**: 2026-10-08  
**Status**: ASSUMED

### The ambiguity
The spec requires PDF export of reports. The current frontend uses browser `window.print()` with `@media print` CSS. This works for demo but has limitations in a production environment:
- Users must manually select "Save as PDF" in the browser print dialog
- No server-side batch generation possible
- No watermarking or digital signing
- Puppeteer (server-side) would allow programmatic, consistent PDF generation

### Options considered
1. **Option A — Browser print CSS (current)**: Zero backend dependency. Works today. Limited control.
2. **Option B — Server-side Puppeteer**: Headless Chrome renders the report page and returns a PDF binary. Full control, supports classification watermarks, consistent output.
3. **Option C — PDF library (pdfkit/jspdf)**: Programmatic PDF without a browser. Most portable but most effort to format correctly.

### Assumption made (if proceeding)
**Assumed Option B for backend phase**: Keep browser print for the demo. Implement Puppeteer on `GET /reports/export/pdf` in Phase 3 (backend). This satisfies the spec and adds professional-grade PDF output with the confidentiality banner.

### Resolution (if resolved)
**ASSUMED — 2026-10-08**: Proceeding with Puppeteer for production PDF. Browser print kept for demo phase. No client input needed — this is an implementation detail.

**Update — 2026-10-08 (Session 8)**: Server-side PDF is **deferred**. Puppeteer downloads a ~150 MB Chromium and needs extra system libraries on Ubuntu, which matters for an offline or hardened BGB server. Reports print to PDF from the browser (print CSS, with the banner and crest), and CSV/XLSX are generated server-side. Revisit if the TEC requires unattended or scheduled PDF generation.

---

## DOUBT-005 — "Tamper-Evident" Audit Log — Exact Mechanism

**TEC Spec**: #24 — Audit Trail  
**Raised on**: 2026-10-08  
**Status**: ASSUMED

### The ambiguity
Spec #24 requires a *"comprehensive and tamper-evident audit log."* The spec does not define what "tamper-evident" means technically. Options range from database-level rules to cryptographic hash chains.

### Options considered
1. **Option A — DB rules only**: PostgreSQL `RULE` prevents UPDATE/DELETE on `audit_log`. Simple but a DB superuser can bypass rules.
2. **Option B — Hash chain**: Each row stores `SHA256(previous_row_hash + current_row_data)`. Any tampering breaks the chain. More auditor-friendly.
3. **Option C — External log shipping**: Forward logs to a write-once external system (e.g., a separate syslog server). Most secure but adds infrastructure.

### Assumption made (if proceeding)
**Assumed hybrid of A + B**: PostgreSQL `RULE` to block DELETE/UPDATE (documented in §17.9) + an MD5 `row_hash` computed column per row (visible in the AuditTrail UI). This provides demonstrable tamper evidence to TEC without requiring additional infrastructure. Option C can be added in future expansion (spec #58).

### Resolution (if resolved)
**ASSUMED — 2026-10-08**: Proceeding with DB rule + per-row hash. No client input needed.

**Revised — 2026-10-08 (Session 4)**: The planned `GENERATED ALWAYS AS (md5(timestamp::text ...))` column cannot be created (PostgreSQL requires immutable generation expressions; timestamptz→text depends on the session TimeZone). Implemented **Option B** instead: a BEFORE INSERT trigger builds a SHA-256 hash chain (`seq`, `prev_hash`, `row_hash`) under an advisory lock, `audit_log_verify()` reports the first broken link, and UPDATE/DELETE/TRUNCATE raise an exception (rather than a RULE that silently does nothing). This is stronger than A+B as planned and still needs no extra infrastructure.

---

## DOUBT-006 — Incident Reference Number Format (Year Segment)

**TEC Spec**: #15 — Incident Tracking  
**Raised on**: 2026-10-08  
**Status**: ASSUMED

### The ambiguity
The project uses three different reference formats:
- `CLAUDE.md` rule 14 and §7 say `BIRDS-2024-XXX` (3-digit, fixed year 2024)
- `CLAUDE.md` §17.6 / §18 and `seed.js` use `BIRDS-2026-1001` (4-digit, year 2026)
- `AppContext.createIncident()` produces `BIRDS-2024-1021`, so new incidents don't match the seeded ones

### Options considered
1. Option A — Fixed `BIRDS-2026-NNNN`: matches the seed data; the year never rolls over.
2. Option B — `BIRDS-<incident year>-NNNN`, sequence resets each year: the most common government convention; the backend needs a per-year sequence.
3. Option C — `BIRDS-<year>-NNNN` with a global sequence that never resets.

### Assumption made (if proceeding)
Recommended: Option B. The backend generates the ID from a per-year sequence in a transaction. The frontend fix in the meantime: derive the year from `new Date().getFullYear()` and pad to 4 digits. CLAUDE.md rule 14 should then be updated.

### Resolution (if resolved)
**ASSUMED — 2026-10-08 (Session 3)**: The frontend now generates `BIRDS-<current year>-NNNN` with one global sequence, continuing from 1021. Per-year sequence resets (Option B) will be implemented in the backend. CLAUDE.md rule 14 has been updated. Confirm with the client before go-live.

---

## DOUBT-007 — Login Rate Limit vs. Shared Office IP Addresses (NAT)

**TEC Spec**: #49 — Security Hardening (CLAUDE.md §20: "10 login attempts per IP per 15 min")
**Raised on**: 2026-10-08
**Status**: ASSUMED

### The ambiguity
Field units (battalions, BOPs) most likely reach the server through a shared gateway, so many users present the **same IP address**. Read literally, "10 login attempts per IP per 15 min" would block a whole unit after ten ordinary logins. During testing, sharing the limiter with token refresh also blocked normal use.

### Options considered
1. Option A — Literal: count every login attempt per IP. Simple, but locks out shared-IP offices.
2. Option B — Count only **failed** attempts per IP (brute-force protection), and give token refresh a separate, looser limiter. Per-account lockout (5 failures → 15 min) still applies.
3. Option C — Per-IP limits with an allow-list of known BGB gateway addresses.

### Assumption made (if proceeding)
**Option B** is implemented: `loginLimiter` uses `skipSuccessfulRequests`; `refreshLimiter` allows 300 per 15 min. Option C can be added once BGB's network ranges are known.

### Resolution (if resolved)
*Confirm the network topology (NAT/gateway per unit) with BGB IT.*

---

## DOUBT-008 — Data Scoping, Draft Privacy and Separation of Duties

**TEC Spec**: #3 — RBAC "with configurable roles and access scopes"; #14 — Verification & Approval; #25 — Data Integrity
**Raised on**: 2026-10-08
**Status**: ASSUMED

### The ambiguity
The frontend demo shows every incident to every user and lets anyone with a reviewer role act on any incident. Spec #3 asks for "access scopes" but doesn't say what they restrict. Three behaviours had to be decided for the API:
1. **Scope**: can a battalion operator see incidents from other battalions or sectors?
2. **Drafts**: can supervisors see an operator's unsubmitted drafts?
3. **Self-approval**: can someone review/verify/approve an incident they filed (e.g. an HQ Administrator)?

### Options considered
1. Option A — No restrictions (match the demo). Simplest, but weak for a confidential military system and arguably fails "access scopes".
2. Option B — Hierarchical scope (a user sees their node and everything below it), private drafts, and no acting on your own reports.
3. Option C — Option B plus configurable per-role scope overrides in the Admin panel.

### Assumption made (if proceeding)
**Option B** is implemented in the API:
- `users.scope` is matched against `org_hierarchy`: `HQ` = everything, a sector name = that sector, a battalion = that battalion, a BOP = that BOP. Unknown scope = nothing (fail closed). Out-of-scope records return **404**.
- Drafts are visible only to their creator.
- Separation of duties: the creator of an incident cannot take any supervisory action on it.
- Notifications follow the same scope rules.

The frontend demo still shows everything until it is wired to the API. Option C can be added later.

### Resolution (if resolved)
*Confirm with BGB: (a) the visibility rule per role, (b) whether HQ staff may approve their own reports.*

---

## DOUBT-009 — Antivirus Engine for Evidence Uploads

**TEC Spec**: #10 — Evidence Management; #49 — Security Hardening (CLAUDE.md §20 "virus scan hook")
**Raised on**: 2026-10-08
**Status**: OPEN

### The ambiguity
§20 asks for a "virus scan hook" but doesn't name a product. Field-collected evidence (USB transfers from cameras and phones) is a realistic malware path. BGB may already have an endpoint-protection standard that must be used.

### Options considered
1. Option A — ClamAV (clamd) on the application server, called over its INSTREAM socket protocol. Free and self-hosted, but needs signature updates (and an offline mirror if the network is air-gapped).
2. Option B — BGB's existing commercial AV, via its scanning API or ICAP.
3. Option C — No inline scanning; rely on the existing endpoint/server AV scanning the storage volume.

### Assumption made (if proceeding)
The hook exists (`server/src/modules/evidence/scanner.ts`) and runs on every file before storage. With no engine configured, it records `scan.status = "not_scanned"` in the evidence metadata rather than pretending files are clean. Implementing Option A or B is a small, contained change once BGB chooses.

### Resolution (if resolved)
*Ask BGB IT which AV product/standard applies and whether the servers are air-gapped.*

---
## DOUBT-010 — Hosting the Demo for the TEC Now That the Frontend Needs the API

**TEC Spec**: #2 — 3-tier architecture; #56 — Deployment; #27 — HTTPS/TLS
**Raised on**: 2026-10-09
**Status**: RESOLVED (demo hosting)

### The ambiguity
The frontend no longer carries demo data; it needs the API and PostgreSQL behind it on the same origin (the refresh cookie is `SameSite=Strict`, path `/api/v1/auth`). The existing `BGB/vercel.json` deploys the frontend alone, so a Vercel deployment can't sign anyone in (the client reports "Cannot reach the BIRDS API"). We don't know how the TEC will see the system: a live URL, our laptop on site, or BGB's own test server.

### Options considered
1. Option A — One VPS (or BGB test server) running Nginx + the API under PM2 + PostgreSQL, serving `dist/` and proxying `/api/`. Matches the production design (§15, §22, §26) and doubles as the UAT environment.
2. Option B — Keep Vercel for the frontend and add a Vercel rewrite of `/api/*` to an API hosted elsewhere. Keeps the cookie same-origin, but splits the stack across providers.
3. Option C — On-site demonstration from a laptop (`npm run dev` on both projects). No hosting, but no URL the TEC can revisit.

### Assumption made (if proceeding)
None yet; nothing is deployed. Option A is recommended because it is also what production needs. The login page hides the demo-account shortcuts in production builds unless `VITE_SHOW_DEMO_ACCOUNTS=true`.

### Resolution (if resolved)
2026-10-09, user decision (no VPS available): **Option D — Render web service (API + built SPA on one URL) + Supabase Postgres + Supabase Storage for evidence**, both in Singapore. Demo/seed data only; real BGB data never goes on these services, and production stays on BGB-hosted servers (Option A design). Not built yet; plan and findings in `server/docs/installation-guide/demo-hosting-render-supabase.md`.

---
## DOUBT-011 — Must a Draft Incident Be Complete?

**TEC Spec**: #5 — Incident Registration (create, edit, review, submit)
**Raised on**: 2026-10-09
**Status**: ASSUMED

### The ambiguity
The API stores drafts with the same required fields as submitted reports (title, category, severity, date/time, sector/battalion/BOP, description of 10+ characters), because the `incidents` columns are NOT NULL (§17.6). The old demo let an officer save a draft with only a title, date and time. A BOP officer may want to start a report in the field and finish it later.

### Options considered
1. Option A — Keep complete drafts (current). Simple, and statistics never see half-filled rows; but "Save as Draft" is less useful in the field.
2. Option B — Allow partial drafts: make the classification/location/description columns nullable for `status = 'Draft'` only (CHECK constraint), and require them at submit. A schema migration plus validation changes.

### Assumption made (if proceeding)
Option A. The wizard asks for the same fields on "Save as Draft" (sub-category and location are additionally required to submit) and shows the server's field errors inline.

### Resolution (if resolved)
*Ask BGB whether partial drafts are needed by field units.*

---
## DOUBT-012 — Retention Period: Flag or Dispose?

**TEC Spec**: #44 — Data Retention; #45 — Data Archiving
**Raised on**: 2026-10-09
**Status**: ASSUMED

### The ambiguity
Spec #44 asks for a "configurable data retention policy" but doesn't say what happens when a record passes its retention period. Incident records and evidence may be legal evidence; deleting them automatically could breach BGB's records rules.

### Options considered
1. Option A — Flag only: count/list archived records past `data.retention_days` for human review; never delete automatically.
2. Option B — Automatic disposal after retention, with an audit entry.
3. Option C — Disposal on request, by an HQ Administrator (two-person approval), with a disposal certificate in the audit log.

### Assumption made (if proceeding)
Option A. Closed/Rejected incidents are archived after `archive.after_days` (default 365); archived records past `data.retention_days` (default 3650) are counted as "Past retention" in Admin › Security & System. Nothing is deleted. Option C can be added if BGB wants disposal.

### Resolution (if resolved)
*Ask BGB which records rules apply and who may authorise disposal.*
