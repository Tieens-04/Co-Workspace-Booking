import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const NotFoundPage: React.FC = () => {
  return (
    <section className="container-page grid flex-1 content-center gap-10 py-20 md:grid-cols-[auto_minmax(0,1fr)] md:items-end md:gap-16 md:py-28">
      <h1 className="text-[clamp(6.5rem,3.5rem+13vw,14rem)] leading-[0.86] font-extrabold tracking-[-0.06em] tabular-nums">
        404
      </h1>
      <div className="grid max-w-[46ch] gap-4 border-t border-foreground pt-6 md:mb-5">
        <p className="eyebrow">Lỗi đường dẫn</p>
        <h2 className="text-h2 font-bold">Không tìm thấy trang</h2>
        <p className="text-muted-foreground">
          Đường dẫn bạn yêu cầu không tồn tại trên hệ thống hoặc đã được di chuyển. Bạn có thể quay
          về trang chủ hoặc xem danh sách phòng.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button asChild>
            <Link to="/">
              <ArrowLeft aria-hidden="true" />
              Về trang chủ
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/rooms">
              Khám phá phòng
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
};
