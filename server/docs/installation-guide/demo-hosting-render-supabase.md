# Demo hosting — Render (app) + Supabase (database + evidence storage)

> **Status: BUILT, NOT YET DEPLOYED** (2026-10-09). The code and configuration are in place and tested
> locally; the accounts and the first deployment are still to do. Decided 2026-10-09 (DOUBT-010: no VPS
> available). Scope: the TEC demonstration only, with seed/demo data. **Never put real BGB operational
> data on these services** (foreign commercial cloud). Production stays on BGB-hosted servers
> (CLAUDE.md §15, §22, §26).

## Target layout

```
Browser ──HTTPS──> Render web service "birds-demo" (Singapore)
                   Express: /api/v1/*  +  built SPA (BGB/dist), SERVE_SPA_DIR
                       │                               │
                       │ session pooler, TLS verified  │ S3 protocol
                       ▼                               ▼
                   Supabase Postgres               Supabase Storage, private bucket "evidence"
                   app role "birds" (data only)    files AES-256-GCM encrypted by the app
```

One URL for the frontend and API keeps the refresh cookie first-party (`SameSite=Strict`, path `/api/v1/auth`).

## What is in the repository

| Piece | Where |
|---|---|
| Render Blueprint (service, build/start, health check, env) | `render.yaml` (repo root) |
| SPA served by the API, with its own CSP (OSM tiles, Google Fonts) | `server/src/spa.ts`, env `SERVE_SPA_DIR` |
| S3 storage driver (Supabase Storage / MinIO / AWS) | `server/src/config/storage.ts`, env `STORAGE_DRIVER=s3`, `S3_*` |
| `TRUST_PROXY` accepts a hop count (`1` behind Render's load balancer) | `server/src/config/env.ts` |
| Database privileges for Supabase | `server/prisma/sql/supabase-demo-access.sql` |
| Separate JWT keys for the demo | `npm run keys -- --out keys/render` |

Tested locally (2026-10-09):
- A clean copy of the repo builds with the Blueprint's build command under `NODE_ENV=production`.
- The compiled server serves the SPA.
- In headless Chrome, every page, the map tiles, the fonts, a deep-link reload and Swagger UI load with no CSP violations or console errors.
- Client IPs come through with `TRUST_PROXY=1`.
- The access script works on a simulated Supabase database: `birds` reads and writes data, but can't update the audit log, can't disable its triggers and can't read `_prisma_migrations`; `anon` is denied.

## Things to know

- **Supabase direct connections are IPv6-only**; use the **session pooler** (port 5432). Its user name is
  `<role>.<project-ref>`.
- **TLS**: Supabase's certificate is signed by Supabase's own CA. Download it (step 1.6) and verify against it
  (`sslmode=verify-full&sslrootcert=...`); don't switch verification off.
- **Free Supabase projects pause after 7 days without activity.** Open the site a day before the TEC session.
- **Supabase free plan: 50 MB per stored file, 1 GB storage, 500 MB database.** The demo limits evidence to 49 MB per file.
- **Render Starter plan** (paid) keeps the service always on; the free plan sleeps after 15 minutes and
  takes about a minute to wake.
- **`autoDeploy: false`**: pushing to GitHub doesn't redeploy. Deploy from the dashboard when you choose.
- The SQL editor and the migration commands run as `postgres`; only the app runs as `birds`.

## Step 1 — Supabase

1. Create a project: region **Southeast Asia (Singapore)**. Save the database password in your password manager.
2. **Turn off the Data API**: Project Settings → Data API → disable. BIRDS doesn't use it, and leaving it on
   would expose the `public` schema through the project's public API key.
3. SQL editor, as `postgres`: create the application role (use a long random password):
   ```sql
   CREATE ROLE birds LOGIN PASSWORD '<long random password>' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS CONNECTION LIMIT 10;
   ```
4. Storage → New bucket: name **`evidence`**, **private** (not public), file size limit 50 MB.
5. Storage → Settings → **S3 Connection**: note the endpoint (`https://<ref>.storage.supabase.co/storage/v1/s3`)
   and region, then create an **S3 access key** (access key ID + secret).
6. Project Settings → Database → **SSL Configuration → Download certificate** (`prod-ca-2021.crt` or similar).
   Save it as `server/keys/render/supabase-ca.crt` (git-ignored).
7. Connect → **Session pooler**: copy the host (e.g. `aws-0-ap-southeast-1.pooler.supabase.com`).

Connection strings (replace `<ref>`, `<host>`, the passwords and the certificate path):

```
# Migrations and seed, run from your PC as postgres:
postgresql://postgres.<ref>:<db password>@<host>:5432/postgres?sslmode=verify-full&sslrootcert=E:/Tender/server/keys/render/supabase-ca.crt

# The app on Render, as birds:
postgresql://birds.<ref>:<birds password>@<host>:5432/postgres?sslmode=verify-full&sslrootcert=/etc/secrets/supabase-ca.crt
```

## Step 2 — Schema, seed and privileges (from your PC)

In `server/`, PowerShell:

```powershell
$env:DATABASE_URL = '<postgres connection string from above>'
npm run db:deploy      # prisma migrate deploy
npm run db:seed        # demo users, units, categories, 20 incidents
Remove-Item Env:DATABASE_URL
```

> Not yet tried against Supabase: whether `prisma migrate deploy` accepts `sslrootcert` in the URL. If it
> reports a TLS error, run only that command with `?sslmode=require` instead, and keep `verify-full` for the
> seed and the app.

Then paste `server/prisma/sql/supabase-demo-access.sql` into the SQL editor and run it. The final check
query must return **no rows**. Run it again after any future migration.

## Step 3 — Keys (on your PC)

```powershell
cd server
npm run keys -- --out keys/render          # jwt-private.pem + jwt-public.pem for the demo only
npm run keys:evidence                      # prints EVIDENCE_ENCRYPTION_KEY=...
```

Keep `keys/render/` and the evidence key in your password manager. **Losing the evidence key makes stored
evidence unreadable.** Don't reuse the local development keys.

## Step 4 — Render

1. Push the repository to GitHub (`origin` = `github.com/Raisulll/BGB`).
2. Render dashboard → **New → Blueprint** → select the repo. Render reads `render.yaml` and creates
   `birds-demo` (Singapore, Starter plan).
3. Fill in the values marked "sync: false":
   - `DATABASE_URL`: the `birds` connection string
   - `EVIDENCE_ENCRYPTION_KEY`: from step 3
   - `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`: from step 1.5
   - `APP_BASE_URL` and `CORS_ORIGINS`: `https://birds-demo.onrender.com`, or the URL Render assigns, with no trailing slash
4. Environment → **Secret Files**: add `jwt-private.pem`, `jwt-public.pem` and `supabase-ca.crt` (paste the
   file contents). They appear under `/etc/secrets/`.
5. **Manual Deploy → Deploy latest commit**. The build takes a few minutes. When `/api/v1/health` returns
   `"database":"up"`, Render marks the service live.

## Step 5 — Verify on the live URL

- [ ] `https://<url>/api/v1/health` → `{"status":"ok","database":"up"}`
- [ ] Sign in with each of the 5 demo accounts. Run the full workflow: file → submit → review → verify → approve → close; also return with a reason, and reject
- [ ] Upload evidence, use **Manual Deploy → Restart**, then download it and run **Verify** (hash intact)
- [ ] In Supabase Storage, the object in `evidence/` is unreadable ciphertext (starts with `BIRDSEV1`)
- [ ] Audit Trail → **Verify chain** passes; the latest entries show your real public IP, not a Render address
- [ ] Map tiles, Bangla switch, Excel/CSV exports, print view, `/api/docs`
- [ ] Reload on a deep link (e.g. `/incidents/BIRDS-2026-1005`) keeps you signed in
- [ ] Supabase → Advisors → Security: no table exposed to `anon`/`authenticated`

Then update this file's status line from "BUILT, NOT YET DEPLOYED" to "DEPLOYED" with the date and URL, and
note anything that differed from these steps.
