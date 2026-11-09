import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { CalendarX, CircleAlert, Loader2, Pencil, Plus, RefreshCw, Trash2, Building2, DoorOpen } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Field } from '@/components/common/Field';
import { EmptyState, ErrorState } from '@/components/common/EmptyState';
import { NativeSelect, Checkbox } from '@/components/common/NativeSelect';
import { Pagination } from '@/components/common/Pagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { adminHeadClass, stackedTable as st } from '../components/admin/stackedTable';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '../hooks/useToast';
import { adminClosureApi } from '../services/admin-closure.api';
import { roomApi } from '../services/room.api';
import { ClosureItem, ConflictingBooking, CreateClosurePayload } from '../types/closure';
import { PaginationMeta, RoomListItem } from '../types/room';
import {
  formatVnDate,
  formatVnDateTimeLocal,
  formatVnTime,
  parseVnDateTimeLocalToUtc,
} from '../utils/bookingTime';

const PAGE_SIZE = 10;

interface ConflictData {
  count: number;
  bookings: ConflictingBooking[];
}

const formatDisplayTime = (isoString: string): string => {
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '—';
  return `${formatVnTime(date)} ${formatVnDate(date)}`;
};

export const AdminClosuresPage: React.FC = () => {
  const { showToast } = useToast();
  const [closures, setClosures] = useState<ClosureItem[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filter states
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [selectedRoomFilter, setSelectedRoomFilter] = useState<string>('');
  const [upcomingOnly, setUpcomingOnly] = useState<boolean>(false);

  // Form modal state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingClosure, setEditingClosure] = useState<ClosureItem | null>(null);
  const [formScope, setFormScope] = useState<'FACILITY' | 'ROOM'>('FACILITY');
  const [formRoomId, setFormRoomId] = useState<string>('');
  const [formStartTime, setFormStartTime] = useState<string>('');
  const [formEndTime, setFormEndTime] = useState<string>('');
  const [formReason, setFormReason] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Conflict warning modal state
  const [conflictData, setConflictData] = useState<ConflictData | null>(null);
  const [pendingPayload, setPendingPayload] = useState<CreateClosurePayload | null>(null);
  const [isConfirmingConflict, setIsConfirmingConflict] = useState(false);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<ClosureItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const requestRef = useRef<AbortController | null>(null);

  // Load rooms for filter and modal dropdown
  useEffect(() => {
    let active = true;
    void roomApi.getRooms({ limit: 100 }).then((res) => {
      if (active && res.success && res.data?.items) {
        setRooms(res.data.items);
      }
    }).catch(() => {
      // Non-critical room list failure
    });
    return () => {
      active = false;
    };
  }, []);

  const loadClosures = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setIsLoading(true);
    setLoadError(null);

    try {
      const res = await adminClosureApi.list(
        {
          page,
          limit: PAGE_SIZE,
          roomId: selectedRoomFilter || undefined,
          upcoming: upcomingOnly || undefined,
        },
        controller.signal,
      );

      if (controller.signal.aborted) return;
      if (res.success && res.data) {
        setClosures(res.data.items);
        setPagination({
          page: res.data.page,
          limit: res.data.limit,
          total: res.data.total,
          totalPages: res.data.totalPages,
        });
      }
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      const msg =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ||
        'Không thể tải danh sách khung đóng cửa.';
      setLoadError(msg);
    } finally {
      if (requestRef.current === controller) {
        setIsLoading(false);
      }
    }
  }, [page, selectedRoomFilter, upcomingOnly]);

  useEffect(() => {
    void loadClosures();
    return () => requestRef.current?.abort();
  }, [loadClosures]);

  const openCreateModal = () => {
    setEditingClosure(null);
    setFormScope('FACILITY');
    setFormRoomId('');
    // Default to tomorrow 08:00 - 12:00
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const dateStr = formatVnDate(tomorrow);
    setFormStartTime(`${dateStr}T08:00`);
    setFormEndTime(`${dateStr}T12:00`);
    setFormReason('');
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditModal = (closure: ClosureItem) => {
    setEditingClosure(closure);
    setFormScope(closure.roomId ? 'ROOM' : 'FACILITY');
    setFormRoomId(closure.roomId || '');
    const startDate = new Date(closure.startTime);
    const endDate = new Date(closure.endTime);
    setFormStartTime(isNaN(startDate.getTime()) ? '' : formatVnDateTimeLocal(startDate));
    setFormEndTime(isNaN(endDate.getTime()) ? '' : formatVnDateTimeLocal(endDate));
    setFormReason(closure.reason);
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleFormSubmit = async (e?: React.FormEvent, acknowledge = false) => {
    if (e) e.preventDefault();
    if (isSaving) return;

    if (formScope === 'ROOM' && !formRoomId) {
      setFormError('Vui lòng chọn phòng cần đóng cửa.');
      return;
    }
    if (!formStartTime || !formEndTime) {
      setFormError('Vui lòng chọn thời gian bắt đầu và kết thúc.');
      return;
    }

    const startDate = parseVnDateTimeLocalToUtc(formStartTime);
    const endDate = parseVnDateTimeLocalToUtc(formEndTime);

    if (!startDate || !endDate) {
      setFormError('Định dạng thời gian không hợp lệ.');
      return;
    }

    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();

    if (endDate.getTime() <= startDate.getTime()) {
      setFormError('Thời gian kết thúc phải sau thời gian bắt đầu.');
      return;
    }

    if (!formReason.trim()) {
      setFormError('Lý do đóng cửa không được để trống.');
      return;
    }

    setFormError(null);
    setIsSaving(true);

    const payload: CreateClosurePayload = {
      roomId: formScope === 'ROOM' ? formRoomId : null,
      startTime: startIso,
      endTime: endIso,
      reason: formReason.trim(),
      acknowledgeConflictingBookings: acknowledge,
    };

    try {
      if (editingClosure) {
        await adminClosureApi.update(editingClosure.id, payload);
        showToast('Cập nhật khung đóng cửa thành công', 'success');
      } else {
        await adminClosureApi.create(payload);
        showToast('Tạo khung đóng cửa thành công', 'success');
      }

      setIsFormOpen(false);
      setConflictData(null);
      setPendingPayload(null);
      await loadClosures();
    } catch (err: unknown) {
      const resp = (
        err as {
          response?: {
            status?: number;
            data?: {
              code?: string;
              message?: string;
              details?: { conflictingBookingCount?: number; bookings?: ConflictingBooking[] };
            };
          };
        }
      ).response;

      if (resp?.data?.code === 'CLOSURE_HAS_CONFLICTING_BOOKINGS') {
        const details = resp.data.details;
        setConflictData({
          count: details?.conflictingBookingCount || details?.bookings?.length || 0,
          bookings: details?.bookings || [],
        });
        setPendingPayload(payload);
      } else {
        setFormError(resp?.data?.message || 'Không thể lưu khung đóng cửa. Vui lòng kiểm tra lại.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmConflict = async () => {
    if (!pendingPayload || isConfirmingConflict) return;
    setIsConfirmingConflict(true);

    try {
      const payloadWithAck = { ...pendingPayload, acknowledgeConflictingBookings: true };
      if (editingClosure) {
        await adminClosureApi.update(editingClosure.id, payloadWithAck);
        showToast('Đã cập nhật khung đóng cửa (đã xác nhận các lịch trùng)', 'success');
      } else {
        await adminClosureApi.create(payloadWithAck);
        showToast('Đã tạo khung đóng cửa (đã xác nhận các lịch trùng)', 'success');
      }

      setConflictData(null);
      setPendingPayload(null);
      setIsFormOpen(false);
      await loadClosures();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ||
        'Không thể lưu khung đóng cửa sau khi xác nhận.';
      showToast(msg, 'error');
    } finally {
      setIsConfirmingConflict(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget || isDeleting) return;
    setIsDeleting(true);

    try {
      await adminClosureApi.delete(deleteTarget.id);
      showToast('Đã xóa khung đóng cửa', 'success');
      setDeleteTarget(null);
      await loadClosures();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ||
        'Không thể xóa khung đóng cửa.';
      showToast(msg, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const filterRoomId = useId();
  const filterUpcomingId = useId();

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8">
      <PageHeader
        eyebrow="Vận hành"
        title="Quản lý khung đóng cửa"
        description="Thiết lập lịch nghỉ lễ, bảo trì toàn cơ sở hoặc đóng cửa theo phòng. Hệ thống tự động chặn đặt phòng trong các khung giờ này."
        actions={
          <Button onClick={openCreateModal} data-testid="btn-add-closure">
            <Plus aria-hidden="true" className="size-4" />
            Thêm khung đóng cửa
          </Button>
        }
      />

      {/* Filter bar */}
      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-1 flex-col gap-4 sm:flex-row sm:items-end">
            <Field id={filterRoomId} label="Lọc theo phòng" className="w-full sm:w-64">
              <NativeSelect
                id={filterRoomId}
                value={selectedRoomFilter}
                onChange={(e) => {
                  setSelectedRoomFilter(e.target.value);
                  setPage(1);
                }}
                data-testid="filter-room-select"
              >
                <option value="">Tất cả phạm vi</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    Phòng: {r.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <div className="flex items-center gap-2 pb-2">
              <Checkbox
                id={filterUpcomingId}
                checked={upcomingOnly}
                onChange={(e) => {
                  setUpcomingOnly(e.target.checked);
                  setPage(1);
                }}
                data-testid="filter-upcoming-checkbox"
              />
              <label
                htmlFor={filterUpcomingId}
                className="cursor-pointer text-sm font-medium text-foreground select-none"
              >
                Chỉ hiện khung sắp tới / đang diễn ra
              </label>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadClosures()}
            disabled={isLoading}
            data-testid="btn-refresh-closures"
          >
            <RefreshCw aria-hidden="true" className={`size-4 ${isLoading ? 'animate-spin' : ''}`} />
            Làm mới
          </Button>
        </div>
      </Card>

      {/* Closures table */}
      {loadError ? (
        <ErrorState
          title="Không thể tải danh sách khung đóng cửa"
          description={loadError}
          onRetry={() => void loadClosures()}
        />
      ) : isLoading && closures.length === 0 ? (
        <Card className="p-6">
          <div className="space-y-4">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </Card>
      ) : closures.length === 0 ? (
        <EmptyState
          icon={CalendarX}
          title="Chưa có khung đóng cửa nào"
          description="Hiện tại không có lịch nghỉ lễ hoặc khung bảo trì nào được ghi nhận."
          action={
            <Button onClick={openCreateModal} data-testid="btn-empty-add-closure">
              <Plus aria-hidden="true" className="size-4" />
              Thêm khung đóng cửa
            </Button>
          }
        />
      ) : (
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
          <div className={st.frame}>
            <Table className={cn('md:min-w-[760px]', st.table)} data-testid="closures-table">
              <TableHeader className={cn('bg-muted/40', st.header)}>
                <TableRow className="hover:bg-transparent">
                  <TableHead className={adminHeadClass}>Phạm vi</TableHead>
                  <TableHead className={adminHeadClass}>Bắt đầu</TableHead>
                  <TableHead className={adminHeadClass}>Kết thúc</TableHead>
                  <TableHead className={adminHeadClass}>Lý do</TableHead>
                  <TableHead className={adminHeadClass}>Người tạo</TableHead>
                  <TableHead className={cn(adminHeadClass, 'text-right')}>Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={st.body}>
                {closures.map((closure) => (
                  <TableRow
                    key={closure.id}
                    className={st.row}
                    data-testid={`closure-row-${closure.id}`}
                  >
                    <TableCell
                      data-label="Phạm vi"
                      className={cn('px-4 py-3 font-medium', st.cell, st.full)}
                    >
                      {closure.roomId && closure.room ? (
                        <Badge variant="outline" className="flex w-fit items-center gap-1">
                          <DoorOpen aria-hidden="true" className="size-3" />
                          {closure.room.name}
                        </Badge>
                      ) : (
                        <Badge
                          variant="default"
                          className="flex w-fit items-center gap-1 bg-purple-600 hover:bg-purple-700"
                        >
                          <Building2 aria-hidden="true" className="size-3" />
                          Toàn cơ sở
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell
                      data-label="Bắt đầu"
                      className={cn('px-4 py-3 tabular-nums text-muted-foreground', st.cell)}
                    >
                      {formatDisplayTime(closure.startTime)}
                    </TableCell>
                    <TableCell
                      data-label="Kết thúc"
                      className={cn('px-4 py-3 tabular-nums text-muted-foreground', st.cell)}
                    >
                      {formatDisplayTime(closure.endTime)}
                    </TableCell>
                    <TableCell
                      data-label="Lý do"
                      className={cn('max-w-xs truncate px-4 py-3 max-md:max-w-none', st.cell, st.full)}
                      title={closure.reason}
                    >
                      {closure.reason}
                    </TableCell>
                    <TableCell
                      data-label="Người tạo"
                      className={cn('px-4 py-3 text-muted-foreground', st.cell, st.full)}
                    >
                      {closure.createdBy?.fullName || closure.createdBy?.email || '—'}
                    </TableCell>
                    <TableCell
                      className={cn('px-4 py-3 text-right', st.cell, st.full, st.noLabel)}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditModal(closure)}
                          title="Chỉnh sửa"
                          data-testid={`btn-edit-closure-${closure.id}`}
                        >
                          <Pencil aria-hidden="true" className="size-4" />
                          <span className="sr-only">Chỉnh sửa</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(closure)}
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          title="Xóa"
                          data-testid={`btn-delete-closure-${closure.id}`}
                        >
                          <Trash2 aria-hidden="true" className="size-4" />
                          <span className="sr-only">Xóa</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="flex justify-center pt-2">
              <Pagination
                page={page}
                totalPages={pagination.totalPages}
                onPageChange={(newPage) => setPage(newPage)}
              />
            </div>
          )}
        </div>
      )}

      {/* Modal Thêm / Sửa khung đóng cửa */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingClosure ? 'Chỉnh sửa khung đóng cửa' : 'Thêm khung đóng cửa mới'}
            </DialogTitle>
            <DialogDescription>
              Thiết lập khung giờ đóng cửa. Hệ thống sẽ chặn các lượt đặt phòng mới trong thời gian này.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={(e) => void handleFormSubmit(e)} className="grid gap-4 py-2">
            <Field id="closure-scope" label="Phạm vi áp dụng">
              <NativeSelect
                id="closure-scope"
                value={formScope}
                onChange={(e) => setFormScope(e.target.value as 'FACILITY' | 'ROOM')}
                data-testid="closure-scope-select"
              >
                <option value="FACILITY">Toàn bộ cơ sở (tất cả các phòng)</option>
                <option value="ROOM">Theo từng phòng cụ thể</option>
              </NativeSelect>
            </Field>

            {formScope === 'ROOM' && (
              <Field id="closure-room-id" label="Chọn phòng">
                <NativeSelect
                  id="closure-room-id"
                  value={formRoomId}
                  onChange={(e) => setFormRoomId(e.target.value)}
                  data-testid="closure-room-select"
                >
                  <option value="">-- Chọn phòng --</option>
                  {editingClosure?.room && !rooms.some((r) => r.id === editingClosure.room!.id) && (
                    <option value={editingClosure.room.id}>{editingClosure.room.name}</option>
                  )}
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="closure-start-time" label="Thời gian bắt đầu">
                <Input
                  id="closure-start-time"
                  type="datetime-local"
                  value={formStartTime}
                  onChange={(e) => setFormStartTime(e.target.value)}
                  data-testid="closure-start-time"
                />
              </Field>

              <Field id="closure-end-time" label="Thời gian kết thúc">
                <Input
                  id="closure-end-time"
                  type="datetime-local"
                  value={formEndTime}
                  onChange={(e) => setFormEndTime(e.target.value)}
                  data-testid="closure-end-time"
                />
              </Field>
            </div>

            <Field id="closure-reason" label="Lý do đóng cửa" hint="Ví dụ: Nghỉ Tết Dương lịch, Sửa chữa hệ thống điện...">
              <Textarea
                id="closure-reason"
                rows={3}
                maxLength={500}
                value={formReason}
                onChange={(e) => setFormReason(e.target.value)}
                placeholder="Nhập lý do đóng cửa..."
                data-testid="closure-reason"
              />
            </Field>

            {formError && (
              <div
                className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                data-testid="closure-form-error"
              >
                <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsFormOpen(false)}
                disabled={isSaving}
              >
                Hủy bỏ
              </Button>
              <Button type="submit" disabled={isSaving} data-testid="btn-submit-closure">
                {isSaving && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
                {editingClosure ? 'Lưu thay đổi' : 'Tạo khung đóng cửa'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Cảnh báo Xung đột với Booking hiện tại */}
      <AlertDialog
        open={!!conflictData}
        onOpenChange={(open) => {
          if (!open) {
            setConflictData(null);
            setPendingPayload(null);
          }
        }}
      >
        <AlertDialogContent className="max-w-xl">
          <AlertDialogHeader>
            <div className="flex items-center gap-2 text-amber-600">
              <CircleAlert aria-hidden="true" className="size-5" />
              <AlertDialogTitle>Cảnh báo xung đột đặt phòng</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-left text-sm text-muted-foreground">
              Khung đóng cửa này trùng với{' '}
              <strong className="text-foreground">{conflictData?.count}</strong> lượt đặt phòng đã xác nhận.
              Việc lưu khung đóng cửa sẽ{' '}
              <strong className="text-destructive">KHÔNG tự động hủy</strong> các booking này. Vui lòng liên hệ
              khách hàng hoặc xử lý dời lịch/hủy thủ công nếu cần.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {conflictData && conflictData.bookings.length > 0 && (
            <div className="max-h-60 overflow-y-auto rounded-md border text-xs">
              <table className="w-full text-left" data-testid="conflicting-bookings-table">
                <thead className="sticky top-0 border-b bg-muted px-3 py-2 font-semibold">
                  <tr>
                    <th scope="col" className="px-3 py-2">Mã booking</th>
                    <th scope="col" className="px-3 py-2">Phòng</th>
                    <th scope="col" className="px-3 py-2">Thời gian</th>
                    <th scope="col" className="px-3 py-2">Khách hàng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {conflictData.bookings.map((b) => (
                    <tr key={b.bookingCode}>
                      <td className="px-3 py-2 font-mono font-medium">{b.bookingCode}</td>
                      <td className="px-3 py-2">{b.roomName || b.roomId}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {formatDisplayTime(b.startTime)} - {formatVnTime(new Date(b.endTime))}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{b.guestName || b.userEmail || 'Khách'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel disabled={isConfirmingConflict}>Hủy bỏ</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleConfirmConflict()}
              disabled={isConfirmingConflict}
              data-testid="btn-confirm-conflict-closure"
            >
              {isConfirmingConflict && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
              Tôi hiểu và tiếp tục tạo
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal Xác nhận xóa */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa khung đóng cửa</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn xóa khung đóng cửa này?
              {deleteTarget && (
                <span className="mt-2 block rounded bg-muted p-2 font-mono text-xs text-foreground">
                  Phạm vi: {deleteTarget.room?.name ? `Phòng ${deleteTarget.room.name}` : 'Toàn cơ sở'}
                  <br />
                  Thời gian: {formatDisplayTime(deleteTarget.startTime)} - {formatDisplayTime(deleteTarget.endTime)}
                  <br />
                  Lý do: {deleteTarget.reason}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Hủy</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDeleteConfirm()}
              disabled={isDeleting}
              data-testid="btn-confirm-delete-closure"
            >
              {isDeleting && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
              Xác nhận xóa
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
