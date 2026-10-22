import type * as React from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** `display` for hero-like customer pages, `default` for admin/detail pages. */
  size?: 'default' | 'display';
  titleId?: string;
  className?: string;
}

/** Page title block: eyebrow, serif heading, lead text and an actions slot, ruled underneath. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  size = 'default',
  titleId,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-6 border-b border-foreground pb-6 md:flex-row md:items-end md:justify-between',
        className,
      )}
    >
      <div className="grid max-w-3xl min-w-0 gap-3">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 id={titleId} className={size === 'display' ? 'text-display-lg' : 'text-h1'}>
          {title}
        </h1>
        {description && (
          <p className="max-w-[62ch] text-[0.9375rem] text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
