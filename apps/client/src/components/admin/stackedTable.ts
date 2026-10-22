/**
 * Class recipes for admin data tables that restyle into stacked cards below `md` (768px).
 * One DOM for every breakpoint (no duplicated mobile markup): rows become cards, the header
 * row is hidden and each cell prints its column name from `data-label`.
 */
export const stackedTable = {
  /** Outer frame: a bordered card on desktop, transparent on mobile (each row is a card). */
  frame: 'rounded-xl border bg-card max-md:rounded-none max-md:border-0 max-md:bg-transparent',
  table: 'max-md:block',
  header: 'max-md:hidden',
  body: 'max-md:grid max-md:gap-3',
  row: 'max-md:grid max-md:grid-cols-2 max-md:gap-x-4 max-md:gap-y-3 max-md:rounded-xl max-md:border-b-0 max-md:bg-card max-md:p-4 max-md:ring-1 max-md:ring-border',
  cell: 'max-md:block max-md:min-w-0 max-md:p-0 max-md:text-left max-md:whitespace-normal max-md:before:mb-1 max-md:before:block max-md:before:text-[0.6875rem] max-md:before:font-semibold max-md:before:tracking-[0.1em] max-md:before:text-muted-foreground max-md:before:uppercase max-md:before:content-[attr(data-label)]',
  /** Cell that spans the full card width on mobile. */
  full: 'max-md:col-span-2',
  /** Cell whose label is redundant on mobile (e.g. the booking code headline). */
  noLabel: 'max-md:before:hidden',
} as const;

/** Column header style shared by admin tables. */
export const adminHeadClass =
  'h-11 px-4 text-[0.6875rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase';
