import { Skeleton } from '@/components/ui/skeleton';

const SKELETON_COUNT = 6;

/** Placeholder grid shown during the first room fetch; mirrors RoomCard proportions. */
export function RoomGridSkeleton() {
  return (
    <div
      className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3"
      aria-busy="true"
      aria-label="Đang nạp danh sách phòng"
    >
      {Array.from({ length: SKELETON_COUNT }, (_, index) => (
        <div
          key={index}
          data-testid="room-card-skeleton"
          className="grid content-start overflow-hidden rounded-xl border bg-card"
        >
          <Skeleton className="aspect-[4/3] w-full rounded-none" />
          <div className="grid gap-3 p-5">
            <Skeleton className="h-6 w-2/3" />
            <div className="flex gap-3">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
            </div>
            <div className="mt-1 flex items-center justify-between border-t pt-4">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
