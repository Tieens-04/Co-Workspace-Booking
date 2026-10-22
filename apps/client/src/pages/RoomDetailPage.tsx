import React, { useEffect, useState } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import { roomApi } from '../services/room.api';
import { RoomDetail } from '../types/room';
import { formatVnd } from '../utils/format';
import { useAuth } from '../hooks/useAuth';
import { BookingForm } from '../components/BookingForm';
import { CircleCheck, SearchX, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/common/EmptyState';
import { StatusBadge } from '@/components/common/StatusBadge';
import { cn } from '@/lib/utils';
import { AmenityIcon } from '../components/rooms/AmenityIcon';
import { RoomGallery } from '../components/rooms/RoomGallery';
import { MobileBookingBar } from '../components/rooms/MobileBookingBar';
import { MOBILE_FILTERS_QUERY, useMediaQuery } from '../components/rooms/useMediaQuery';
import { SplitReveal } from '../components/editorial/SplitReveal';

const BOOKING_PANEL_ID = 'booking-panel';

/** Booking rules enforced by the server; listed here so customers know them up front. */
const BOOKING_RULES = [
  'Mỗi lượt đặt kéo dài từ 1 đến 8 giờ, theo bước 30 phút.',
  'Đặt trước giờ bắt đầu ít nhất 30 phút.',
  'Bạn có thể tự hủy khi còn ít nhất 1 giờ trước giờ bắt đầu.',
  'Tổng tiền được hệ thống tính theo giá thuê theo giờ tại thời điểm đặt.',
];

const LAYOUT_COLUMNS = 'lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]';

export const RoomDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { isAuthenticated, principal } = useAuth();
  const isMobile = useMediaQuery(MOBILE_FILTERS_QUERY);

  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState<number>(0);
  const [imageErrorMap, setImageErrorMap] = useState<Record<string, boolean>>({});

  // Preserve the list URL (filters + page) the user came from, or fall back to the explorer.
  const backUrl = (location.state as { from?: string })?.from || '/rooms';

  const fetchRoom = (roomId: string, signal?: AbortSignal) => {
    setLoading(true);
    setErrorCode(null);
    setErrorMessage(null);

    roomApi
      .getRoomById(roomId, signal)
      .then((res) => {
        setRoom(res.data);
        setActiveImageIndex(0);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') {
          return;
        }
        const serverCode = err.response?.data?.code;
        const serverMessage = err.response?.data?.message || err.message;
        setErrorCode(serverCode || (err.response?.status === 404 ? 'ROOM_NOT_FOUND' : 'ERROR'));
        setErrorMessage(serverMessage || 'Không thể tải thông tin phòng');
        setLoading(false);
      });
  };

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    fetchRoom(id, controller.signal);

    return () => {
      controller.abort();
    };
  }, [id]);

  const handleImageError = (imgId: string) => {
    setImageErrorMap((prev) => ({ ...prev, [imgId]: true }));
  };

  const isMaintenance = room?.status === 'MAINTENANCE';
  // Admins see a notice instead of a form, and maintenance rooms take no bookings: no CTA then.
  const showMobileBar =
    !loading && Boolean(room) && isMobile && !isMaintenance && principal?.role !== 'ADMIN';

  return (
    <div
      className={cn(
        'container-page pt-6 pb-16 md:pt-8 lg:pb-20',
        showMobileBar && 'pb-[calc(6.5rem+env(safe-area-inset-bottom))]',
      )}
    >
      <Link
        to={backUrl}
        className="inline-flex min-h-11 items-center gap-2 rounded-sm text-sm font-medium text-muted-foreground no-underline transition-colors duration-150 hover:text-foreground"
      >
        <span aria-hidden="true">←</span>
        Quay lại danh sách phòng
      </Link>

      {loading && (
        <section aria-busy="true" aria-label="Đang tải thông tin phòng" className="mt-4 md:mt-6">
          <div className="grid gap-3 border-b pb-6">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-12 w-2/3 max-w-xl" />
          </div>
          <div className={cn('mt-8 grid gap-10 lg:gap-12', LAYOUT_COLUMNS)}>
            <div className="grid content-start gap-3">
              <Skeleton className="aspect-[4/3] w-full rounded-xl sm:aspect-[16/10]" />
              <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-5 lg:grid-cols-6">
                {[1, 2, 3].map((n) => (
                  <Skeleton key={n} className="aspect-[4/3] rounded-lg" />
                ))}
              </div>
              <Skeleton className="mt-8 h-16 w-full" />
              <Skeleton className="mt-6 h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
            <Skeleton className="h-[28rem] rounded-xl" />
          </div>
        </section>
      )}

      {!loading && errorCode === 'ROOM_NOT_FOUND' && (
        <EmptyState
          role="alert"
          className="mt-6 max-w-2xl"
          icon={SearchX}
          title="Không tìm thấy phòng"
          description="Phòng bạn đang tìm kiếm không tồn tại hoặc đã bị ngừng cung cấp dịch vụ."
          action={
            <Button asChild>
              <Link to={backUrl}>Quay về danh sách phòng</Link>
            </Button>
          }
        />
      )}

      {!loading && errorCode && errorCode !== 'ROOM_NOT_FOUND' && (
        <section className="mt-6 grid max-w-2xl justify-items-start gap-3">
          <ErrorState
            className="w-full"
            title="Lỗi kết nối"
            description={errorMessage || 'Đã có lỗi xảy ra khi tải thông tin chi tiết phòng.'}
            onRetry={() => id && fetchRoom(id)}
          />
          <Button asChild variant="link" size="sm">
            <Link to={backUrl}>Về danh sách</Link>
          </Button>
        </section>
      )}

      {!loading && room && (
        <article className="mt-4 md:mt-6">
          <header className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="grid min-w-0 gap-3">
              <p className="eyebrow">Không gian làm việc</p>
              <SplitReveal
                key={room.id}
                as="h1"
                by="chars"
                trigger="mount"
                className="text-display-lg font-bold"
              >
                {room.name}
              </SplitReveal>
            </div>
            <StatusBadge kind="room" status={room.status} className="self-start sm:self-end" />
          </header>

          {isMaintenance && (
            <div
              role="note"
              data-testid="room-maintenance-notice"
              className="mt-6 flex items-start gap-3 rounded-xl border border-status-maintenance-border bg-status-maintenance-bg p-4 text-status-maintenance md:p-5"
            >
              <Wrench aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              <div className="grid gap-1">
                <p className="font-semibold">Phòng đang tạm ngừng để bảo trì</p>
                <p className="text-sm">
                  Hiện chưa thể đặt chỗ cho phòng này. Bạn có thể xem các không gian khác trong danh
                  sách.
                </p>
                <Link
                  to={backUrl}
                  className="mt-1 text-sm font-semibold text-status-maintenance underline underline-offset-4"
                >
                  Xem phòng khác
                </Link>
              </div>
            </div>
          )}

          <div className={cn('mt-6 grid gap-12 md:mt-8 lg:items-start', LAYOUT_COLUMNS)}>
            <div className="min-w-0">
              <RoomGallery
                roomName={room.name}
                images={room.images ?? []}
                activeIndex={activeImageIndex}
                onSelect={setActiveImageIndex}
                failedImageIds={imageErrorMap}
                onImageError={handleImageError}
              />

              <dl className="mt-10 grid grid-cols-2 border-t md:grid-cols-4">
                {[
                  { label: 'Giá thuê theo giờ', value: formatVnd(room.pricePerHour) },
                  { label: 'Sức chứa tối đa', value: `${room.capacity} người` },
                  { label: 'Thời lượng mỗi lượt', value: '1 – 8 giờ' },
                  { label: 'Bước đặt', value: '30 phút' },
                ].map((spec) => (
                  <div key={spec.label} className="grid content-start gap-1.5 border-b py-4 pr-4">
                    <dt className="text-[0.8125rem] text-muted-foreground">{spec.label}</dt>
                    <dd className="text-lg font-bold tabular-nums">{spec.value}</dd>
                  </div>
                ))}
              </dl>

              <section className="mt-12 grid gap-4 border-t pt-8" aria-labelledby="room-desc">
                <h2 id="room-desc" className="text-h3 font-bold">
                  Mô tả phòng
                </h2>
                <p className="max-w-[65ch] text-[1.0625rem] leading-relaxed text-foreground">
                  {room.description ? room.description : 'Chưa có mô tả chi tiết cho phòng này.'}
                </p>
              </section>

              <section className="mt-12 grid gap-5 border-t pt-8" aria-labelledby="room-amenities">
                <h2 id="room-amenities" className="text-h3 font-bold">
                  Tiện ích sẵn có{' '}
                  <span className="font-medium text-muted-foreground tabular-nums">
                    ({room.amenities.length})
                  </span>
                </h2>
                {room.amenities.length > 0 ? (
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {room.amenities.map((amenity) => (
                      <li
                        key={amenity.id}
                        className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3.5 rounded-xl border bg-card p-4"
                      >
                        <span className="grid size-10 place-items-center rounded-lg bg-muted text-primary">
                          <AmenityIcon icon={amenity.icon} className="size-5" />
                        </span>
                        <div className="grid gap-0.5">
                          <p className="text-[0.9375rem] font-semibold">{amenity.name}</p>
                          {amenity.description && (
                            <p className="text-[0.8125rem] text-muted-foreground">
                              {amenity.description}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Phòng này hiện chưa có danh sách tiện ích bổ sung.
                  </p>
                )}
              </section>

              <section className="mt-12 grid gap-4 border-t pt-8" aria-labelledby="room-rules">
                <h2 id="room-rules" className="text-h3 font-bold">
                  Quy định đặt chỗ
                </h2>
                <ul className="grid max-w-[65ch] gap-3">
                  {BOOKING_RULES.map((rule) => (
                    <li key={rule} className="flex items-start gap-3 text-[0.9375rem]">
                      <CircleCheck
                        aria-hidden="true"
                        className="mt-0.5 size-[1.125rem] shrink-0 text-primary"
                        strokeWidth={1.75}
                      />
                      {rule}
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <aside
              id={BOOKING_PANEL_ID}
              tabIndex={-1}
              aria-label="Khu vực đặt phòng"
              // A panel taller than the viewport scrolls itself, so submit stays reachable.
              className="min-w-0 scroll-mt-24 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:overscroll-contain"
            >
              <BookingForm
                roomId={room.id}
                roomName={room.name}
                roomStatus={room.status}
                pricePerHour={room.pricePerHour}
                isAuthenticated={isAuthenticated}
                userRole={principal?.role}
                userId={principal?.id}
              />
            </aside>
          </div>

          {showMobileBar && (
            <MobileBookingBar pricePerHour={room.pricePerHour} targetId={BOOKING_PANEL_ID} />
          )}
        </article>
      )}
    </div>
  );
};
