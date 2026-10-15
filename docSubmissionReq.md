# BIRDS Phase II: Tender Submission Document Requirements

**Tender:** Border Incident Reporting & Documentation System (BIRDS), Phase II
**Procuring entity:** Communication Branch, Headquarters Border Guard Bangladesh, Peelkhana, Dhaka

> **Scope note:** The technical specification covers only the technical part of the tender. The commercial and eligibility requirements come from the main tender document (Invitation for Tender, Instructions to Tenderers, Tender Data Sheet). Verify Section 4 against the TDS before submission.

---

## 1. Explicitly required by the technical specification

Missing any of these makes the bid non-responsive.

### 1.1 Compliance statement
- [ ] The 58-row table, reproduced **exactly** as issued
- [ ] "Comply" or "Not Comply" in the Bidder's Response column (no other wording, no "Partially Comply")
- [ ] Specification column untouched: no typo fixes, no rewording, and the `[100/250/500]` bracket in item 38 left as is (para 4: any modification = non-responsive)
- [ ] Signed and sealed by the authorized signatory
- [ ] Separate **cross-reference annex** mapping each item number to the section/page of the technical proposal or demo step that proves it

### 1.2 Demo and documentation (submit both)
- [ ] Working demo build covering as many of the 58 items as possible
- [ ] Demo script walking through the items in order
- [ ] Test login credentials for each role (reporter, reviewer, approver, admin)
- [ ] Screen recording of the full demo as backup
- [ ] Demo runs fully **offline**, including maps (intranet system)

### 1.3 Test results, reports and certificates (para 3)
- [ ] Load/performance test report at the concurrent-user target (items 38–39)
- [ ] Security scan report on the demo build, e.g. OWASP ZAP or Burp (item 49)
- [ ] Browser and device compatibility test report (items 41–42)
- [ ] Functional test cases and results mapped to the spec (item 57)
- [ ] Certificates actually held: ISO 9001, ISO/IEC 27001, CMMI, BASIS membership, staff certifications

---

## 2. Technical proposal: evidence behind every "Comply"

| ✓ | Document | Covers items | Contents |
|---|---|---|---|
| [ ] | Solution architecture & deployment design | 2, 30, 36, 37, 58 | 3-tier diagram, tech stack, intranet deployment topology, HA layout, scaling approach, integration points for future GIS/mobile/surveillance |
| [ ] | Minimum infrastructure requirements | 38–40 | Server/VM sizing, network, OS, DB. Protects response-time and availability commitments, which depend on BGB hardware |
| [ ] | Functional specification with screenshots | 5–9, 12, 15, 16 | Forms with every field from item 7, reference-number format, search filters, incident timeline view |
| [ ] | Workflow & approval design | 13, 14, 23 | State diagram incl. Return/Reject paths, who acts at each stage, notification triggers |
| [ ] | RBAC & org hierarchy matrix | 3, 9, 46 | Roles × permissions × scope (HQ → Region → Sector → Battalion → BOP) |
| [ ] | Security architecture | 4, 24–29, 32, 49 | AD/LDAP integration, password and session settings, TLS and at-rest encryption, tamper-evident audit log (e.g. hash chaining), locking of approved records, OWASP Top 10 mapping |
| [ ] | Database design | 30, 34 | ER diagram, DBMS choice, indexing strategy |
| [ ] | API specification sample | 31 | OpenAPI/Swagger excerpt, auth method |
| [ ] | Evidence & file storage design | 10, 11, 33 | Storage approach, metadata (EXIF) preservation, file hashing for evidence integrity, limits and retention |
| [ ] | GIS approach | 8, 18 | Map library, self-hosted offline tile server, marker and filter configuration |
| [ ] | Reporting & analytics samples | 17, 19–22 | Dashboard screenshots, real sample PDF and Excel/CSV exports, trend charts by day/week/month/quarter/year |
| [ ] | Backup, DR & HA plan | 34–36 | RPO/RTO targets, replication to DR site, restore procedure |
| [ ] | Retention, archiving & logging | 44, 45, 48 | Policy configuration, archived records retrievable with audit trail |
| [ ] | Localization | 43 | Bangla UI screenshots, Unicode handling |

---

## 3. Implementation and commitment documents

Items 50–57 can't be demoed, so they must be proven on paper.

- [ ] **Implementation work plan + Gantt chart** (item 56): installation through commissioning
- [ ] **Data migration approach** (item 56): "Phase II" implies a Phase I system may exist; raise in the clarification query
- [ ] **Testing and UAT plan** (item 57)
- [ ] **Vulnerability assessment plan + undertaking** (item 50): methodology, tools, commitment to fix critical/high findings before acceptance
- [ ] **Training plan** (item 53): by audience (admins, operators, end users), duration, materials, Bangla delivery
- [ ] **Warranty & support plan + signed undertaking** (item 54): SLA table (response/resolution by severity), escalation matrix, local support presence
- [ ] **Source code & IP handover undertaking** (item 51)
- [ ] **Third-party / open-source component list with licenses** (item 51): separates what was built for BGB from what wasn't
- [ ] **Documentation deliverables** (item 52): table of contents for each of the six manuals
  - [ ] System Administration Manual
  - [ ] User Manual (ideally a draft built from the demo)
  - [ ] Installation/Deployment Guide
  - [ ] API Documentation
  - [ ] Database Documentation
  - [ ] Backup/Recovery Procedure
- [ ] **Configuration & customization approach** (items 47, 55): what admins can change without code
- [ ] **Project team**: org chart + CVs of key personnel (PM, architect, developers, DBA, security, QA)

---

## 4. Eligibility and qualification pack

Verify every item against the TDS. PPR 2025 (effective 28 September 2025) makes e-GP mandatory and requires disclosure of the actual beneficial owner, so expect the tender to follow the new standard documents.

- [ ] **Tender forms**: tender submission letter, tenderer information sheet, and any other prescribed forms
- [ ] **Tender security**: amount, form and validity as per TDS
- [ ] **Registrations**: current-FY trade license, e-TIN, VAT BIN, PSR (proof of tax return submission)
- [ ] **Company documents**: certificate of incorporation, MoA/AoA and list of directors, or partnership deed
- [ ] **Authorization**: power of attorney or board resolution for the signatory
- [ ] **Financials**: audited statements (usually last 3 years); bank solvency / liquid-asset certificate (check the required issue-date window)
- [ ] **Experience**: work orders + completion certificates for similar software projects (government/defence preferred)
- [ ] **Beneficial ownership disclosure**
- [ ] **Membership**: BASIS membership certificate
- [ ] **Declarations**: non-debarment, no conflict of interest, integrity
- [ ] **Third-party licenses**: manufacturer's authorization for any commercial software supplied (Oracle, Windows Server, etc.)
- [ ] **JV agreement** (if bidding jointly)
- [ ] **Security-agency extras** (check if required): BGB vendor enlistment, NDA, security vetting of on-site staff

> If the tender uses **one-stage two-envelope**, keep every price out of the technical envelope.

---

## 5. Pitfalls to avoid

- [ ] **Item 38 placeholder:** send a clarification query before the submission deadline asking which figure (100/250/500) applies. If no answer, size and load-test for 500.
- [ ] **No conditional "Comply":** put assumptions in the infrastructure requirements document as recommendations, not as conditions on compliance.
- [ ] **Every "Comply" must survive testing:** para 3 says the application will be acceptance-tested.
- [ ] **72-hour clarification window after opening:** keep someone on standby with every source document ready.
- [ ] **Presentation:** sign, seal and page-number every page; put an index up front.
