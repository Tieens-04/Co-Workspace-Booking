const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/**
 * One CSV cell: neutralizes spreadsheet formulas (CSV/formula injection) by prefixing an
 * apostrophe, then quotes values containing separators, quotes or line breaks (RFC 4180).
 */
export function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && FORMULA_PREFIX.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV document with a UTF-8 BOM so spreadsheet apps detect Vietnamese text correctly. */
export function toCsv(
  rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>,
): string {
  return '﻿' + rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n') + '\r\n';
}
