import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { m } from 'motion/react';
import { AppHeader } from './AppHeader';
import { AppFooter } from './AppFooter';
import { SkipLink } from '../components/SkipLink';
import { ScrollToTop } from '../components/ScrollToTop';
import { PageLoading } from '../components/PageLoading';

/**
 * Customer-facing shell: header, page outlet, footer.
 * The route fade is opacity-only (no transform), so sticky panels inside pages keep working,
 * and it is keyed by pathname so query/filter changes never re-enter the page.
 */
export function PublicLayout() {
  const location = useLocation();

  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <ScrollToTop />
      <AppHeader />
      <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col outline-none">
        <Suspense fallback={<PageLoading />}>
          <m.div
            key={location.pathname}
            className="flex flex-1 flex-col"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <Outlet />
          </m.div>
        </Suspense>
      </main>
      <AppFooter />
    </div>
  );
}
