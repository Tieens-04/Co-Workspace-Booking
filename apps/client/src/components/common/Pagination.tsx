import type * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  ariaLabel?: string;
  /** Custom centre text; defaults to "Trang X / Y". */
  info?: React.ReactNode;
  disabled?: boolean;
  testId?: string;
  prevTestId?: string;
  nextTestId?: string;
  infoTestId?: string;
  className?: string;
}

/** Previous / next pager. Accessible names stay "Trang trước" / "Trang sau". */
export function Pagination({
  page,
  totalPages,
  onPageChange,
  ariaLabel = 'Điều hướng phân trang',
  info,
  disabled = false,
  testId,
  prevTestId,
  nextTestId,
  infoTestId,
  className,
}: PaginationProps) {
  const lastPage = Math.max(totalPages, 1);

  return (
    <nav
      aria-label={ariaLabel}
      data-testid={testId}
      className={cn(
        'flex items-center justify-between gap-3 border-t pt-4 sm:flex-wrap',
        className,
      )}
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onPageChange(page - 1)}
        disabled={disabled || page <= 1}
        data-testid={prevTestId}
      >
        <ChevronLeft aria-hidden="true" />
        {/* Label stays the accessible name; it is only visually hidden on narrow screens. */}
        <span className="max-sm:sr-only">Trang trước</span>
      </Button>
      <span className="text-sm text-muted-foreground tabular-nums" data-testid={infoTestId}>
        {info ?? `Trang ${page} / ${lastPage}`}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onPageChange(page + 1)}
        disabled={disabled || page >= lastPage}
        data-testid={nextTestId}
      >
        <span className="max-sm:sr-only">Trang sau</span>
        <ChevronRight aria-hidden="true" />
      </Button>
    </nav>
  );
}
