import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, RotateCcw, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Reveal } from '@/components/editorial/Reveal';
import { RevealImage } from '@/components/editorial/RevealImage';
import { SplitReveal } from '@/components/editorial/SplitReveal';
import { cn } from '@/lib/utils';
import type { RoomListItem } from '../../types/room';
import { formatVnd } from '../../utils/format';
import { ArchitecturalFallback } from './ArchitecturalFallback';
import type { LandingStatus } from './useLandingRooms';

const FEATURED_COUNT = 3;

interface FeaturedSpacesProps {
  rooms: RoomListItem[];
  status: LandingStatus;
  onRetry: () => void;
}

/** Placement per card: one large photo on the left, up to two smaller ones stacked beside it. */
function placement(index: number, total: number) {
  if (total === 1) return { item: 'lg:col-span-8', frame: 'aspect-[4/3] lg:aspect-[16/10]' };
  if (index === 0) {
    return {
      item: cn('lg:col-span-7', total > 2 && 'lg:row-span-2'),
      frame: 'aspect-[4/3] lg:aspect-[4/5]',
    };
  }
  return { item: 'lg:col-span-5', frame: 'aspect-[4/3]' };
}

/** Dark "works" band: up to three real rooms in an asymmetric grid. */
export function FeaturedSpaces({ rooms, status, onRetry }: FeaturedSpacesProps) {
  const featured = rooms.slice(0, FEATURED_COUNT);

  return (
    <section aria-labelledby="landing-featured-title" className="section-ink py-24 md:py-32">
      <div className="container-page grid gap-12 md:gap-16">
        <header className="grid gap-6 lg:grid-cols-12 lg:items-end lg:gap-12">
          <div className="grid gap-4 lg:col-span-8">
            <p className="eyebrow">Không gian tiêu biểu</p>
            <SplitReveal
              as="h2"
              id="landing-featured-title"
              by="chars"
              duration={1.1}
              className="text-display-xl"
            >
              Chọn nơi hợp với nhịp làm việc.
            </SplitReveal>
          </div>
          <Reveal y={16} duration={0.7} delay={0.3} className="lg:col-span-4 lg:justify-self-end">
            <Link
              to="/rooms"
              className="inline-flex min-h-11 items-center gap-2 font-medium text-on-ink underline decoration-ink-border underline-offset-[6px] transition-colors duration-150 hover:decoration-on-ink"
            >
              Xem tất cả không gian
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </Reveal>
        </header>

        {status === 'loading' && <FeaturedSkeleton />}

        {status === 'error' && (
          <div
            role="alert"
            className="flex flex-col items-start gap-4 border-t pt-8 sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="text-on-ink-muted">
              Không tải được danh sách không gian. Vui lòng thử lại.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={onRetry}
              className="border-on-ink-muted bg-transparent text-on-ink hover:border-on-ink hover:bg-on-ink/5"
            >
              <RotateCcw aria-hidden="true" />
              Thử lại
            </Button>
          </div>
        )}

        {status === 'success' && featured.length === 0 && (
          <p className="border-t pt-8 text-on-ink-muted">
            Chưa có không gian nào để giới thiệu.{' '}
            <Link to="/rooms" className="font-medium text-on-ink underline underline-offset-4">
              Mở trang không gian
            </Link>
          </p>
        )}

        {status === 'success' && featured.length > 0 && (
          <Reveal
            as="ul"
            y={40}
            duration={0.9}
            stagger={0.14}
            className="grid gap-x-8 gap-y-12 lg:grid-cols-12 lg:gap-x-12"
          >
            {featured.map((room, index) => {
              const layout = placement(index, featured.length);
              return (
                <li key={room.id} data-reveal className={layout.item}>
                  <FeaturedCard room={room} frameClassName={layout.frame} large={index === 0} />
                </li>
              );
            })}
          </Reveal>
        )}
      </div>
    </section>
  );
}

interface FeaturedCardProps {
  room: RoomListItem;
  frameClassName: string;
  large: boolean;
}

function FeaturedCard({ room, frameClassName, large }: FeaturedCardProps) {
  const [failed, setFailed] = useState(false);
  const isMaintenance = room.status === 'MAINTENANCE';
  const showImage = Boolean(room.coverImage) && !failed;

  return (
    <article
      data-status={room.status}
      className="group relative grid gap-5 transition-transform duration-300 ease-editorial hover:-translate-y-1 focus-within:-translate-y-1 motion-reduce:transform-none"
    >
      <div className="relative">
        {/* Curtain reveal + gentle desktop drift; the <img> keeps its own CSS hover zoom. */}
        <RevealImage parallax className={cn('rounded-lg bg-on-ink/5', frameClassName)}>
          {showImage ? (
            <img
              src={room.coverImage ?? undefined}
              alt={`Không gian ${room.name}`}
              loading="lazy"
              decoding="async"
              onError={() => setFailed(true)}
              className={cn(
                'size-full object-cover transition-transform duration-500 ease-editorial group-focus-within:scale-[1.04] group-hover:scale-[1.04]',
                isMaintenance && 'opacity-70 grayscale',
              )}
            />
          ) : (
            <ArchitecturalFallback tone="ink" />
          )}
        </RevealImage>
        {isMaintenance && (
          <StatusBadge kind="room" status={room.status} className="absolute top-3 left-3" />
        )}
      </div>

      <div className="grid gap-3 border-t pt-4 sm:grid-cols-[1fr_auto] sm:items-end sm:gap-6">
        <div className="grid gap-2">
          <h3 className={large ? 'text-h1' : 'text-h2'}>{room.name}</h3>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-on-ink-muted">
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <Users aria-hidden="true" className="size-4" strokeWidth={1.75} />
              {`${room.capacity} người`}
            </span>
            <span className="font-semibold text-on-ink tabular-nums">
              {formatVnd(room.pricePerHour)}
            </span>
          </p>
        </div>
        <Link
          to={`/rooms/${room.id}`}
          state={{ from: '/' }}
          aria-label={`Xem chi tiết ${room.name}`}
          className="inline-flex min-h-11 items-center gap-1.5 justify-self-start rounded-sm text-sm font-medium text-on-ink underline decoration-ink-border underline-offset-4 transition-colors duration-150 after:absolute after:inset-0 after:content-[''] group-hover:decoration-on-ink"
        >
          Xem chi tiết
          <ArrowRight
            aria-hidden="true"
            className="size-4 transition-transform duration-200 ease-editorial group-focus-within:translate-x-1 group-hover:translate-x-1"
          />
        </Link>
      </div>
    </article>
  );
}

function FeaturedSkeleton() {
  return (
    <div role="status" className="grid gap-x-8 gap-y-12 lg:grid-cols-12 lg:gap-x-12">
      <span className="sr-only">Đang tải không gian…</span>
      <div aria-hidden="true" className="grid gap-5 lg:col-span-7 lg:row-span-2">
        <div className="aspect-[4/3] rounded-lg bg-on-ink/5 lg:aspect-[4/5]" />
        <div className="h-6 w-1/2 rounded-sm bg-on-ink/5" />
      </div>
      {[0, 1].map((key) => (
        <div key={key} aria-hidden="true" className="grid gap-5 lg:col-span-5">
          <div className="aspect-[4/3] rounded-lg bg-on-ink/5" />
          <div className="h-6 w-2/3 rounded-sm bg-on-ink/5" />
        </div>
      ))}
    </div>
  );
}
