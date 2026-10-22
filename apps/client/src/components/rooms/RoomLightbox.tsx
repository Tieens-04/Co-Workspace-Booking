import type * as React from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { RoomImage } from '../../types/room';
import { ROOM_PLACEHOLDER_IMAGE } from './roomPlaceholder';

interface RoomLightboxProps {
  roomName: string;
  images: RoomImage[];
  activeIndex: number;
  onSelect: (index: number) => void;
  failedImageIds: Record<string, boolean>;
  onImageError: (imageId: string) => void;
}

const NAV_BUTTON_CLASS =
  'absolute top-1/2 size-11 -translate-y-1/2 rounded-full border-ink-border bg-ink/80 text-on-ink backdrop-blur-sm hover:border-on-ink hover:bg-ink';

/**
 * Full-screen photo viewer rendered inside the gallery's `<Dialog>`. Radix handles Esc, the focus
 * trap and returning focus to the trigger; this adds prev/next buttons, ←/→ keys and a counter.
 * The ink surface stays dark in both themes so photos read well.
 */
export function RoomLightbox({
  roomName,
  images,
  activeIndex,
  onSelect,
  failedImageIds,
  onImageError,
}: RoomLightboxProps) {
  const total = images.length;
  const image = images[activeIndex];
  const hasMany = total > 1;

  const go = (delta: number) => {
    if (!hasMany) return;
    onSelect((activeIndex + delta + total) % total);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      go(1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      go(-1);
    }
  };

  if (!image) return null;

  return (
    <DialogContent
      showCloseButton={false}
      onKeyDown={handleKeyDown}
      data-testid="room-lightbox"
      className="section-ink w-full max-w-[calc(100%-1rem)] gap-3 rounded-2xl border-ink-border bg-ink p-3 text-on-ink sm:max-w-[min(94vw,1280px)] sm:p-4"
    >
      <div className="flex items-center justify-between gap-3 pl-1">
        <DialogTitle className="min-w-0 truncate text-base font-semibold text-on-ink">
          {roomName}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Dùng phím mũi tên trái hoặc phải để chuyển ảnh, phím Esc để đóng.
        </DialogDescription>
        <div className="flex shrink-0 items-center gap-3">
          <p
            className="text-sm text-on-ink-muted tabular-nums"
            aria-live="polite"
            data-testid="lightbox-counter"
          >
            Ảnh {activeIndex + 1} / {total}
          </p>
          <DialogClose asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-ink-border bg-transparent text-on-ink hover:border-on-ink"
            >
              <X aria-hidden="true" />
              Đóng
            </Button>
          </DialogClose>
        </div>
      </div>

      <div className="relative grid min-h-[40dvh] place-items-center overflow-hidden rounded-lg bg-black/40">
        <img
          key={image.id}
          src={failedImageIds[image.id] ? ROOM_PLACEHOLDER_IMAGE : image.imageUrl}
          alt={`${roomName} - Ảnh ${activeIndex + 1} trên ${total}`}
          onError={() => onImageError(image.id)}
          className="max-h-[78dvh] w-auto max-w-full object-contain"
        />

        {hasMany && (
          <>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={`${NAV_BUTTON_CLASS} left-2 sm:left-3`}
              onClick={() => go(-1)}
              aria-label="Ảnh trước"
            >
              <ChevronLeft aria-hidden="true" className="size-5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={`${NAV_BUTTON_CLASS} right-2 sm:right-3`}
              onClick={() => go(1)}
              aria-label="Ảnh tiếp theo"
            >
              <ChevronRight aria-hidden="true" className="size-5" />
            </Button>
          </>
        )}
      </div>
    </DialogContent>
  );
}
