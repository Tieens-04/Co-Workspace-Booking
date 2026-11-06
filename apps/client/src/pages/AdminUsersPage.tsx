import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CircleAlert, Loader2, Lock, LockOpen, Search, TriangleAlert, Users } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Field } from '@/components/common/Field';
import { EmptyState, ErrorState } from '@/components/common/EmptyState';
import { NativeSelect } from '@/components/common/NativeSelect';
import { Pagination } from '@/components/common/Pagination';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '../hooks/useToast';
import { useReturnFocus } from '../hooks/useReturnFocus';
import {
  AccountRole,
  AccountStatus,
  adminUserApi,
  AdminUserItem,
  AffectedBooking,
} from '../services/admin-user.api';
import { PaginationMeta } from '../types/room';
import { formatAuditTime } from '../utils/auditChanges';

const PAGE_SIZE = 20;
const emptyFilters = { q: '', role: '', status: '' };

const ROLE_LABELS: Record<AccountRole, string> = { CUSTOMER: 'Khách hàng', ADMIN: 'Quản trị' };
const STATUS_LABELS: Record<AccountStatus, string> = {
  ACTIVE: 'Đang hoạt động',
  LOCKED: 'Đã khóa',
};

const errorMessage = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } }).response?.data?.message || fallback;

interface StatusChange {
  user: AdminUserItem;
  next: AccountStatus;
}

interface LockOutcome {
  user: AdminUserItem;
  bookings: AffectedBooking[];
}

