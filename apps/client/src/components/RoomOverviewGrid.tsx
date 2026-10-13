import React, { useState } from 'react';
import { DashboardRoomSchedule } from '../types/admin-dashboard';
import { formatCurrency } from '../utils/format';

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

export const RoomOverviewGrid: React.FC<RoomOverviewGridProps> = ({ rooms, date }) => {
  const [showFullDay, setShowFullDay] = useState(false);

  if (rooms.length === 0) {
    return (
      <div
        className="card"
        style={{
          padding: '2rem',
          textAlign: 'center',
          color: '#718096',
          backgroundColor: '#f7fafc',
          borderRadius: '8px',
        }}
      >
        <p style={{ margin: 0, fontSize: '1rem' }}>Chưa có phòng làm việc nào trong hệ thống.</p>
      </div>
    );
  }

  // Filter slots to operating hours 07:00 - 22:00 by default for readability, with full 24h toggle
  const sampleSlots = rooms.find((r) => r.slots.length > 0)?.slots || [];
  const displaySlots = showFullDay
    ? sampleSlots
    : sampleSlots.filter((slot) => {
        const timeStr = formatSlotTime(slot.startTime);
        const hour = parseInt(timeStr.split(':')[0], 10);
        return hour >= 7 && hour < 22;
      });

  return (
    <div className="card room-overview-card" style={{ padding: '1.25rem', marginTop: '1.5rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1rem',
        }}
      >
        <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#2d3748' }}>
          🗓️ Lịch Time-Grid Các Phòng (Ngày {date})
        </h3>

        {/* Legend */}
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', fontSize: '0.875rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span
              style={{
                display: 'inline-block',
                width: '14px',
                height: '14px',
                backgroundColor: '#edf2f7',
                border: '1px solid #cbd5e0',
                borderRadius: '3px',
              }}
            />
            <span>Trống</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span
              style={{
                display: 'inline-block',
                width: '14px',
                height: '14px',
                backgroundColor: '#3182ce',
                borderRadius: '3px',
              }}
            />
            <span>Đã đặt</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span
              style={{
                display: 'inline-block',
                width: '14px',
                height: '14px',
                backgroundColor: '#fed7d7',
                border: '1px solid #feb2b2',
                borderRadius: '3px',
              }}
            />
            <span>Bảo trì</span>
          </div>

          <button
            type="button"
            className="btn btn-outline"
            style={{ padding: '0.2rem 0.6rem', fontSize: '0.8rem' }}
            onClick={() => setShowFullDay(!showFullDay)}
            data-testid="toggle-full-day-btn"
          >
            {showFullDay ? 'Thu gọn (07:00 - 22:00)' : 'Xem toàn bộ 24h'}
          </button>
        </div>
      </div>

      {/* Grid Table Container */}
      <div
        style={{
          overflowX: 'auto',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          backgroundColor: '#fff',
        }}
        data-testid="room-overview-grid-container"
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            minWidth: '950px',
            fontSize: '0.85rem',
          }}
        >
          <thead>
            <tr style={{ backgroundColor: '#f7fafc', borderBottom: '2px solid #e2e8f0' }}>
              <th
                style={{
                  padding: '0.75rem 1rem',
                  textAlign: 'left',
                  position: 'sticky',
                  left: 0,
                  backgroundColor: '#f7fafc',
                  zIndex: 2,
                  minWidth: '220px',
                  boxShadow: '2px 0 4px -2px rgba(0,0,0,0.1)',
                }}
              >
                Phòng làm việc
              </th>
              {displaySlots.map((slot, idx) => (
                <th
                  key={slot.startTime}
                  style={{
                    padding: '0.5rem 0.25rem',
                    textAlign: 'center',
                    minWidth: '32px',
                    borderLeft: idx % 2 === 0 ? '1px solid #e2e8f0' : 'none',
                    fontWeight: 500,
                    color: '#718096',
                    fontSize: '0.75rem',
                  }}
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
                  style={{
                    borderBottom: '1px solid #edf2f7',
                  }}
                  data-testid={`overview-room-row-${room.id}`}
                >
                  {/* Sticky Room Label */}
                  <td
                    style={{
                      padding: '0.75rem 1rem',
                      position: 'sticky',
                      left: 0,
                      backgroundColor: '#fff',
                      zIndex: 1,
                      boxShadow: '2px 0 4px -2px rgba(0,0,0,0.1)',
                    }}
                  >
                    <div style={{ fontWeight: 600, color: '#2d3748' }}>{room.name}</div>
                    <div style={{ color: '#718096', fontSize: '0.75rem', marginTop: '2px' }}>
                      {room.capacity} người • {formatCurrency(room.pricePerHour)}/h
                    </div>
                    {isMaintenance && (
                      <span
                        className="badge badge-maintenance"
                        style={{ fontSize: '0.7rem', marginTop: '4px', display: 'inline-block' }}
                      >
                        Đang bảo trì
                      </span>
                    )}
                  </td>

                  {/* Slots Timeline */}
                  {isMaintenance ? (
                    <td
                      colSpan={displaySlots.length}
                      style={{
                        backgroundColor: '#fff5f5',
                        textAlign: 'center',
                        color: '#c53030',
                        fontWeight: 500,
                        padding: '0.5rem',
                      }}
                    >
                      🛠 Phòng đang bảo trì - Không khả dụng
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
                          style={{
                            padding: '0.35rem 0.15rem',
                            textAlign: 'center',
                          }}
                        >
                          <div
                            style={{
                              height: '24px',
                              borderRadius: '3px',
                              backgroundColor: isBooked ? '#3182ce' : '#edf2f7',
                              transition: 'all 0.15s ease',
                              cursor: isBooked ? 'pointer' : 'default',
                            }}
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
    </div>
  );
};
