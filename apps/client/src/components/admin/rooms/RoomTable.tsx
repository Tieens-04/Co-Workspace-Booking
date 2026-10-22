import type * as React from 'react';
import { ImageOff, MoveHorizontal, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StatusBadge } from '@/components/common/StatusBadge';
import { cn } from '@/lib/utils';
import type { RoomListItem } from '../../../types/room';
import { adminHeadClass, stackedTable as st } from '../stackedTable';

interface RoomTableProps {
  rooms: RoomListItem[];
  /** Room whose details are being fetched for editing; its button shows a loading label. */
  loadingRoomId?: string | null;
  /** Room currently open in the edit form; its row is highlighted. */
  activeRoomId?: string | null;
  onEdit: (roomId: string, trigger: HTMLButtonElement) => void;
}

const CELL_CLASS = cn('px-4 py-3', st.cell);

/**
 * Admin room list. Read-only apart from the per-row "Sửa" action. Below `md` each row restyles
 * into a card (photo + name headline, figures in two columns, full-width action).
 */
export function RoomTable({ rooms, loadingRoomId, activeRoomId, onEdit }: RoomTableProps) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground max-md:hidden lg:hidden">
        <MoveHorizontal aria-hidden="true" className="size-3.5" />
        Cuộn ngang để xem thêm cột
      </p>
      <div className={st.frame}>
        <Table className={cn('md:min-w-[760px]', st.table)} data-testid="admin-room-table">
          <TableHeader className={cn('bg-muted/40', st.header)}>
            <TableRow className="hover:bg-transparent">
              <TableHead className={cn(adminHeadClass, 'w-24')}>Ảnh</TableHead>
              <TableHead className={adminHeadClass}>Tên phòng</TableHead>
              <TableHead className={cn(adminHeadClass, 'text-right')}>Sức chứa</TableHead>
              <TableHead className={cn(adminHeadClass, 'text-right')}>Đơn giá / giờ</TableHead>
              <TableHead className={adminHeadClass}>Trạng thái</TableHead>
              <TableHead className={adminHeadClass}>Tiện ích</TableHead>
              <TableHead className={cn(adminHeadClass, 'text-right')}>Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={st.body}>
            {rooms.map((room) => {
              const isLoading = loadingRoomId === room.id;
              const isActive = activeRoomId === room.id;
              return (
                <TableRow
                  key={room.id}
                  data-testid={`admin-room-row-${room.id}`}
                  data-state={isActive ? 'selected' : undefined}
                  className={cn(
                    st.row,
                    'max-md:grid-cols-[auto_minmax(0,1fr)] data-[state=selected]:bg-primary/[0.06] max-md:data-[state=selected]:ring-primary',
                  )}
                >
                  <TableCell className={cn(CELL_CLASS, st.noLabel)}>
                    {room.coverImage ? (
                      <img
                        src={room.coverImage}
                        alt={room.name}
                        className="h-11 w-16 rounded-md border object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-11 w-16 flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-input text-[0.625rem] text-muted-foreground">
                        <ImageOff aria-hidden="true" className="size-3.5" />
                        Không ảnh
                      </div>
                    )}
                  </TableCell>
                  <TableCell
                    className={cn(CELL_CLASS, st.noLabel, 'whitespace-normal max-md:self-center')}
                  >
                    <strong className="font-semibold">{room.name}</strong>
                  </TableCell>
                  <TableCell
                    data-label="Sức chứa"
                    className={cn(CELL_CLASS, 'text-right tabular-nums')}
                  >
                    {room.capacity} người
                  </TableCell>
                  <TableCell
                    data-label="Đơn giá / giờ"
                    className={cn(CELL_CLASS, 'text-right font-semibold tabular-nums')}
                  >
                    {Number(room.pricePerHour).toLocaleString('vi-VN')} đ/h
                  </TableCell>
                  <TableCell data-label="Trạng thái" className={cn(CELL_CLASS, st.full)}>
                    <StatusBadge kind="room" status={room.status} label={room.status} />
                  </TableCell>
                  <TableCell
                    data-label="Tiện ích"
                    className={cn(CELL_CLASS, st.full, 'whitespace-normal')}
                  >
                    <AmenityTags amenities={room.amenities} />
                  </TableCell>
                  <TableCell className={cn(CELL_CLASS, st.full, st.noLabel, 'text-right')}>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="max-md:w-full"
                      onClick={(event) => onEdit(room.id, event.currentTarget)}
                      disabled={isLoading}
                      data-testid={`admin-edit-btn-${room.id}`}
                    >
                      <Pencil aria-hidden="true" />
                      {isLoading ? 'Đang tải...' : 'Sửa'}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function AmenityTags({ amenities }: { amenities: RoomListItem['amenities'] }): React.ReactElement {
  if (amenities.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <ul className="flex max-w-[16rem] flex-wrap gap-1 max-md:max-w-none">
      {amenities.map((amenity) => (
        <li
          key={amenity.id}
          className="rounded-sm bg-muted px-1.5 py-0.5 text-xs leading-snug text-muted-foreground"
        >
          {amenity.name}
        </li>
      ))}
    </ul>
  );
}
