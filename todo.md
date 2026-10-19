# To do (owner)

Internal tasks and notes. Not for the committee; kept out of the submission documents on purpose.
Last updated: 19-10-2026.

## If we win the tender (submitted 18-10-2026, result awaited)

- [ ] Production server tools: read `server/docs/installation-guide/production-tools.md` (Garage/SeaweedFS storage, Barman + restic backup, Uptime Kuma, Prometheus/Grafana/Loki, Wazuh, ClamAV, coturn, internal CA, HA set). Future notes only: not in the demo or the submitted documents.
- [ ] Ask BGB what they already run: Active Directory, mail server, certificate authority, syslog/SIEM, monitoring (Zabbix?), DR site, backup storage.
- [ ] Tell BGB that web push (notifications while the app is closed) needs internet; on the offline intranet only in-app notifications work. Propose the offline plan in `production-tools.md` §4: BIRDS kept open on desktops, self-hosted ntfy for Android phones, SMS backup for Flash Alerts (iPhones not possible offline). Ask BGB which phones officers use and whether a GSM modem is allowed.

## Submission pack

- [ ] Delete `Final Submission Documents/With Signature/16-Request-for-Clarification.docx` (old numbering; the letter is sent separately and is in `Send Separately (signed)/`). Word has it locked; delete it after ending the hidden Word processes.
- [ ] End the two hidden Word processes left by the PDF export (Task Manager: WINWORD, PID 2904 and 16056; keep your own open document).
- [ ] Export PDFs of both sets when wanted: `powershell -ExecutionPolicy Bypass -File tender-submission/build/export-pdf.ps1 -Dir "Final Submission Documents/With Signature"` (and `Without Signature`).
- [ ] Remove the older top-level copies of 01-08 (old numbering) in `Final Submission Documents/` (no signatory name, old demo guide).
- [ ] `Final Submission Documents/With Signature/` is the complete pack to submit (documents, deck, video, diagrams, sample exports). After the load test or any text change, rebuild it with `--signed --out "<With Signature>" --letter-out "<Send Separately (signed)>"` (see the index) and recopy the deck and video as 13/14 if they change. The ZAP raw scan report is not submitted (owner's decision 17-10-2026).
- [ ] Do not hand the committee `00-INDEX-AND-STATUS.md` or `Grace_International_Editable_Notepad.docx`; they are internal / reference only.
- [ ] Add the company seal to the signed documents (01, 04, 06-12 and the clarification letter).
- [ ] 11-Undertakings: review the legal commitments (IP indemnity, monthly support summary) before signing.
- [ ] Request-for-Clarification: decide whether and when to send via e-GP (within 72 hours of tender opening).
- [ ] Watch the 07 video once before submission (re-recorded 16-10-2026; the copy in `With Signature/` is this new one).
- [ ] Company documents: CVs and team chart, certificates (ISO, CMMI, BASIS), trade licence, TIN, BIN, PSR, financial statements, experience certificates, beneficial ownership, tender security, power of attorney.

## Upload size (e-GP limit 2 MB per file)

- [ ] Word documents are all under 2 MB since 17-10-2026 (compact images; Technical Proposal 1.47 MB). `With Signature/01-Compliance-Statement.docx` is still the larger 1.40 MB version (locked by Word); rebuild once Word is closed.
- [ ] Over the limit: 13 presentation (.pptx 17.5 MB, .pdf 12.9 MB) and 14 video (134 MB). Decide how they are submitted (compressed PDF, split, link, or physical media) and check what e-GP allows.

## Load test (last task, idle PC, about 35 min)

- [ ] Run the load test (100, 250, 500, 500 peak) as in `progress.md` (session 2026-10-15 part 9, "Resume"), then rebuild 06 (Performance Test Plan): its Annex A (dry run) appears automatically once results exist.
- [ ] **Check the "measured 650 requests per second" claim.** Technical Proposal §7 (and Annex A item 38) quote a measurement of 15-10-2026, but those runs were declared invalid (`server/loadtest/results/invalid-2026-10-15/`). Confirm or correct the figure with the new runs before submission.

## Before the TEC demonstration (removed from the Demo Guide)

- [ ] The day before: reload the demonstration dataset (`DEMO_RESET=yes npm run db:demo` against the demo database, about 3 minutes; `server/prisma/demo/README.md`), restart the server, then sign in once with each demo account. The dataset has 130 incidents from April 2025 to October 2026 at 32 BOPs in 5 sectors, every workflow state, 361 evidence files, messages, groups, a call log and about 2,500 audit entries. This also removes test chats, calls and test incidents.
- [ ] Ready-made records, if there is no time to file a new one:
  - BIRDS-2026-1072: drone over BOP Himchari; photos with camera data, night video, Bangla PDF; Verified and overdue; the verifier can Approve
  - BIRDS-2026-1080: Submitted; sector_off can Review, Return or Reject
  - BIRDS-2026-1075: Reviewed; the verifier can Verify
  - BIRDS-2026-1068: Approved; hq_admin can Close
  - BIRDS-2026-1067: Returned to batt_op with a reason
  - BIRDS-2026-1070: full history (returned, edited, resubmitted, reviewed, verified, approved, with comments)
  - BIRDS-2025-1002: archived
  - batt_op's drafts: BIRDS-2026-1082 and 1083
- [ ] Open the demo in three browsers (Chrome, Edge, Firefox) or three browser profiles, signed in as batt_op, sector_off and verifier; hq_admin and auditor in a fourth window. One session per user, so each account needs its own browser.
- [ ] Phone and tablet on a network that reaches the demo, BIRDS installed as an app (Chrome: "Install app"; iPhone/iPad Safari: Share › "Add to Home Screen") and notifications on (scene 9 and value additions).
- [ ] A small photograph, a short video and a Word or Excel report on the filing computer (scene 2).
- [ ] Projector at 100 % zoom; language set to English (EN) at the start.
- [ ] For scene 8 (lockout), use a test user, not a demo account.
- [ ] Without internet (intranet demonstration): once beforehand, with internet, `npm run map:download` in `server/` (offline map), `npm run build` in `BGB/` and `server/`. On the day, in `server/`: `npm run db:start`, then `NODE_ENV=production SERVE_SPA_DIR=../BGB/dist npm start` and open http://localhost:4000 in each browser. The phone/tablet parts (install, push) need HTTPS: show them on the online demo or the BGB network.
