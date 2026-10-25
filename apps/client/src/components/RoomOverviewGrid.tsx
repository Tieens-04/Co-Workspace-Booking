import React from 'react';
import { LayoutGrid, MoveHorizontal, Wrench } from 'lucide-react';
import { DashboardRoomSchedule } from '../types/admin-dashboard';
import { formatCurrency } from '../utils/format';
import { EmptyState } from '@/components/common/EmptyState';
import { StatusBadge } from '@/components/common/StatusBadge';
import { isWithinOperatingHours } from '../utils/bookingTime';
import { cn } from '@/lib/utils';

export interface RoomOverviewGridProps {
  rooms: DashboardRoomSchedule[];
  date: string;
}

const formatSlotTime = (isoString: string): string => {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return '';
  }
};

const LEGEND_SWATCH = 'inline-block h-3.5 w-5 shrink-0 rounded-sm border';

export const RoomOverviewGrid: React.FC<RoomOverviewGridProps> = ({ rooms, date }) => {
  if (rooms.length === 0) {
    return <EmptyState icon={LayoutGrid} title="Chưa có phòng làm việc nào trong hệ thống." />;
  }

  const sampleSlots = rooms.find((r) => r.slots.length > 0)?.slots || [];
  const displaySlots = sampleSlots.filter((slot) =>
    isWithinOperatingHours(new Date(slot.startTime), new Date(slot.endTime)),
  );

  return (
    <section aria-labelledby="room-overview-title" className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="grid gap-1">
          <p className="eyebrow text-[0.6875rem]">Lịch phòng</p>
          <h2 id="room-overview-title" className="text-h3">
            Lịch Time-Grid Các Phòng (Ngày <span className="tabular-nums">{date}</span>)
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.8125rem] text-muted-foreground">
          <ul aria-label="Chú thích" className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <li className="flex items-center gap-1.5">
              <span aria-hidden="true" className={`${LEGEND_SWATCH} border-input/50 bg-muted`} />
              Trống
            </li>
            <li className="flex items-center gap-1.5">
              <span aria-hidden="true" className={`${LEGEND_SWATCH} border-primary bg-primary`} />
              Đã đặt
            </li>
            <li className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className={`${LEGEND_SWATCH} border-status-maintenance-border bg-status-maintenance-bg bg-hatch`}
              />
              Bảo trì
            </li>
          </ul>

          <span>Giờ hoạt động: 07:00–22:00 (giờ Việt Nam)</span>
        </div>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <MoveHorizontal aria-hidden="true" className="size-3.5" />
        Cuộn ngang để xem đủ các khung giờ
      </p>

      {/* Grid Table Container */}
      <div
        className="overflow-x-auto overscroll-x-contain rounded-xl border bg-card"
        data-testid="room-overview-grid-container"
      >
        <table className="w-full min-w-[950px] border-collapse text-[0.8125rem]">
          <thead>
            <tr className="border-b">
              <th
                scope="col"
                className="sticky left-0 z-20 w-[150px] min-w-[150px] border-r bg-card px-3 py-3 text-left text-[0.6875rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase sm:w-[220px] sm:min-w-[220px] sm:px-4"
              >
                Phòng làm việc
              </th>
              {displaySlots.map((slot, idx) => (
                <th
                  key={slot.startTime}
                  scope="col"
                  className={cn(
                    'min-w-8 px-1 py-2 text-center text-[0.6875rem] font-medium text-muted-foreground tabular-nums',
                    idx % 2 === 0 && 'border-l',
                  )}
                >
                  {formatSlotTime(slot.startTime)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rooms.map((room) => {
              const isMaintenance = room.status === 'MAINTENANCE';

              return (
                <tr
                  key={room.id}
                  className="border-b last:border-b-0"
                  data-testid={`overview-room-row-${room.id}`}
                >
                  {/* Sticky Room Label */}
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-r bg-card px-3 py-3 text-left font-normal sm:px-4"
                  >
                    <div className="font-semibold text-foreground">{room.name}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                      {room.capacity} người • {formatCurrency(room.pricePerHour)}/h
                    </div>
                    {isMaintenance && (
                      <StatusBadge
                        kind="room"
                        status={room.status}
                        label="Đang bảo trì"
                        className="mt-1.5"
                      />
                    )}
                  </th>

                  {/* Slots Timeline */}
                  {isMaintenance ? (
                    <td
                      colSpan={displaySlots.length}
                      className="bg-status-maintenance-bg bg-hatch p-2 text-center font-medium text-status-maintenance"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <Wrench aria-hidden="true" className="size-3.5" />
                        Phòng đang bảo trì - Không khả dụng
                      </span>
                    </td>
                  ) : (
                    displaySlots.map((slot) => {
                      const matchingRoomSlot = room.slots.find(
                        (rs) => rs.startTime === slot.startTime,
                      );
                      const isBooked = matchingRoomSlot?.status === 'BOOKED';

                      const matchingBooking = room.bookings.find((b) => {
                        const bStart = new Date(b.startTime).getTime();
                        const bEnd = new Date(b.endTime).getTime();
                        const sStart = new Date(slot.startTime).getTime();
                        const sEnd = new Date(slot.endTime).getTime();
                        return bStart < sEnd && bEnd > sStart;
                      });

                      const title = isBooked
                        ? `Đã đặt: ${matchingBooking?.customerName || 'Khách'} (${matchingBooking?.bookingCode || ''})`
                        : `Trống: ${formatSlotTime(slot.startTime)} - ${formatSlotTime(slot.endTime)}`;

                      return (
                        <td
                          key={slot.startTime}
                          title={title}
                          className="px-0.5 py-1.5 text-center"
                        >
                          <div
                            className={cn(
                              'h-6 rounded-sm transition-colors duration-150',
                              isBooked ? 'bg-primary' : 'bg-muted',
                            )}
                          />
                        </td>
                      );
                    })
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
};
