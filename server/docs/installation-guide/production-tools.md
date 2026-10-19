# Production server tools (notes for after the contract award)

Status: **future notes only.** None of these tools is used in the demo version or named in the tender documents submitted on 18-10-2026. Written 19-10-2026 while the result is awaited. If BIRDS is awarded, these are candidate third-party tools to run beside BIRDS on BGB's servers for the items deferred in the demo version (CLAUDE.md §20–§26, `todo.md` "If we win the tender"). Use this file as the starting point for the Installation & Deployment Guide and the Backup & Recovery Procedure (CLAUDE.md §27.5, §27.6).

Source: the self-hosted software lists [awesome-selfhosted.net](https://awesome-selfhosted.net/) and its sister list [awesome-sysadmin](https://github.com/awesome-foss/awesome-sysadmin). Infrastructure tools (backup, monitoring, identity) are listed only in awesome-sysadmin; the awesome-selfhosted pages for those categories are empty and point there. Licences below were taken from the lists on 19-10-2026; check them again before installing.

Rules that still apply:
- **Open source only** (OSI licence). Running AGPL tools unmodified on BGB's servers does not affect BIRDS' own licence.
- **Offline intranet**: everything must run without internet access (CLAUDE.md §15).
- **What the submitted proposal says** (for consistency; it does not mention awesome-selfhosted or the tools below): Node.js, PostgreSQL, Nginx, PM2, React, Leaflet, "MinIO or equivalent", coturn, "central NAS or S3-compatible object storage (e.g. MinIO)". The storage choices below fit that wording.

## 1. Recommended

| Need (TEC spec) | Tool | Licence | Listed in | Notes for BIRDS |
|---|---|---|---|---|
| Evidence storage (#33) | **Garage** (first choice) or **SeaweedFS** | AGPL-3.0 / Apache-2.0 | awesome-selfhosted | Works with the existing `STORAGE_DRIVER=s3` (`src/config/storage.ts`, `@aws-sdk/client-s3`), so no code change. Replaces MinIO, which is no longer on the list (its community edition went into maintenance mode in 2025; confirm before deciding). On a single server, `STORAGE_DRIVER=local` on a RAID NAS is simpler. |
| Database backup and PITR (#34) | **Barman** | GPL-3.0 | awesome-sysadmin | Scheduled base backups, WAL archiving and point-in-time recovery for PostgreSQL. Alternative: pgBackRest (on neither list). |
| File and config backup (#34) | **restic** | BSD-2-Clause | awesome-sysadmin | Encrypted, deduplicated backup of evidence storage, `.env`, `server/keys/`, `server/map/`. Alternative: BorgBackup. |
| DR site (#35) | Barman standby + restic repository at the DR site | — | — | The same tools, copied to the second site. RTO/RPO to be agreed with BGB. |
| Availability (#40) | **Uptime Kuma** | MIT | awesome-sysadmin | Checks the API health endpoint; its uptime history is evidence for the 99.5% target. |
| Metrics and dashboards (#48, #39) | **Prometheus** + **Grafana** | Apache-2.0 / AGPL-3.0 | awesome-sysadmin | Server, PostgreSQL and Nginx metrics. Use **Zabbix** (GPL-2.0) instead if BGB already runs it. |
| Central logs (#48) | **Loki** | AGPL-3.0 | awesome-sysadmin | Collects the Winston log files (`server/logs/`) including `security.log`. Alternative: rsyslog to BGB's syslog server. |
| Security events / SIEM (#48, #49) | **Wazuh** | GPL-2.0 | awesome-sysadmin | Reads `security.log` (failed sign-ins, lockouts, denials) and adds host intrusion detection. |
| AD/LDAP test directory (#32) | **Samba AD** (behaves like Active Directory) or **lldap** (light) | GPL-3.0 | awesome-sysadmin | Only for building and testing the `ldapjs` hook (CLAUDE.md §24) without BGB's AD. In production, BIRDS connects to BGB's own AD. Keycloak (Apache-2.0) is listed too but is not needed for AD/LDAP sign-in. |
| Internal TLS certificates (#27) | **Smallstep Certificates** or **easy-rsa** | Apache-2.0 / GPL-2.0 | awesome-sysadmin | Let's Encrypt cannot issue certificates on a closed network. Use BGB's own CA if they have one. HTTPS is required for the installable app (PWA) and for calls. |
| Mail for notifications (#23) | BGB's mail server; if none, **docker-mailserver** or **Stalwart** | MIT / AGPL-3.0 | awesome-selfhosted | Nodemailer works with either (SMTP settings in `.env`). |

## 2. Needed but on neither list

| Need | Tool | Licence | Notes |
|---|---|---|---|
| Antivirus for uploads (#49) | **ClamAV** (clamd) | GPL-2.0 | Connect to the hook in `server/src/modules/evidence/scanner.ts`; today every file is recorded as `scan.status: "not_scanned"`. Signature updates must be brought in offline (local mirror). |
| Call relay (TURN) | **coturn** | BSD-3-Clause | Needed when users are on different network segments. Set `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL` (read by `GET /calls/ice`). Named in the proposal. |
| Connection pooling (#37, #38) | **PgBouncer** | ISC | In front of PostgreSQL when running PM2 in cluster mode. |
| High availability (#36) | **Patroni** + **HAProxy** + **keepalived** | MIT / GPL-2.0 / GPL-2.0 | PostgreSQL failover and a floating IP for the application servers. |
| Vulnerability scan (#50) | **OWASP ZAP** | Apache-2.0 | Already in use (`server/security/zap-plan.yaml`). |

## 3. Not to add

Jitsi, Nextcloud, Mattermost and similar apps: they duplicate what BIRDS already does (messages, calls, file storage) and add to what the security assessment has to cover.

## 4. Limitation to tell BGB

**Web push needs internet.** Browsers deliver push through their makers' services (Google FCM, Mozilla), so on an offline intranet push notifications for calls, messages and alerts while the app is closed will not arrive. No self-hosted tool replaces this. While BIRDS is open, the realtime WebSocket, the notification feed and the 30-second Flash Alert check all work offline. State this in the user and admin manuals.

### Plan for notifications while BIRDS is closed (proposal, 19-10-2026)

Why it can't be fixed inside BIRDS: the browser, not the app, chooses the push service (Chrome → Google FCM, Edge → Microsoft WNS, Safari → Apple APNs, Firefox → Mozilla autopush). Without internet, `pushManager.subscribe()` fails and so does every delivery. Only Firefox can be pointed at a self-hosted service (autopush), which is heavy and covers Firefox only.

Proposed layers, all added beside the current web push (nothing existing changes):

1. **Desktops: keep BIRDS open.** Already works: while the installed app or a tab is open (even minimised), the WebSocket delivers calls, messages and Flash Alerts with the siren. Make it an operating rule: BIRDS stays open on the duty computer.
2. **Android phones: self-hosted ntfy (or Gotify).** ntfy (Apache-2.0/GPL-2.0) or Gotify (MIT), both on awesome-selfhosted, runs on BGB's server; the phone's ntfy/Gotify app holds its own connection, no Google needed. BIRDS also publishes each notification to the user's private topic, next to `webpush.sendNotification()` in `server/src/modules/push/push.service.ts`, with the same content (names only, never message text). Needs per-user access control (ntfy users and tokens), TLS, and a way for users to link their topic (e.g. in Profile). Content sits on BGB's server without web push's end-to-end encryption; acceptable on the intranet, but record it in the security assessment. Limits: iPhones can't (Apple allows background delivery only through APNs); some battery use. Later option: a BIRDS Android app receiving via UnifiedPush (the open standard ntfy implements).
3. **Flash Alerts: SMS backup.** A GSM modem on the server and a self-hosted SMS gateway send a short text ("Flash Alert FA-2026-0012, open BIRDS"). Reaches remote BOPs over the mobile network even without the intranet. Flash Alerts only, perhaps missed calls.
4. **Only if BGB allows it: let through the push services alone.** A firewall rule allowing just the Google/Microsoft/Mozilla push hosts makes the current web push work unchanged. Content is end-to-end encrypted, but the provider sees that a notification was sent and when. Probably not acceptable on a military network; BGB's decision.

Recommendation: 1 + 2 + 3, keeping web push for any network that has internet.

## 5. Follow-up when work starts

- [ ] Choose evidence storage (Garage, SeaweedFS or NAS + local driver) after the server sizing with BGB; update CLAUDE.md §16.1/§21 and `server/README.md` (both still name MinIO as an example).
- [ ] Ask BGB: existing AD, mail server, CA, syslog/SIEM, monitoring (Zabbix?), DR site location, backup storage.
- [ ] Write the backup and DR procedures (§22, §27.6) around Barman + restic, with a restore test.
- [ ] Connect ClamAV to `scanner.ts`; set up an offline signature mirror.
- [ ] Add a metrics endpoint for Prometheus if needed (none exists yet).
