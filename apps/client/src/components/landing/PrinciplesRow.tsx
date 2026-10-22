import { DrawRule } from '@/components/editorial/DrawRule';
import { Reveal } from '@/components/editorial/Reveal';
import { SplitReveal } from '@/components/editorial/SplitReveal';

/** Booking rules the server enforces, stated plainly (see AGENTS.md "Booking time rules"). */
const PRINCIPLES = [
  {
    title: 'Khung 30 phút',
    body: 'Giờ bắt đầu và kết thúc luôn theo khung 30 phút, dễ khớp với lịch làm việc của bạn.',
  },
  {
    title: 'Từ 1 đến 8 giờ',
    body: 'Mỗi lượt đặt kéo dài từ 1 đến 8 giờ và cần đặt trước giờ bắt đầu ít nhất 30 phút.',
  },
  {
    title: 'Thanh toán tại quầy',
    body: 'Trả bằng tiền mặt hoặc mã QR do nhân viên đưa. Bạn tự hủy được khi còn ít nhất 1 giờ trước giờ bắt đầu.',
  },
] as const;

/** Light 01 / 02 / 03 row: the top rule draws in, the heading rises by word, columns follow. */
export function PrinciplesRow() {
  return (
    <section aria-labelledby="landing-principles-title" className="pb-24 md:pb-32">
      <div className="container-page">
        <DrawRule />
        <div className="grid gap-10 pt-8 lg:grid-cols-12 lg:gap-12">
          <header className="lg:col-span-3">
            <p className="eyebrow">Nguyên tắc đặt chỗ</p>
            <SplitReveal as="h2" id="landing-principles-title" by="words" className="mt-3 text-h2">
              Rõ ràng từ trước khi bạn đến.
            </SplitReveal>
          </header>
          <Reveal
            as="ol"
            y={28}
            duration={0.8}
            stagger={0.12}
            className="grid md:grid-cols-3 lg:col-span-9"
          >
            {PRINCIPLES.map((item, index) => (
              <li
                key={item.title}
                data-reveal
                className="grid content-start gap-3 border-t py-6 md:border-t-0 md:border-l md:px-6 md:py-0 md:first:border-l-0 md:first:pl-0 lg:first:border-l lg:first:pl-6"
              >
                <span
                  aria-hidden="true"
                  className="text-sm font-semibold tabular-nums text-muted-foreground"
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3 className="text-h3">{item.title}</h3>
                <p className="max-w-[36ch] text-[0.9375rem] leading-relaxed text-muted-foreground">
                  {item.body}
                </p>
              </li>
            ))}
          </Reveal>
        </div>
      </div>
    </section>
  );
}
