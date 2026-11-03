import React, { useCallback, useEffect, useRef, useState } from 'react';
import { History, Search } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Field } from '@/components/common/Field';
import { EmptyState, ErrorState } from '@/components/common/EmptyState';
import { NativeSelect } from '@/components/common/NativeSelect';
import { Pagination } from '@/components/common/Pagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  adminAuditApi,
  AUDIT_ACTION_LABELS,
  AuditAction,
  AuditEntityType,
  AuditEvent,
} from '../services/admin-audit.api';
import { PaginationMeta } from '../types/room';
import { describeChanges, formatAuditTime } from '../utils/auditChanges';

const PAGE_SIZE = 20;

const errorMessage = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } }).response?.data?.message || fallback;

const emptyFilters = { entityType: '', action: '', entityId: '' };

/** ADMIN read-only trail of admin booking and room status changes (CWB-67). */
export const AdminAuditPage: React.FC = () => {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await adminAuditApi.list(
        {
          page,
          limit: PAGE_SIZE,
          entityType: (filters.entityType || undefined) as AuditEntityType | undefined,
          action: (filters.action || undefined) as AuditAction | undefined,
          entityId: filters.entityId.trim() || undefined,
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setEvents(res.data.items);
      setPagination(res.data.pagination);
    } catch (err) {
      if (controller.signal.aborted) return;
      setLoadError(errorMessage(err, 'Không thể tải lịch sử thao tác.'));
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

  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow="Quản trị"
        title="Lịch sử thao tác"
        description="Ai đã thay đổi gì và khi nào: thanh toán, hủy, check-in, hoàn tất, không đến, đặt phòng khách vãng lai và trạng thái phòng."
      />

      <Card className="p-5 sm:p-6">
        <form
          noValidate
          onSubmit={applyFilters}
          className="grid gap-4 sm:grid-cols-[1fr_1fr_1.5fr_auto] sm:items-end"
          data-testid="audit-filters"
        >
          <Field id="audit-entity-type" label="Đối tượng">
            <NativeSelect
              value={draft.entityType}
              onChange={(e) => setDraft((d) => ({ ...d, entityType: e.target.value }))}
            >
              <option value="">Tất cả</option>
              <option value="BOOKING">Đặt phòng</option>
              <option value="ROOM">Phòng</option>
            </NativeSelect>
          </Field>
          <Field id="audit-action" label="Thao tác">
            <NativeSelect
              value={draft.action}
              onChange={(e) => setDraft((d) => ({ ...d, action: e.target.value }))}
            >
              <option value="">Tất cả</option>
              {Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="audit-entity-id" label="Mã đối tượng (ID)">
            <Input
              value={draft.entityId}
              maxLength={191}
              placeholder="ID đặt phòng hoặc phòng"
              onChange={(e) => setDraft((d) => ({ ...d, entityId: e.target.value }))}
            />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" data-testid="audit-apply">
              <Search aria-hidden="true" />
              Lọc
            </Button>
            <Button type="button" variant="outline" onClick={resetFilters}>
              Xóa lọc
            </Button>
          </div>
        </form>
      </Card>

      <section aria-labelledby="audit-list-title" className="grid gap-4">
        <h2 id="audit-list-title" className="text-lg font-semibold">
          Sự kiện gần nhất
        </h2>
        {isLoading && (
          <div className="grid gap-2" data-testid="audit-loading" aria-busy="true">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}
        {!isLoading && loadError && (
          <ErrorState title={loadError} onRetry={() => void load()} retryTestId="audit-retry" />
        )}
        {!isLoading && !loadError && events.length === 0 && (
          <EmptyState
            icon={History}
            title="Chưa có thao tác nào"
            description="Các thay đổi của quản trị viên sẽ xuất hiện tại đây."
          />
        )}
        {!isLoading && !loadError && events.length > 0 && (
          <ul className="divide-y rounded-lg border bg-card" data-testid="audit-list">
            {events.map((event) => (
              <li
                key={event.id}
                className="grid gap-2 px-4 py-3"
                data-testid={`audit-row-${event.id}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {AUDIT_ACTION_LABELS[event.action] ?? event.action}
                  </span>
                  <Badge variant="outline">
                    {event.entityType === 'ROOM' ? 'Phòng' : 'Đặt phòng'}
                  </Badge>
                  <time
                    dateTime={event.createdAt}
                    className="ml-auto text-sm text-muted-foreground tabular-nums"
                  >
                    {formatAuditTime(event.createdAt)}
                  </time>
                </div>
                <p className="text-sm break-all text-muted-foreground">
                  ID: {event.entityId} · Người thực hiện: {event.actorId} ({event.actorRole})
                </p>
                <dl className="grid gap-1 text-sm">
                  {describeChanges(event).map((change) => (
                    <div key={change.key} className="flex flex-wrap gap-x-2">
                      <dt className="text-muted-foreground">{change.label}:</dt>
                      <dd className="break-words">
                        {change.from !== null && (
                          <>
                            <span className="line-through opacity-70">{change.from}</span>
                            {' → '}
                          </>
                        )}
                        <span className="font-medium">{change.to}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
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
            testId="audit-pagination"
          />
        )}
      </section>
    </div>
  );
};
