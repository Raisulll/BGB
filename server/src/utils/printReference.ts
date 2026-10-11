import { prisma } from '../db.js';
import { bstYear } from './formatDate.js';

/**
 * Specs #21, #22, #24 — reference number for a printed document (report or single incident):
 * BGB/BIRDS/RPT/<year>/NNNN from one per-year counter in system_config, so every paper copy carries
 * a unique number that its audit entry names.
 */
export async function allocatePrintReference() {
  const year = bstYear();
  const key = `report.next_serial.${year}`;
  const rows = await prisma.$queryRaw<{ value: string }[]>`
    INSERT INTO system_config (key, value, description, updated_at)
    VALUES (${key}, '2', ${`Next printed document serial number for ${year}`}, now())
    ON CONFLICT (key) DO UPDATE SET value = (system_config.value::int + 1)::text, updated_at = now()
    RETURNING value`;
  return `BGB/BIRDS/RPT/${year}/${String(Number(rows[0]!.value) - 1).padStart(4, '0')}`;
}
