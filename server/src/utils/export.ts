import type { Response } from 'express';
import * as XLSX from 'xlsx';

// Spec #22 — CSV/XLSX exports. Every export carries the classification banner (CLAUDE.md rule 12).
export const CLASSIFICATION = 'CONFIDENTIAL // OPERATIONAL';

export interface ExportTable {
  title: string; // e.g. "BIRDS OPERATIONAL REPORT"
  subtitle: string; // who/when/filters
  headers: string[];
  rows: (string | number | null)[][];
}

/**
 * CSV injection guard (OWASP): a cell starting with = + - @ or a control character is executed
 * as a formula by spreadsheet apps. Prefix such text with an apostrophe so it stays text.
 */
function neutralise(value: string | number | null) {
  if (value === null) return '';
  if (typeof value === 'number') return String(value);
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

const csvCell = (v: string | number | null) => {
  const s = neutralise(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** RFC 4180 CSV with a UTF-8 BOM so Excel shows Bangla text correctly. */
export function toCsv(t: ExportTable): Buffer {
  const lines = [[CLASSIFICATION], [t.title], [t.subtitle], [], t.headers, ...t.rows].map((r) => r.map(csvCell).join(','));
  return Buffer.from('﻿' + lines.join('\r\n') + '\r\n', 'utf8');
}

export function toXlsx(t: ExportTable, sheetName: string): Buffer {
  // Explicit string cells: SheetJS never turns them into formulas, but neutralise anyway for parity with CSV
  const sheet = XLSX.utils.aoa_to_sheet([[CLASSIFICATION], [t.title], [t.subtitle], [], t.headers, ...t.rows.map((r) => r.map((v) => (typeof v === 'string' ? neutralise(v) : v)))]);
  sheet['!cols'] = t.headers.map((h, i) => ({
    wch: Math.min(60, Math.max(h.length, ...t.rows.slice(0, 200).map((r) => String(r[i] ?? '').length)) + 2),
  }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName.slice(0, 31));
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx', compression: true }) as Buffer;
}

export function sendExport(res: Response, format: 'csv' | 'excel', table: ExportTable, baseName: string, sheetName = 'Report') {
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Cache-Control', 'private, no-store');
  if (format === 'csv') {
    res.type('text/csv; charset=utf-8');
    res.attachment(`${baseName}_${stamp}.csv`);
    res.send(toCsv(table));
  } else {
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.attachment(`${baseName}_${stamp}.xlsx`);
    res.send(toXlsx(table, sheetName));
  }
}
