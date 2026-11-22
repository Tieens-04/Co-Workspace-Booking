import { describe, expect, it } from 'vitest';
import { escapeMysqlLike } from '../utils/mysql-like.util.js';

describe('escapeMysqlLike (CWB-94)', () => {
  it('escapes individual LIKE wildcards and the backslash escape character', () => {
    expect(escapeMysqlLike('%')).toBe('\\%');
    expect(escapeMysqlLike('_')).toBe('\\_');
    expect(escapeMysqlLike('\\')).toBe('\\\\');
  });

  it('escapes repeated and combined special characters without double-escaping', () => {
    expect(escapeMysqlLike('%%')).toBe('\\%\\%');
    expect(escapeMysqlLike('__')).toBe('\\_\\_');
    expect(escapeMysqlLike('\\\\')).toBe('\\\\\\\\');
    expect(escapeMysqlLike('100%_off\\room')).toBe('100\\%\\_off\\\\room');
    expect(escapeMysqlLike('\\%\\_')).toBe('\\\\\\%\\\\\\_');
  });

  it('leaves empty strings, ASCII text, and Vietnamese diacritics unchanged', () => {
    expect(escapeMysqlLike('')).toBe('');
    expect(escapeMysqlLike('Room A-101')).toBe('Room A-101');
    expect(escapeMysqlLike('Phòng Họp Sáng Tạo')).toBe('Phòng Họp Sáng Tạo');
    expect(escapeMysqlLike('nguyenvan@example.com')).toBe('nguyenvan@example.com');
  });
});
