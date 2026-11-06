import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Mail, RotateCw } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Field } from '@/components/common/Field';
import { EmptyState, ErrorState } from '@/components/common/EmptyState';
import { NativeSelect } from '@/components/common/NativeSelect';
import { Pagination } from '@/components/common/Pagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '../hooks/useToast';
import {
  adminEmailOutboxApi,
  EmailOutboxItem,
  EmailOutboxStatus,
} from '../services/admin-email-outbox.api';
import { PaginationMeta } from '../types/room';
import { formatAuditTime } from '../utils/auditChanges';

const PAGE_SIZE = 20;

const STATUS_LABELS: Record<EmailOutboxStatus, string> = {
  QUEUED: 'Đang chờ gửi',
  SENT: 'Đã gửi',
  FAILED: 'Gửi thất bại',
  SKIPPED: 'Bỏ qua',
};
const KIND_LABELS = {
  BOOKING_CONFIRMATION: 'Xác nhận đặt phòng',
  BOOKING_CANCELLATION: 'Thông báo hủy',
  BOOKING_REMINDER: 'Nhắc lịch',
} as const;
const REASON_LABELS: Record<string, string> = {
  SMTP_ERROR: 'Lỗi máy chủ email',
  SMTP_DISABLED: 'Chưa cấu hình SMTP',
  NO_RECIPIENT: 'Không có địa chỉ nhận',
  BOOKING_CANCELLED: 'Đơn đã hủy trước khi gửi',
  BOOKING_NOT_ACTIVE: 'Đơn không còn ở trạng thái đã xác nhận',
  REMINDER_EXPIRED: 'Đã qua giờ bắt đầu',
};
const STATUS_VARIANT: Record<
  EmailOutboxStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = { QUEUED: 'secondary', SENT: 'default', FAILED: 'destructive', SKIPPED: 'outline' };

const errorMessage = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } }).response?.data?.message || fallback;

/** ADMIN view of booking email delivery with manual requeue for FAILED/SKIPPED (CWB-68). */
export const AdminEmailsPage: React.FC = () => {
  const { showToast } = useToast();
  const [items, setItems] = useState<EmailOutboxItem[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<EmailOutboxStatus | ''>('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await adminEmailOutboxApi.list(
        { page, limit: PAGE_SIZE, status: status || undefined },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setItems(res.data.items);
      setPagination(res.data.pagination);
    } catch (err) {
      if (controller.signal.aborted) return;
      setLoadError(errorMessage(err, 'Không thể tải trạng thái gửi email.'));
    } finally {
      if (requestRef.current === controller) setIsLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    void load();
    return () => requestRef.current?.abort();
  }, [load]);

  const retry = async (item: EmailOutboxItem) => {
    if (retryingId) return;
    setRetryingId(item.id);
    try {
      await adminEmailOutboxApi.retry(item.id);
      showToast(`Đã đưa email ${item.bookingCode} vào hàng đợi gửi lại`, 'success');
      await load();
    } catch (err) {
      showToast(errorMessage(err, 'Không thể gửi lại email.'), 'error');
      await load();
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow="Quản trị"
        title="Email thông báo"
        description="Trạng thái gửi email xác nhận, nhắc lịch và hủy đặt phòng. Hệ thống tự gửi lại khi lỗi; email thất bại hoặc bị bỏ qua có thể được gửi lại thủ công."
      />

      <div className="max-w-xs">
        <Field id="email-status-filter" label="Trạng thái">
          <NativeSelect
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value as EmailOutboxStatus | '');
            }}
          >
            <option value="">Tất cả</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>

      <section aria-labelledby="email-list-title" className="grid gap-4">
        <h2 id="email-list-title" className="text-lg font-semibold">
          Email gần nhất
        </h2>
        {isLoading && (
          <div className="grid gap-2" data-testid="email-loading" aria-busy="true">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        )}
        {!isLoading && loadError && (
          <ErrorState title={loadError} onRetry={() => void load()} retryTestId="email-reload" />
        )}
        {!isLoading && !loadError && items.length === 0 && (
          <EmptyState
            icon={Mail}
            title="Chưa có email nào"
            description="Email xác nhận và hủy đặt phòng sẽ xuất hiện tại đây."
          />
        )}
        {!isLoading && !loadError && items.length > 0 && (
          <ul className="divide-y rounded-lg border bg-card" data-testid="email-list">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3"
                data-testid={`email-row-${item.id}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {KIND_LABELS[item.kind]} · {item.bookingCode}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Tạo lúc {formatAuditTime(item.createdAt)} · {item.attempts} lần thử
                    {item.sentAt && ` · Gửi lúc ${formatAuditTime(item.sentAt)}`}
                    {item.lastError && ` · ${REASON_LABELS[item.lastError] ?? item.lastError}`}
                  </p>
                </div>
                <Badge variant={STATUS_VARIANT[item.status]}>{STATUS_LABELS[item.status]}</Badge>
                {(item.status === 'FAILED' || item.status === 'SKIPPED') && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void retry(item)}
                    disabled={retryingId !== null}
                    aria-label={`Gửi lại email ${item.bookingCode}`}
                    data-testid={`email-retry-${item.id}`}
                  >
                    {retryingId === item.id ? (
                      <Loader2 aria-hidden="true" className="animate-spin" />
                    ) : (
                      <RotateCw aria-hidden="true" />
                    )}
                    Gửi lại
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {!loadError && pagination && pagination.totalPages > 1 && (
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            onPageChange={setPage}
            disabled={isLoading}
            testId="email-pagination"
          />
        )}
      </section>
    </div>
  );
};
