import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

const WORDMARK = 'Co-Space.';

/**
 * Oversized decorative wordmark whose letters rise when it scrolls into view. CSS-only (see
 * index.css `[data-wordmark]`) so the shared layout never ships GSAP; visible without JS.
 */
function FooterWordmark() {
  const ref = useRef<HTMLParagraphElement>(null);
  const [state, setState] = useState<{ ready: boolean; inView: boolean }>({
    ready: false,
    inView: false,
  });

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window.IntersectionObserver !== 'function') return;
    setState((s) => ({ ...s, ready: true }));
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setState({ ready: true, inView: true });
          observer.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <p
      ref={ref}
      aria-hidden="true"
      data-wordmark={state.ready ? 'ready' : undefined}
      data-inview={state.inView ? 'true' : undefined}
      className="flex overflow-hidden pb-[0.08em] text-[clamp(3.5rem,1rem+12vw,11rem)] leading-[0.95] font-bold tracking-[-0.06em]"
    >
      {Array.from(WORDMARK).map((char, index) => (
        <span
          key={index}
          data-char
          className="inline-block"
          style={{ '--i': index } as React.CSSProperties}
        >
          {char}
        </span>
      ))}
    </p>
  );
}

// Only destinations every visitor can open (role-specific links live in the header).
const LINKS = [
  { to: '/', label: 'Trang chủ' },
  { to: '/rooms', label: 'Khám phá không gian' },
];

/** Minimal footer: short facts, a few real links and an oversized wordmark. */
export const AppFooter: React.FC = () => {
  return (
    <footer className="mt-auto border-t">
      <div className="container-page grid gap-10 pt-14 pb-8 md:pt-20">
        <div className="grid gap-8 md:grid-cols-12">
          <p className="max-w-[44ch] text-[0.9375rem] text-muted-foreground md:col-span-5">
            Đặt phòng làm việc và phòng họp theo giờ. Mỗi lượt từ 1 đến 8 giờ, đặt trước ít nhất 30
            phút. Thanh toán tại quầy.
          </p>
          <nav aria-label="Liên kết chân trang" className="md:col-span-4 md:col-start-7">
            <ul className="grid gap-2 text-[0.9375rem]">
              {LINKS.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="inline-flex min-h-11 items-center underline-offset-4 hover:underline"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="grid content-start gap-1 text-sm text-muted-foreground md:col-span-2 md:text-right">
            <span>Múi giờ GMT+7</span>
            <span>Việt Nam</span>
          </div>
        </div>
        <div className="flex flex-col gap-4 border-t pt-6 md:flex-row md:items-end md:justify-between">
          <FooterWordmark />
          <span className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Co-Space Working
          </span>
        </div>
      </div>
    </footer>
  );
};
