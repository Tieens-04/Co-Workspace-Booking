import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Reveal } from '@/components/editorial/Reveal';
import { ScrubText } from '@/components/editorial/ScrubText';
import { useAuth } from '../../hooks/useAuth';

/** Moss closing band: one large line, the explore action and (for guests) account creation. */
export function ClosingCta() {
  const { isAuthenticated } = useAuth();

  return (
    <section
      aria-labelledby="landing-closing-title"
      className="bg-primary text-primary-foreground [--ring:var(--primary-foreground)]"
    >
      <div className="container-page grid gap-10 py-24 md:py-32 lg:grid-cols-12 lg:items-end lg:gap-12">
        {/* Words brighten as the band scrolls up — read at the pace of the scroll. */}
        <ScrubText as="h2" id="landing-closing-title" className="text-display-xl lg:col-span-8">
          Ý tưởng lớn bắt đầu từ một khung 30 phút.
        </ScrubText>
        <Reveal
          y={20}
          duration={0.7}
          className="flex flex-col items-start gap-4 lg:col-span-4 lg:items-end lg:pb-3"
        >
          <Link
            to="/rooms"
            className="inline-flex h-12 items-center gap-2 rounded-md bg-primary-foreground px-7 text-base font-medium text-primary transition-opacity duration-150 hover:opacity-90"
          >
            Khám phá không gian
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
          {!isAuthenticated && (
            <Link
              to="/register"
              className="inline-flex min-h-11 items-center font-medium underline decoration-primary-foreground/50 underline-offset-4 transition-colors duration-150 hover:decoration-primary-foreground"
            >
              Tạo tài khoản
            </Link>
          )}
        </Reveal>
      </div>
    </section>
  );
}
