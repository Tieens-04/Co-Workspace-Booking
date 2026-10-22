import { LoaderCircle } from 'lucide-react';

/** Suspense fallback while a lazily loaded page chunk downloads. */
export function PageLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[50vh] flex-1 items-center justify-center gap-2 text-sm text-muted-foreground"
    >
      <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
      Đang tải trang...
    </div>
  );
}
