import { describe, it, expect } from 'vitest';
import { escapeCsvCell, toCsv } from '../utils/csv.util.js';

const BOM = String.fromCharCode(0xfeff);

describe('CSV export helpers (CWB-69)', () => {
  it.each([
    ['=HYPERLINK("http://x")', `"'=HYPERLINK(""http://x"")"`],
    ['+84901', "'+84901"],
    ['-5', "'-5"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['\tcmd', "'\tcmd"],
  ])('neutralizes formula-leading text %j', (input, expected) => {
    expect(escapeCsvCell(input)).toBe(expected);
  });

  it('quotes separators, quotes and line breaks but keeps numbers as-is', () => {
    expect(escapeCsvCell('Phòng A, tầng 2')).toBe('"Phòng A, tầng 2"');
    expect(escapeCsvCell('Ghế "VIP"')).toBe('"Ghế ""VIP"""');
    expect(escapeCsvCell('dòng 1\ndòng 2')).toBe('"dòng 1\ndòng 2"');
    expect(escapeCsvCell(-5)).toBe('-5');
    expect(escapeCsvCell(null)).toBe('');
  });

  it('prefixes a UTF-8 BOM and uses CRLF rows', () => {
    expect(
      toCsv([
        ['Mã', 'Tiền'],
        ['CS-1', '100.00'],
      ]),
    ).toBe(BOM + 'Mã,Tiền\r\nCS-1,100.00\r\n');
  });
});
