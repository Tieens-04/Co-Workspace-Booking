import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Reveal } from '@/components/editorial/Reveal';
import { RevealImage } from '@/components/editorial/RevealImage';
import { SplitReveal } from '@/components/editorial/SplitReveal';
import { DESKTOP_MOTION_OK, gsap, useGSAP } from '@/lib/gsap';
import type { RoomListItem } from '../../types/room';
import { ArchitecturalFallback } from './ArchitecturalFallback';
import type { LandingStatus } from './useLandingRooms';

interface HeroProps {
  /** First real room that has a cover photo, if any. */
  room: RoomListItem | undefined;
  status: LandingStatus;
}

/**
 * Light hero: oversized headline whose letters rise out of their lines, the lead + CTA beside it
 * (in the first viewport on desktop and phone), then a wide real room photo that opens like a
 * curtain. On desktop the headline drifts up as the photo scrolls in.
 */
export function Hero({ room, status }: HeroProps) {
  const headRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const head = headRef.current;
    if (!head || typeof window.matchMedia !== 'function') return;
    const mm = gsap.matchMedia();
    mm.add(DESKTOP_MOTION_OK, () => {
      gsap.to(head, {
        y: -64,
        opacity: 0.35,
        ease: 'none',
        scrollTrigger: { trigger: head, start: 'top 15%', end: 'bottom -20%', scrub: 0.5 },
      });
    });
    return () => mm.revert();
  });

  return (
    <section aria-labelledby="landing-hero-title" className="pt-10 pb-16 md:pt-16 md:pb-24">
      <div className="container-page">
        <div className="grid gap-8 lg:grid-cols-12 lg:items-end lg:gap-12">
          <div ref={headRef} className="lg:col-span-8">
            <Reveal immediate y={16} duration={0.6}>
              <p className="eyebrow mb-6 md:mb-8">
                Co-Space Working · Không gian làm việc theo giờ
              </p>
            </Reveal>
            <SplitReveal
              as="h1"
              id="landing-hero-title"
              by="chars"
              trigger="mount"
              delay={0.15}
              duration={1.1}
              className="text-hero"
            >
              Không gian cho <br className="hidden sm:block" />ý tưởng lớn.
            </SplitReveal>
          </div>

          {/* The primary action is never hidden or delayed: only the lead fades in. */}
          <div className="flex flex-col gap-6 lg:col-span-4 lg:pb-3">
            <Reveal immediate y={16} duration={0.8} delay={0.55}>
              <p className="max-w-[32ch] text-lg leading-relaxed text-muted-foreground md:text-xl">
                Tìm nơi làm việc phù hợp. Chọn thời gian. Đặt chỗ dễ dàng.
              </p>
            </Reveal>
            <div>
              <Button asChild size="lg" className="group">
                <Link to="/rooms">
                  Khám phá không gian
                  <ArrowRight
                    aria-hidden="true"
                    className="transition-transform duration-300 ease-editorial group-hover:translate-x-1"
                  />
                </Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-10 md:mt-14">
          <figure className="grid gap-3">
            {/* Key by room so a failed image state never leaks to another photo. */}
            <HeroPhoto key={room?.id ?? 'none'} room={status === 'success' ? room : undefined} />
            {status === 'success' && room && (
              <figcaption className="flex items-baseline justify-between gap-4 border-t pt-3 text-sm">
                <span className="eyebrow">Trong ảnh</span>
                <Link
                  to={`/rooms/${room.id}`}
                  state={{ from: '/' }}
                  className="inline-flex min-h-11 items-center gap-1 font-medium underline decoration-input underline-offset-4 transition-colors duration-150 hover:decoration-foreground"
                >
                  {room.name}
                  <ArrowUpRight aria-hidden="true" className="size-4" />
                </Link>
              </figcaption>
            )}
          </figure>
        </div>
      </div>
    </section>
  );
}

function HeroPhoto({ room }: { room: RoomListItem | undefined }) {
  const [failed, setFailed] = useState(false);
  const frame = 'aspect-[4/3] rounded-xl border bg-muted sm:aspect-[16/9] lg:aspect-[21/9]';

  if (!room?.coverImage || failed) {
    return (
      <div className={`relative overflow-hidden ${frame}`}>
        <ArchitecturalFallback />
      </div>
    );
  }

  return (
    <RevealImage trigger="mount" delay={0.35} parallax className={frame}>
      <img
        src={room.coverImage}
        alt={`Không gian ${room.name}`}
        loading="eager"
        fetchPriority="high"
        decoding="async"
        onError={() => setFailed(true)}
        className="size-full object-cover"
      />
    </RevealImage>
  );
}
