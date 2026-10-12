# Demo dataset

Data for demonstrating BIRDS to the TEC. **`npm run db:demo` deletes all data** (database rows and
stored evidence files) and loads this dataset in its place. Tests do not use it (they seed from
`prisma/seed.ts`).

```bash
# local database (server/.env)
DEMO_RESET=yes npm run db:demo
# then restart the API (it caches settings)
```

Without `DEMO_RESET=yes` the script only prints the target database and storage and stops.

## What it contains

- **21 users**: the five demo accounts (CLAUDE.md §6) plus battalion operators, sector officers and an
  HQ verifier for every unit (password `Birds@2026`); one deactivated account.
- **5 sectors, 10 battalions, 32 BOPs** at real border locations (Teknaf to Tetulia).
- **About 130 incidents, April 2025 – October 2026**, all categories and severities, written in English
  and Bangla. Every workflow state appears: drafts (and a discarded one), returned with reasons,
  rejected, overdue, archived by the nightly job, closed. Some records were returned and resubmitted
  before approval; many have comments.
- **Evidence on every incident** (about 360 files): real photos and videos (`media/images`,
  `media/videos`, credits in `media/CREDITS.md`) and generated PDF seizure lists and reports
  (`media/docs`). Files go through the normal storage layer, so they are encrypted at rest, hashed
  (SHA-256) and their EXIF metadata is extracted. The EXIF is the source photo's own (camera, original
  capture date), so it does not match the fictional incident dates.
- Workflow **notifications**, **messaging** (direct conversations, three groups with admins, a group
  photo and a pending join request), a **call log**, and an **audit trail** of about 2,500 entries in
  time order (sign-ins, workflow, uploads, administration, exports); the hash chain verifies.

Places are real; people, events and documents are fictional. The PDFs carry a "fictional data" footer.

## Files

| File | Purpose |
|---|---|
| `demo-data.ts` | Users, units and the deterministic incident generator (fixed seed and dates) |
| `demo-templates.ts` | 30 bilingual incident scenarios, comments, return and rejection reasons |
| `demo-seed.ts` | Wipes and loads the database and storage |
| `make-docs.ts` | Renders the PDF documents with Chromium (`npm run db:demo:docs`; needs `PLAYWRIGHT_CORE` and `CHROME`) |
| `media/` | Photos, videos, PDFs, credits |

After changing the dataset, regenerate the PDFs (`make-docs.ts`) so they match.
