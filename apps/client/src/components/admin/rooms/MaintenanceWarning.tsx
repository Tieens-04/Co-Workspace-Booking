import { TriangleAlert } from 'lucide-react';
import { useRef, type RefObject } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { FutureBookingWarningDetails } from '../../../types/admin-room';

interface MaintenanceWarningProps {
  warning: FutureBookingWarningDetails;
  isConfirming: boolean;
  onDismiss: () => void;
  onConfirm: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * Protected confirmation when switching a room with upcoming bookings to maintenance.
 * Bookings are never cancelled automatically; the admin must confirm explicitly.
 */
export function MaintenanceWarning({
  warning,
  isConfirming,
  onDismiss,
  onConfirm,
  returnFocusRef,
}: MaintenanceWarningProps) {
  const previousFocus = useRef<HTMLElement | null>(null);
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !isConfirming) onDismiss();
      }}
    >
      <AlertDialogContent
        data-testid="admin-future-booking-warning"
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto border-status-noshow-border bg-status-noshow-bg"
        onOpenAutoFocus={() => {
          previousFocus.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const target = returnFocusRef?.current ?? previousFocus.current;
          if (target?.isConnected) target.focus();
        }}
        onEscapeKeyDown={(event) => {
          if (isConfirming) event.preventDefault();
        }}
      >
        <div className="flex items-start gap-3 text-status-noshow">
          <TriangleAlert aria-hidden="true" className="mt-1 size-5 shrink-0" />
          <AlertDialogTitle className="text-lg leading-snug font-semibold">
            Cảnh báo: Phòng có {warning.futureBookingCount} booking sắp tới
          </AlertDialogTitle>
        </div>
        <AlertDialogDescription className="text-sm text-foreground">
          Chuyển phòng sang trạng thái <strong className="font-semibold">Bảo trì</strong> sẽ{' '}
          <strong className="font-semibold">không tự động hủy</strong> các booking này. Quản trị
          viên cần liên hệ khách hàng và xử lý hoặc hủy thủ công các booking dưới đây:
        </AlertDialogDescription>
        <ul
          className="divide-y overflow-hidden rounded-lg border bg-card text-sm"
          data-testid="admin-future-booking-list"
        >
          {warning.bookings.map((booking) => (
            <li
              key={booking.bookingCode}
              className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3 py-2 tabular-nums"
            >
              <strong className="font-semibold">{booking.bookingCode}</strong>
              <span className="text-muted-foreground">
                {new Date(booking.startTime).toLocaleString('vi-VN')} –{' '}
                {new Date(booking.endTime).toLocaleString('vi-VN')}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap justify-end gap-2">
          <AlertDialogCancel
            type="button"
            variant="outline"
            size="sm"
            disabled={isConfirming}
            data-testid="admin-warning-cancel-btn"
          >
            Quay lại
          </AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={onConfirm}
            disabled={isConfirming}
            data-testid="admin-warning-confirm-btn"
          >
            {isConfirming ? 'Đang chuyển...' : 'Vẫn chuyển sang bảo trì'}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
