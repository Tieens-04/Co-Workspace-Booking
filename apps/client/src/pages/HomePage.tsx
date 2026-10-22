import React, { useEffect, useMemo, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ScrollTrigger } from '@/lib/gsap';
import { useSmoothScroll } from '@/components/editorial/useSmoothScroll';
import { AmenitiesBlock } from '../components/landing/AmenitiesBlock';
import { BookingSteps } from '../components/landing/BookingSteps';
import { ClosingCta } from '../components/landing/ClosingCta';
import { FeaturedSpaces } from '../components/landing/FeaturedSpaces';
import { Hero } from '../components/landing/Hero';
import { PrinciplesRow } from '../components/landing/PrinciplesRow';
import { useLandingRooms } from '../components/landing/useLandingRooms';

/** Query keys the room explorer used to read on "/" before it moved to "/rooms". */
const LEGACY_EXPLORER_KEYS = ['page', 'capacity', 'minPrice', 'maxPrice', 'amenityIds'];

/**
 * Landing page. Old explorer deep links such as "/?capacity=4&page=2" are forwarded to
 * "/rooms" with the same query so bookmarks keep working.
 */
export const HomePage: React.FC = () => {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  if (LEGACY_EXPLORER_KEYS.some((key) => params.has(key))) {
    return <Navigate to={{ pathname: '/rooms', search: location.search }} replace />;
  }

  return <Landing />;
};

/** Split out so a legacy redirect never fires the landing API calls. */
function Landing() {
  const { rooms: fetchedRooms, status, retry } = useLandingRooms();
  // Showcase rooms people can book first; maintenance rooms still appear (with their badge) after.
  const rooms = useMemo(
    () =>
      [...fetchedRooms].sort(
        (a, b) => Number(a.status === 'MAINTENANCE') - Number(b.status === 'MAINTENANCE'),
      ),
    [fetchedRooms],
  );
  const heroRoom = rooms.find((room) => Boolean(room.coverImage));
  const rootRef = useRef<HTMLDivElement>(null);

  // Inertial wheel scrolling on this long editorial page; ScrollTrigger follows Lenis.
  useSmoothScroll(ScrollTrigger.update);

  // Sections change height when data arrives (skeleton → cards, amenities appear). Re-measure
  // scroll-reveal start points then, or reveals near the bottom could sit past max scroll.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver !== 'function') return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => ScrollTrigger.refresh());
    });
    observer.observe(root);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={rootRef}>
      <Hero room={heroRoom} status={status} />
      <PrinciplesRow />
      <FeaturedSpaces rooms={rooms} status={status} onRetry={retry} />
      <AmenitiesBlock />
      <BookingSteps />
      <ClosingCta />
    </div>
  );
}
