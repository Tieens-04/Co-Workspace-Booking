import { useEffect } from 'react';

export const BRAND_TITLE = 'Co-Space';

export function formatPageTitle(title?: string | null): string {
  const normalized = title?.trim();
  return normalized ? `${normalized} · ${BRAND_TITLE}` : BRAND_TITLE;
}

export function usePageTitle(title?: string | null): void {
  useEffect(() => {
    document.title = formatPageTitle(title);
  }, [title]);
}
