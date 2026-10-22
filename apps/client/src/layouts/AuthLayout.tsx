import { Suspense, useEffect, useState } from 'react';
import { useLocation, useOutlet } from 'react-router-dom';
import { AnimatePresence, m } from 'motion/react';
import { DURATION, EASE_EDITORIAL } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { PageLoading } from '../components/PageLoading';
import { BrandMark } from '../components/BrandMark';
import { SkipLink } from '../components/SkipLink';
import { ScrollToTop } from '../components/ScrollToTop';
import { ThemeToggle } from '../components/ThemeToggle';
import { AuthTabs } from '../components/auth/AuthTabs';
import { roomApi } from '../services/room.api';

const BRAND_LINE = 'Không gian cho ý tưởng lớn.';

const FACTS = [
  { label: 'Bước đặt', value: '30 phút' },
  { label: 'Mỗi lượt', value: '1 – 8 giờ' },
  { label: 'Tự hủy', value: 'Trước 1 giờ' },
];

const AUTH_ROUTE_ORDER: Record<string, number> = {
  '/login': 0,
  '/register': 1,
};

const authTransitionVariants = {
  enter: (direction: number) => ({
    opacity: 0,
    x: direction === 0 ? 0 : direction > 0 ? 8 : -8,
  }),
  center: {
    opacity: 1,
    x: 0,
    transition: {
      duration: DURATION.base,
      ease: EASE_EDITORIAL,
    },
  },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction === 0 ? 0 : direction > 0 ? -8 : 8,
    transition: {
      duration: DURATION.fast,
      ease: EASE_EDITORIAL,
    },
  }),
};

interface AuthPhoto {
  src: string;
  roomName: string;
}

type PhotoState =
  { status: 'loading' } | { status: 'photo'; photo: AuthPhoto } | { status: 'typographic' };

/** Reads one room cover (read-only) for the desktop panel; any failure falls back to type. */
function useAuthPhoto() {
  const [state, setState] = useState<PhotoState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    roomApi
      .getRooms({ page: 1, limit: 1 }, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return;
        const room = res?.data?.items?.[0];
        if (room && typeof room.coverImage === 'string' && room.coverImage.trim() !== '') {
          setState({ status: 'photo', photo: { src: room.coverImage, roomName: room.name } });
        } else {
          setState({ status: 'typographic' });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'typographic' });
      });
    return () => controller.abort();
  }, []);

  return { state, fallBack: () => setState({ status: 'typographic' }) };
}

/**
 * Login/register shell. Desktop: form column + a large real room photo (typographic ink panel
 * when no photo is available). Mobile: form only, under a compact brand bar.
 */
export function AuthLayout() {
  const { state, fallBack } = useAuthPhoto();
  const [photoLoaded, setPhotoLoaded] = useState(false);
  const location = useLocation();
  const outlet = useOutlet();

  const [prevPath, setPrevPath] = useState(location.pathname);
  const [direction, setDirection] = useState(0);

  if (prevPath !== location.pathname) {
    const prevIndex = AUTH_ROUTE_ORDER[prevPath];
    const nextIndex = AUTH_ROUTE_ORDER[location.pathname];
    setPrevPath(location.pathname);
    if (typeof prevIndex === 'number' && typeof nextIndex === 'number') {
      setDirection(nextIndex > prevIndex ? 1 : -1);
    } else {
      setDirection(0);
    }
  }

  const photo = state.status === 'photo' ? state.photo : null;
  const variant = state.status === 'typographic' ? 'typographic' : photo ? 'photo' : 'loading';

  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)]">
      <SkipLink />
      <ScrollToTop />

      <div className="flex min-w-0 flex-col">
        <div className="flex h-16 items-center justify-between px-5 sm:px-8 lg:px-12">
          <BrandMark />
          <ThemeToggle />
        </div>
        <main
          id="main-content"
          tabIndex={-1}
          className="flex flex-1 items-start justify-center px-5 pt-6 pb-16 outline-none sm:items-center sm:px-8 lg:px-12"
        >
          <div className="w-full max-w-[440px] grid gap-6">
            <AuthTabs />
            <div className="overflow-x-clip">
              <Suspense fallback={<PageLoading />}>
                <AnimatePresence mode="wait" custom={direction}>
                  <m.div
                    key={location.pathname}
                    custom={direction}
                    variants={authTransitionVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    className="w-full"
                  >
                    {outlet}
                  </m.div>
                </AnimatePresence>
              </Suspense>
            </div>
          </div>
        </main>
      </div>

      <m.aside
        aria-label="Co-Space Working"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: DURATION.slow, ease: EASE_EDITORIAL }}
        className="hidden p-3 lg:sticky lg:top-0 lg:block lg:h-dvh"
      >
        <div
          data-testid="auth-visual"
          data-variant={variant}
          className="section-ink relative flex h-full flex-col justify-end overflow-hidden rounded-xl border"
        >
          {photo && (
            <>
              <img
                src={photo.src}
                alt={`Ảnh phòng ${photo.roomName}`}
                loading="lazy"
                decoding="async"
                onLoad={() => setPhotoLoaded(true)}
                onError={fallBack}
                className={cn(
                  'absolute inset-0 size-full object-cover transition-opacity duration-200 ease-editorial',
                  photoLoaded ? 'opacity-100' : 'opacity-0',
                )}
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-linear-to-t from-ink from-5% via-ink/60 via-45% to-ink/0 to-80%"
              />
            </>
          )}

          <div className="relative grid gap-8 p-10 xl:p-14">
            <div className="grid gap-5">
              <p className="text-xs font-semibold tracking-[0.14em] text-on-ink-muted uppercase">
                Co-Space Working
              </p>
              <p className="max-w-[12ch] text-display-xl font-bold text-balance text-on-ink">
                {BRAND_LINE}
              </p>
              {photo && (
                <p className="text-sm text-on-ink-muted">
                  Trong ảnh: <span className="font-medium text-on-ink">{photo.roomName}</span>
                </p>
              )}
            </div>
            <dl className="grid grid-cols-3 gap-4 border-t border-ink-border pt-5">
              {FACTS.map((fact) => (
                <div key={fact.label} className="grid gap-1">
                  <dt className="text-xs text-on-ink-muted">{fact.label}</dt>
                  <dd className="text-sm font-semibold text-on-ink tabular-nums">{fact.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </m.aside>
    </div>
  );
}