/** ADMIN customer management: search accounts, lock/unlock customers with a reason (CWB-79). */
export const AdminUsersPage: React.FC = () => {
  const { showToast } = useToast();
  const [items, setItems] = useState<AdminUserItem[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [change, setChange] = useState<StatusChange | null>(null);
  const [lockOutcome, setLockOutcome] = useState<LockOutcome | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await adminUserApi.list(
        {
          page,
          limit: PAGE_SIZE,
          q: filters.q.trim() || undefined,
          role: (filters.role || undefined) as AccountRole | undefined,
          status: (filters.status || undefined) as AccountStatus | undefined,
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setItems(res.data.items);
      setPagination(res.data.pagination);
    } catch (err) {
      if (controller.signal.aborted) return;
      setLoadError(errorMessage(err, 'Không thể tải danh sách tài khoản.'));
    } finally {
      if (requestRef.current === controller) setIsLoading(false);
    }
  }, [page, filters]);

  useEffect(() => {
    void load();
    return () => requestRef.current?.abort();
  }, [load]);

  const applyFilters = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setFilters(draft);
  };

  const resetFilters = () => {
    setDraft(emptyFilters);
    setPage(1);
    setFilters(emptyFilters);
  };

  const handleChanged = (result: { user: AdminUserItem; affectedBookings: AffectedBooking[] }) => {
    const locked = result.user.status === 'LOCKED';
    showToast(
      `${locked ? 'Đã khóa' : 'Đã mở khóa'} tài khoản ${result.user.email}`,
      locked ? 'info' : 'success',
    );
    setLockOutcome(locked ? { user: result.user, bookings: result.affectedBookings } : null);
    setChange(null);
    void load();
  };

  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow="Quản trị"
        title="Khách hàng"
        description="Tra cứu tài khoản theo email, tên hoặc số điện thoại; xem số lượt đặt, số lần không đến và khóa tài khoản lạm dụng."
      />

      {lockOutcome && (
        <Alert data-testid="lock-outcome">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Đã khóa tài khoản {lockOutcome.user.email}</AlertTitle>
          <AlertDescription>
            {lockOutcome.bookings.length === 0 ? (
              <p>Khách không có lượt đặt sắp tới.</p>
            ) : (
              <div className="grid gap-2">
                <p>
                  {lockOutcome.bookings.length} lượt đặt sắp tới vẫn được giữ (không tự hủy). Liên
                  hệ khách hoặc hủy thủ công trong mục Quản lý đặt phòng nếu cần:
                </p>
                <ul className="grid gap-1" data-testid="affected-bookings">
                  {lockOutcome.bookings.map((b) => (
                    <li key={b.id} className="tabular-nums">
                      <strong className="font-semibold">{b.bookingCode}</strong> · {b.roomName} ·{' '}
                      {formatAuditTime(b.startTime)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => setLockOutcome(null)}
            >
              Đã hiểu
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Card className="p-5 sm:p-6">
        <form
          noValidate
          onSubmit={applyFilters}
          className="grid gap-4 sm:grid-cols-[1.5fr_1fr_1fr_auto] sm:items-end"
          data-testid="user-filters"
          role="search"
        >
          <Field id="user-search" label="Email, tên hoặc số điện thoại">
            <Input
              value={draft.q}
              maxLength={191}
              placeholder="Ví dụ: an@example.com, 0901..."
              onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))}
            />
          </Field>
          <Field id="user-role-filter" label="Vai trò">
            <NativeSelect
              value={draft.role}
              onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))}
            >
              <option value="">Tất cả</option>
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="user-status-filter" label="Trạng thái">
            <NativeSelect
              value={draft.status}
              onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
            >
              <option value="">Tất cả</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" data-testid="user-apply">
              <Search aria-hidden="true" />
              Tìm
            </Button>
            <Button type="button" variant="outline" onClick={resetFilters}>
              Xóa lọc
            </Button>
          </div>
        </form>
      </Card>

      <section aria-labelledby="user-list-title" className="grid gap-4">
        <h2 id="user-list-title" className="text-lg font-semibold">
          Tài khoản
          {pagination && !isLoading && !loadError && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({pagination.total})
            </span>
          )}
        </h2>
        {isLoading && (
          <div className="grid gap-2" data-testid="user-loading" aria-busy="true">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}
        {!isLoading && loadError && (
          <ErrorState title={loadError} onRetry={() => void load()} retryTestId="user-reload" />
        )}
        {!isLoading && !loadError && items.length === 0 && (
          <EmptyState
            icon={Users}
            title="Không có tài khoản phù hợp"
            description="Thử từ khóa khác hoặc xóa bộ lọc."
          />
        )}
        {!isLoading && !loadError && items.length > 0 && (
          <ul className="divide-y rounded-lg border bg-card" data-testid="user-list">
            {items.map((user) => (
              <li
                key={user.id}
                className="flex flex-wrap items-start gap-3 px-4 py-3"
                data-testid={`user-row-${user.id}`}
              >
                <div className="min-w-0 flex-1 basis-64">
                  <p className="font-medium break-words">{user.fullName}</p>
                  <p className="text-sm break-all text-muted-foreground">
                    {user.email}
                    {user.phoneNumber && ` · ${user.phoneNumber}`}
                  </p>
                  <p className="text-sm text-muted-foreground tabular-nums">
                    {user.bookingCount} lượt đặt · {user.noShowCount} lần không đến ·{' '}
                    {user.upcomingBookingCount} sắp tới
                    {user.lastBookingAt && ` · Đặt gần nhất ${formatAuditTime(user.lastBookingAt)}`}
                  </p>
                  {user.status === 'LOCKED' && user.lockReason && (
                    <p className="text-sm break-words text-destructive">
                      Lý do khóa: {user.lockReason}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{ROLE_LABELS[user.role]}</Badge>
                  <Badge variant={user.status === 'LOCKED' ? 'destructive' : 'secondary'}>
                    {STATUS_LABELS[user.status]}
                  </Badge>
                  {user.role === 'CUSTOMER' && (
                    <Button
                      type="button"
                      variant={user.status === 'LOCKED' ? 'outline' : 'destructive'}
                      size="sm"
                      onClick={() =>
                        setChange({
                          user,
                          next: user.status === 'LOCKED' ? 'ACTIVE' : 'LOCKED',
                        })
                      }
                      aria-label={`${user.status === 'LOCKED' ? 'Mở khóa' : 'Khóa'} tài khoản ${user.email}`}
                      data-testid={`user-toggle-${user.id}`}
                    >
                      {user.status === 'LOCKED' ? (
                        <LockOpen aria-hidden="true" />
                      ) : (
                        <Lock aria-hidden="true" />
                      )}
                      {user.status === 'LOCKED' ? 'Mở khóa' : 'Khóa'}
                    </Button>
                  )}
                </div>
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
            testId="user-pagination"
          />
        )}
      </section>

      <AccountStatusDialog change={change} onClose={() => setChange(null)} onDone={handleChanged} />
    </div>
  );
};

interface AccountStatusDialogProps {
  change: StatusChange | null;
  onClose: () => void;
  onDone: (result: { user: AdminUserItem; affectedBookings: AffectedBooking[] }) => void;
}

/** Lock/unlock confirmation with a required reason. Not dismissible while submitting. */
function AccountStatusDialog({ change, onClose, onDone }: AccountStatusDialogProps) {
  const [shown, setShown] = useState<StatusChange | null>(change);
  const [reason, setReason] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const returnFocus = useReturnFocus();
  if (change && change !== shown) {
    setShown(change);
    setReason('');
    setValidationError(null);
    setError(null);
  }

  const locking = shown?.next === 'LOCKED';
  const blockWhileSubmitting = (e: Event) => {
    if (isSubmitting) e.preventDefault();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!change || isSubmitting) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      setValidationError('Vui lòng nhập lý do');
      return;
    }
    setValidationError(null);
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await adminUserApi.updateStatus(change.user.id, change.next, trimmed);
      onDone(res.data);
    } catch (err) {
      setError(errorMessage(err, 'Không thể cập nhật trạng thái tài khoản.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={change !== null}
      onOpenChange={(open) => {
        if (!open && !isSubmitting) onClose();
      }}
    >
      <DialogContent
        data-testid="user-status-modal"
        className="sm:max-w-[480px]"
        {...returnFocus}
        onEscapeKeyDown={blockWhileSubmitting}
        onInteractOutside={blockWhileSubmitting}
      >
        <DialogHeader className="text-left sm:text-left">
          <DialogTitle className="flex items-center gap-2">
            {locking ? (
              <Lock aria-hidden="true" className="size-5 shrink-0 text-destructive" />
            ) : (
              <LockOpen aria-hidden="true" className="size-5 shrink-0" />
            )}
            {locking ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
          </DialogTitle>
          <DialogDescription>
            <strong className="font-semibold break-all text-foreground">{shown?.user.email}</strong>{' '}
            — {shown?.user.fullName}
          </DialogDescription>
        </DialogHeader>

        {locking && (
          <Alert data-testid="lock-warning">
            <TriangleAlert aria-hidden="true" />
            <AlertDescription>
              Khách sẽ bị đăng xuất ngay và không thể đăng nhập hay đặt phòng.
              {shown && shown.user.upcomingBookingCount > 0
                ? ` ${shown.user.upcomingBookingCount} lượt đặt sắp tới sẽ được giữ nguyên, không tự hủy.`
                : ' Khách không có lượt đặt sắp tới.'}
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={submit} className="grid gap-6" noValidate>
          <Field
            id="userStatusReason"
            label={
              <>
                Lý do <span className="text-destructive">*</span>
              </>
            }
            error={validationError}
          >
            <Textarea
              rows={3}
              maxLength={500}
              data-testid="user-status-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={locking ? 'Ví dụ: đặt giữ chỗ hàng loạt, nhiều lần không đến...' : ''}
              disabled={isSubmitting}
            />
          </Field>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
              Đóng
            </Button>
            <Button
              type="submit"
              variant={locking ? 'destructive' : 'default'}
              data-testid="user-status-submit"
              disabled={isSubmitting}
              aria-busy={isSubmitting || undefined}
            >
              {isSubmitting && <Loader2 aria-hidden="true" className="animate-spin" />}
              {locking ? 'Xác nhận khóa' : 'Xác nhận mở khóa'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
