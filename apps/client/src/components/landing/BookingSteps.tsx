import { DrawRule } from '@/components/editorial/DrawRule';
import { Reveal } from '@/components/editorial/Reveal';
import { SplitReveal } from '@/components/editorial/SplitReveal';

/** The real customer flow: room detail → time grid → review → booking code, pay at the counter. */
const STEPS = [
  {
    title: 'Chọn không gian',
    body: 'Lọc theo sức chứa, mức giá và tiện ích để tìm phòng phù hợp với buổi làm việc.',
  },
  {
    title: 'Chọn ngày và khung giờ trống',
    body: 'Chọn giờ theo khung 30 phút trên lịch của phòng. Mỗi lượt từ 1 đến 8 giờ.',
  },
  {
    title: 'Xem lại và xác nhận',
    body: 'Hệ thống tính giá theo số giờ và giá phòng. Đăng nhập để xác nhận đặt chỗ.',
  },
  {
    title: 'Nhận mã đặt phòng',
    body: 'Bạn nhận mã dạng CS-YYYYMMDD-XXXX. Thanh toán tại quầy; lượt đặt ở trạng thái “Chưa thanh toán” cho đến khi nhân viên xác nhận.',
  },
] as const;

/** Ruled four-step process: the rule draws in, big numbers rise out of their line, text follows. */
export function BookingSteps() {
  return (
    <section aria-labelledby="landing-steps-title" className="py-24 md:py-32">
      <div className="container-page grid gap-12 md:gap-16">
        <header className="grid gap-4 lg:grid-cols-12 lg:gap-12">
          <p className="eyebrow lg:col-span-3 lg:pt-4">Cách đặt chỗ</p>
          <SplitReveal
            as="h2"
            id="landing-steps-title"
            by="words"
            className="text-display-lg lg:col-span-7"
          >
            Đặt chỗ trong bốn bước.
          </SplitReveal>
        </header>
        <div>
          <DrawRule />
          <ol className="grid sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <li
                key={step.title}
                className="grid content-start gap-4 border-t py-8 first:border-t-0 sm:pr-8 sm:[&:nth-child(-n+2)]:border-t-0 lg:border-t-0 lg:pr-10"
              >
                <SplitReveal
                  as="span"
                  by="chars"
                  delay={index * 0.12}
                  duration={1.1}
                  aria-hidden="true"
                  className="block text-display-lg font-semibold tabular-nums text-muted-foreground"
                >
                  {String(index + 1).padStart(2, '0')}
                </SplitReveal>
                <Reveal y={16} duration={0.7} delay={0.15 + index * 0.12} className="grid gap-4">
                  <h3 className="text-h3">{step.title}</h3>
                  <p className="max-w-[34ch] text-[0.9375rem] leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
