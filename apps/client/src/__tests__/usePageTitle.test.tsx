import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { BRAND_TITLE, formatPageTitle, usePageTitle } from '../hooks/usePageTitle';

function TitleHarness({ title }: { title?: string | null }) {
  usePageTitle(title);
  return null;
}

describe('usePageTitle', () => {
  beforeEach(() => {
    document.title = 'Initial Title';
  });

  it('formats page titles with the brand suffix and trims whitespace', () => {
    expect(formatPageTitle('Danh sách phòng')).toBe(`Danh sách phòng · ${BRAND_TITLE}`);
    expect(formatPageTitle('  Phòng Họp Alpha  ')).toBe(`Phòng Họp Alpha · ${BRAND_TITLE}`);
    expect(formatPageTitle('')).toBe(BRAND_TITLE);
    expect(formatPageTitle('   ')).toBe(BRAND_TITLE);
    expect(formatPageTitle(null)).toBe(BRAND_TITLE);
    expect(formatPageTitle(undefined)).toBe(BRAND_TITLE);
  });

  it('updates document.title on mount and whenever title changes', () => {
    const { rerender } = render(<TitleHarness title="Chi tiết phòng" />);
    expect(document.title).toBe('Chi tiết phòng · Co-Space');

    rerender(<TitleHarness title="Phòng Họp Beta" />);
    expect(document.title).toBe('Phòng Họp Beta · Co-Space');

    rerender(<TitleHarness title="Chi tiết phòng" />);
    expect(document.title).toBe('Chi tiết phòng · Co-Space');
  });
});
