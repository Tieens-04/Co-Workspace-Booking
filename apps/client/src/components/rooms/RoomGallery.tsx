import { useState } from 'react';
import { m } from 'motion/react';
import { Expand } from 'lucide-react';
import { Dialog, DialogTrigger } from '@/components/ui/dialog';
import { DURATION, EASE_EDITORIAL } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { RoomImage } from '../../types/room';
import { RoomLightbox } from './RoomLightbox';
import { ROOM_PLACEHOLDER_IMAGE } from './roomPlaceholder';

interface RoomGalleryProps {
  roomName: string;
  images: RoomImage[];
  activeIndex: number;
  onSelect: (index: number) => void;
  failedImageIds: Record<string, boolean>;
  onImageError: (imageId: string) => void;
}

/**
 * Large main photo (opens the lightbox) plus a strip of thumbnail toggles; aria-pressed marks
 * the current one. The lightbox shares `activeIndex`, so closing it leaves the last photo viewed.
 */
export function RoomGallery({
  roomName,
  images,
  activeIndex,
  onSelect,
  failedImageIds,
  onImageError,
}: RoomGalleryProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const activeImage = images[activeIndex];
  const total = images.length;

  return (
    <section aria-label="Bộ sưu tập hình ảnh phòng" className="grid gap-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl border bg-muted sm:aspect-[16/10]">
        {activeImage ? (
          <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
            <DialogTrigger asChild>
              <button
                type="button"
                aria-label={`Phóng to ảnh ${activeIndex + 1} trên ${total}`}
                data-testid="gallery-main-trigger"
                className="group/main block size-full cursor-zoom-in p-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {/* Keyed so each photo fades in when the user picks another thumbnail. */}
                <m.img
                  key={activeImage.id}
                  src={
                    failedImageIds[activeImage.id]
                      ? ROOM_PLACEHOLDER_IMAGE
                      : activeImage.imageUrl || ROOM_PLACEHOLDER_IMAGE
                  }
                  alt={`${roomName} - Ảnh ${activeIndex + 1}`}
                  onError={() => onImageError(activeImage.id)}
                  className="size-full object-cover"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: DURATION.slow, ease: EASE_EDITORIAL }}
                />
                <span
                  aria-hidden="true"
                  className="absolute right-3 bottom-3 inline-flex h-9 items-center gap-2 rounded-full bg-ink/80 px-3.5 text-[0.8125rem] font-semibold text-on-ink tabular-nums backdrop-blur-sm transition-colors duration-200 group-hover/main:bg-ink"
                >
                  <Expand className="size-3.5" />
                  {activeIndex + 1} / {total}
                </span>
              </button>
            </DialogTrigger>
            <RoomLightbox
              roomName={roomName}
              images={images}
              activeIndex={activeIndex}
              onSelect={onSelect}
              failedImageIds={failedImageIds}
              onImageError={onImageError}
            />
          </Dialog>
        ) : (
          <img
            src={ROOM_PLACEHOLDER_IMAGE}
            alt={`${roomName} - Chưa có ảnh`}
            className="size-full object-cover"
          />
        )}
      </div>

      {total > 1 && (
        <div
          role="group"
          aria-label="Danh sách ảnh thu nhỏ"
          className="grid grid-cols-4 gap-2.5 sm:grid-cols-5 lg:grid-cols-6"
        >
          {images.map((image, index) => {
            const selected = index === activeIndex;
            return (
              <button
                key={image.id}
                type="button"
                onClick={() => onSelect(index)}
                aria-label={`Xem ảnh ${index + 1}`}
                aria-pressed={selected}
                className={cn(
                  'aspect-[4/3] cursor-pointer overflow-hidden rounded-lg border-2 p-0 transition-[opacity,border-color] duration-150 ease-editorial outline-none hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  selected ? 'border-foreground opacity-100' : 'border-transparent opacity-60',
                )}
              >
                <img
                  src={failedImageIds[image.id] ? ROOM_PLACEHOLDER_IMAGE : image.imageUrl}
                  alt=""
                  loading="lazy"
                  onError={() => onImageError(image.id)}
                  className="size-full object-cover"
                />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
