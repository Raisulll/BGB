// Date helpers. The API speaks ISO; the frontend formats for display as DD-MM-YYYY (CLAUDE.md §9).
// BGB operates in Bangladesh Standard Time (UTC+06:00, no DST).
const BST_OFFSET_MS = 6 * 3_600_000;

/** Calendar year in Bangladesh for the given instant (used for incident reference numbers). */
export const bstYear = (d: Date = new Date()) => new Date(d.getTime() + BST_OFFSET_MS).getUTCFullYear();

/** DATE column → 'YYYY-MM-DD' */
export const toDateString = (d: Date) => d.toISOString().slice(0, 10);

/** TIME column (stored as 1970-01-01THH:MM:00Z) → 'HH:MM' */
export const toTimeString = (d: Date) => d.toISOString().slice(11, 16);

/** 'YYYY-MM-DD' → Date for a DATE column */
export const fromDateString = (s: string) => new Date(`${s}T00:00:00Z`);

/** 'HH:MM' → Date for a TIME column */
export const fromTimeString = (s: string) => new Date(`1970-01-01T${s}:00Z`);

const pad = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' → 'DD-MM-YYYY' (display format, CLAUDE.md rule 1) */
export const toDisplayDate = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;

/** Instant → 'DD-MM-YYYY HH:MM:SS' in Bangladesh time */
export function toBstDisplay(d: Date) {
  const b = new Date(d.getTime() + BST_OFFSET_MS);
  return `${pad(b.getUTCDate())}-${pad(b.getUTCMonth() + 1)}-${b.getUTCFullYear()} ${pad(b.getUTCHours())}:${pad(b.getUTCMinutes())}:${pad(b.getUTCSeconds())}`;
}

/** Start of a calendar day in Bangladesh, as an instant ('2026-10-08' → 2026-10-07T18:00Z) */
export const bstDayStart = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) - BST_OFFSET_MS);

/** Start of the following day in Bangladesh (exclusive upper bound for "to" filters) */
export const bstNextDayStart = (iso: string) => new Date(bstDayStart(iso).getTime() + 86_400_000);
