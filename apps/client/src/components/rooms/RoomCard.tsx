import { memo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Users } from 'lucide-react';
import { StatusBadge } from '@/components/common/StatusBadge';
import { cn } from '@/lib/utils';
import type { RoomListItem } from '../../types/room';
import { formatVnd } from '../../utils/format';
import { AmenityIcon } from './AmenityIcon';
import { ROOM_PLACEHOLDER_IMAGE } from './roomPlaceholder';

const VISIBLE_AMENITIES = 3;

interface RoomCardProps {
  room: RoomListItem;
  /** Where the detail page's back link should return to (current list URL). */
  from: string;
  imageFailed: boolean;
  onImageError: (roomId: string) => void;
}

/**
 * Photo-first room card: 4:3 photo, bold name, capacity + key amenities, price per hour and a
 * "Xem chi tiết" link that covers the whole card. Only MAINTENANCE gets a badge; the list never
 * claims a room is free (availability depends on the date chosen on the detail page).
 */
export const RoomCard = memo(function RoomCard({
  room,
  from,
  imageFailed,
  onImageError,
}: RoomCardProps) {
  const isMaintenance = room.status === 'MAINTENANCE';
  const imgSrc = imageFailed ? ROOM_PLACEHOLDER_IMAGE : room.coverImage || ROOM_PLACEHOLDER_IMAGE;
  const visibleAmenities = room.amenities.slice(0, VISIBLE_AMENITIES);
  const hiddenAmenityCount = room.amenities.length - visibleAmenities.length;

  return (
    <article
      data-status={room.status}
      className="group relative grid h-full grid-rows-[auto_1fr] overflow-hidden rounded-xl border bg-card transition-[transform,border-color,box-shadow] duration-300 ease-editorial focus-within:border-input hover:border-input hover:shadow-soft motion-safe:focus-within:-translate-y-1 motion-safe:hover:-translate-y-1"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        <img
          src={imgSrc}
          alt={room.name}
          onError={() => onImageError(room.id)}
          loading="lazy"
          decoding="async"
          className={cn(
            'size-full object-cover transition-transform duration-[400ms] ease-editorial motion-safe:group-focus-within:scale-[1.03] motion-safe:group-hover:scale-[1.03]',
            isMaintenance && 'opacity-70 grayscale',
          )}
        />
        {isMaintenance && (
          <StatusBadge kind="room" status={room.status} className="absolute top-3 left-3" />
        )}
      </div>

      <div className="grid grid-rows-[auto_1fr_auto] gap-3 p-5">
        <h3 className="text-h3 font-bold">{room.name}</h3>

        <ul
          className="flex flex-wrap content-start gap-x-3.5 gap-y-1.5 text-sm text-muted-foreground"
          aria-label="Tiện ích phòng"
        >
          <li className="inline-flex items-center gap-1.5 font-medium text-foreground tabular-nums">
            <Users aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
            {`${room.capacity} người`}
          </li>
          {visibleAmenities.map((amenity) => (
            <li key={amenity.id} className="inline-flex items-center gap-1.5">
              <AmenityIcon icon={amenity.icon} className="size-3.5" />
              {amenity.name}
            </li>
          ))}
          {hiddenAmenityCount > 0 && <li className="tabular-nums">+{hiddenAmenityCount}</li>}
        </ul>

        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t pt-4">
          <span className="text-[1.0625rem] font-bold tabular-nums">
            {formatVnd(room.pricePerHour)}
          </span>
          <Link
            to={`/rooms/${room.id}`}
            state={{ from }}
            aria-label={`Xem chi tiết ${room.name}`}
            className="inline-flex items-center gap-1.5 rounded-sm text-sm font-semibold text-foreground no-underline after:absolute after:inset-0 after:rounded-xl after:content-['']"
          >
            Xem chi tiết
            <ArrowRight
              aria-hidden="true"
              className="size-4 transition-transform duration-300 ease-editorial group-focus-within:translate-x-1 group-hover:translate-x-1"
            />
          </Link>
        </div>
      </div>
    </article>
  );
});
