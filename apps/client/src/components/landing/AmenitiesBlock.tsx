import { useEffect, useState } from 'react';
import { Reveal } from '@/components/editorial/Reveal';
import { SplitReveal } from '@/components/editorial/SplitReveal';
import { AmenityIcon } from '../rooms/AmenityIcon';
import { roomApi } from '../../services/room.api';
import type { Amenity } from '../../types/room';

/** Light editorial list of the real amenity catalogue. Renders nothing on failure or when empty. */
export function AmenitiesBlock() {
  const [amenities, setAmenities] = useState<Amenity[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    roomApi
      .getAmenities(controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setAmenities(response.data ?? []);
      })
      .catch(() => {
        if (!controller.signal.aborted) setAmenities([]);
      });
    return () => controller.abort();
  }, []);

  if (amenities.length === 0) return null;

  return (
    <section aria-labelledby="landing-amenities-title" className="pt-24 md:pt-32">
      <div className="container-page">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
          <header className="grid content-start gap-4 lg:sticky lg:top-28 lg:col-span-4 lg:self-start">
            <p className="eyebrow">Tiện ích</p>
            <SplitReveal
              as="h2"
              id="landing-amenities-title"
              by="words"
              className="text-display-lg"
            >
              Tiện ích trong từng không gian.
            </SplitReveal>
            <Reveal y={16} duration={0.7} delay={0.2}>
              <p className="max-w-[36ch] text-[0.9375rem] leading-relaxed text-muted-foreground">
                Mỗi phòng có bộ tiện ích riêng. Bạn có thể lọc theo tiện ích khi tìm không gian và
                xem đầy đủ ở trang chi tiết phòng.
              </p>
            </Reveal>
          </header>
          <Reveal
            as="ul"
            y={28}
            duration={0.75}
            stagger={0.07}
            className="grid border-b sm:grid-cols-2 lg:col-span-8 lg:col-start-5"
          >
            {amenities.map((amenity) => (
              <li
                key={amenity.id}
                data-reveal
                className="group grid grid-cols-[auto_1fr] items-start gap-x-4 gap-y-1 border-t py-6 sm:odd:pr-8 sm:even:border-l sm:even:pl-8"
              >
                <span className="row-span-2 inline-flex size-11 items-center justify-center rounded-lg border transition-colors duration-300 ease-editorial group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground">
                  <AmenityIcon icon={amenity.icon} className="size-5" />
                </span>
                <h3 className="text-h3">{amenity.name}</h3>
                {amenity.description && (
                  <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
                    {amenity.description}
                  </p>
                )}
              </li>
            ))}
          </Reveal>
        </div>
      </div>
    </section>
  );
}
