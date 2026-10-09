# Demo hosting plan — Render (app) + Supabase (database)

> **Status: PLANNED, not built.** Decided 2026-10-09 (DOUBT-010, user decision: no VPS available).
> Scope: the TEC demonstration only, with seed/demo data. **Never put real BGB operational data on these
> services** (foreign commercial cloud). Production stays on BGB-hosted servers (CLAUDE.md §15, §22, §26).

## Target layout

```
Browser ──HTTPS──> Render web service (Singapore)
                   Express: /api/v1/*  +  built SPA (BGB/dist) + SPA fallback
                       │                         │
                       │ session pooler (IPv4)   │ S3 protocol
                       ▼                         ▼
                   Supabase Postgres         Supabase Storage bucket (private)
                   (Singapore)               evidence, AES-256-GCM encrypted by the app
```

One URL for the frontend and API keeps the refresh cookie first-party (`SameSite=Strict`, path `/api/v1/auth`).

## Findings that shaped the plan (checked 2026-10-09)

- **Database works on Supabase without code changes**: no Postgres extensions; audit hash chain uses the built-in
  `sha256()`; every advisory lock is transaction-scoped (`pg_advisory_xact_lock` / `pg_try_advisory_xact_lock`),
  so it also works through Supabase's pooler.
- Supabase's **direct** connection address is IPv6-only; Render can't connect over IPv6 (believed; confirm when
  setting up). Use the **session pooler** connection string (port 5432).
- Render's free-tier filesystem is **wiped on restart/deploy**: local evidence storage would lose files.
- Render free tier **sleeps after ~15 min idle** (~1 min to wake; the mail and archive timers stop meanwhile).
- Frontend on Vercel + API on Render would be two sites: the refresh cookie wouldn't be sent, so every reload
  signs the user out. A Vercel `/api` rewrite would fix that, but the audit log and login rate limits would then
  see Vercel's IPs instead of users'.

## Work items

### 1. Serve the SPA from the API server (code)
- Express serves `BGB/dist` (static, long cache for hashed assets, `no-cache` for `index.html`) and falls back to
  `index.html` for non-`/api` GET routes. Optional via env (e.g. `SERVE_SPA_DIR`) so the Nginx production layout
  is unchanged.
- Check the Helmet CSP against the built SPA (fonts, Leaflet tiles from OpenStreetMap, inline styles, `data:` images).
  The map tiles need `img-src` for the tile host.
- Build command builds both projects; `render.yaml` describes the service.

### 2. S3 storage driver → Supabase Storage (code, spec #33)
- New `STORAGE_DRIVER=s3` beside `local` in `src/config/storage.ts`, wrapped by the existing `EncryptedStorage`.
  Env: endpoint, region, bucket, access key, secret, force-path-style. The same driver serves MinIO/AWS S3 later.
- Supabase: private bucket; S3 access keys from Project Settings → Storage → S3 connection.
- Tests: driver against a fake/local S3 (or MinIO in CI), including tamper detection.

### 3. Supabase setup (manual, by the user)
- Project in **Singapore** (ap-southeast-1).
- Create a non-superuser app role `birds` (login, password); grant it what it has locally. Run migrations and the
  seed as `postgres`, run the app as `birds` (so the app's own login can't disable the audit triggers).
  Write the exact SQL into this guide when doing it.
- `DATABASE_URL` = session pooler string for `birds`; migrations use the `postgres` pooler string.
- Free projects pause after a week without activity: open the site before the TEC session.

### 4. Render setup (manual, by the user)
- Web service in **Singapore**, paid starter plan for the demo (always on), Node 20+.
- **Secret Files**: `jwt-private.pem`, `jwt-public.pem` → `JWT_PRIVATE_KEY_PATH=/etc/secrets/jwt-private.pem`,
  `JWT_PUBLIC_KEY_PATH=/etc/secrets/jwt-public.pem`.
- Env: `NODE_ENV=production`, `DATABASE_URL`, `EVIDENCE_ENCRYPTION_KEY` (`npm run keys:evidence`; keep a copy
  offline: losing it makes evidence unreadable), `TRUST_PROXY=1`, `APP_BASE_URL=https://<service>.onrender.com`,
  `CORS_ORIGINS` = the same URL, storage S3 vars, optional `API_DOCS=true`, optional `VITE_SHOW_DEMO_ACCOUNTS=true`
  at build time, `MAIL_TRANSPORT=none` unless SMTP is available.
- After the first deploy: `prisma migrate deploy` + `prisma db seed` against Supabase (as `postgres`).

### 5. Verify
- Run the full browser workflow (all 5 roles) against the Render URL; upload evidence, restart the service,
  confirm the evidence still downloads and verifies.
- Check `/api/v1/health`, the audit chain verification, and that audit entries show real client IPs.
- Turn this file into a step-by-step guide (from "PLANNED" to tested instructions).
