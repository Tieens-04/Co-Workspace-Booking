import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CircleAlert, Loader2, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Field } from '@/components/common/Field';
import { EmptyState, ErrorState } from '@/components/common/EmptyState';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AmenityIcon } from '../components/rooms/AmenityIcon';
import { useToast } from '../hooks/useToast';
import { adminAmenityApi, AdminAmenity } from '../services/admin-amenity.api';

const emptyForm = { name: '', icon: '', description: '' };

const errorMessage = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } }).response?.data?.message || fallback;

/** ADMIN amenity catalog: create, edit and delete only when no room uses the amenity. */
export const AdminAmenitiesPage: React.FC = () => {
  const { showToast } = useToast();
  const [amenities, setAmenities] = useState<AdminAmenity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<AdminAmenity | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const load = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await adminAmenityApi.list(controller.signal);
      if (controller.signal.aborted) return;
      if (res.success) setAmenities(res.data);
    } catch (err) {
      if (controller.signal.aborted) return;
      setLoadError(errorMessage(err, 'Không thể tải danh sách tiện ích.'));
    } finally {
      if (requestRef.current === controller) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => requestRef.current?.abort();
  }, [load]);

  const startEdit = (amenity: AdminAmenity) => {
    setEditingId(amenity.id);
    setForm({
      name: amenity.name,
      icon: amenity.icon ?? '',
      description: amenity.description ?? '',
    });
    setFormError(null);
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    if (!form.name.trim()) {
      setFormError('Tên tiện ích không được để trống.');
      return;
    }
    if (form.icon.trim() && !/^[a-z0-9-]+$/.test(form.icon.trim())) {
      setFormError('Icon chỉ gồm chữ thường, số và dấu gạch ngang (ví dụ: wifi, coffee).');
      return;
    }
    setFormError(null);
    setIsSaving(true);
    const payload = {
      name: form.name.trim(),
      icon: form.icon.trim(),
      description: form.description.trim(),
    };
    try {
      if (editingId) {
        await adminAmenityApi.update(editingId, payload);
        showToast('Đã cập nhật tiện ích', 'success');
      } else {
        await adminAmenityApi.create(payload);
        showToast('Đã thêm tiện ích', 'success');
      }
      resetForm();
      await load();
    } catch (err) {
      setFormError(errorMessage(err, 'Không thể lưu tiện ích. Vui lòng thử lại.'));
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || isDeleting) return;
    setIsDeleting(true);
    try {
      await adminAmenityApi.remove(deleteTarget.id);
      showToast(`Đã xóa tiện ích ${deleteTarget.name}`, 'success');
      if (editingId === deleteTarget.id) resetForm();
      setDeleteTarget(null);
      await load();
    } catch (err) {
      showToast(errorMessage(err, 'Không thể xóa tiện ích.'), 'error');
      setDeleteTarget(null);
      await load();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow="Quản trị"
        title="Danh mục tiện ích"
        description="Thêm, sửa tiện ích dùng để gán cho phòng. Chỉ xóa được tiện ích chưa gán cho phòng nào."
      />

      <Card className="p-5 sm:p-6">
        <form noValidate onSubmit={handleSubmit} className="grid gap-4" data-testid="amenity-form">
          <h2 className="text-lg font-semibold">
            {editingId ? 'Sửa tiện ích' : 'Thêm tiện ích mới'}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="amenity-name" label="Tên tiện ích">
              <Input
                value={form.name}
                maxLength={100}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </Field>
            <Field id="amenity-icon" label="Icon" hint="Ví dụ: wifi, coffee, monitor, projector.">
              <Input
                value={form.icon}
                maxLength={50}
                onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
              />
            </Field>
          </div>
          <Field id="amenity-description" label="Mô tả">
            <Textarea
              value={form.description}
              maxLength={500}
              rows={2}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </Field>
          {formError && (
            <Alert variant="destructive" data-testid="amenity-form-error">
              <CircleAlert aria-hidden="true" />
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : (
                !editingId && <Plus aria-hidden="true" />
              )}
              {editingId ? 'Lưu thay đổi' : 'Thêm tiện ích'}
            </Button>
            {editingId && (
              <Button type="button" variant="outline" onClick={resetForm} disabled={isSaving}>
                Hủy sửa
              </Button>
            )}
          </div>
        </form>
      </Card>

      <section aria-labelledby="amenity-list-title" className="grid gap-4">
        <h2 id="amenity-list-title" className="text-lg font-semibold">
          Tiện ích hiện có
        </h2>
        {isLoading && (
          <div className="grid gap-2" data-testid="amenity-loading" aria-busy="true">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}
        {!isLoading && loadError && (
          <ErrorState title={loadError} onRetry={() => void load()} retryTestId="amenity-retry" />
        )}
        {!isLoading && !loadError && amenities.length === 0 && (
          <EmptyState
            icon={Sparkles}
            title="Chưa có tiện ích nào"
            description="Thêm tiện ích đầu tiên ở trên."
          />
        )}
        {!isLoading && !loadError && amenities.length > 0 && (
          <ul className="divide-y rounded-lg border bg-card" data-testid="amenity-list">
            {amenities.map((amenity) => (
              <li
                key={amenity.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3"
                data-testid={`amenity-row-${amenity.id}`}
              >
                <AmenityIcon icon={amenity.icon} aria-hidden="true" className="size-5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium break-words">{amenity.name}</p>
                  {amenity.description && (
                    <p className="text-sm break-words text-muted-foreground">
                      {amenity.description}
                    </p>
                  )}
                </div>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {amenity.roomCount} phòng
                </span>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => startEdit(amenity)}
                    aria-label={`Sửa ${amenity.name}`}
                  >
                    <Pencil aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget(amenity)}
                    aria-label={`Xóa ${amenity.name}`}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent data-testid="amenity-delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa tiện ích {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && deleteTarget.roomCount > 0
                ? `Tiện ích đang được gán cho ${deleteTarget.roomCount} phòng nên sẽ không thể xóa. Hãy gỡ khỏi các phòng trước.`
                : 'Tiện ích chưa được gán cho phòng nào. Thao tác này không thể hoàn tác.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Quay lại</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void confirmDelete()}
              disabled={isDeleting || (deleteTarget?.roomCount ?? 0) > 0}
              data-testid="amenity-delete-confirm"
            >
              {isDeleting ? 'Đang xóa…' : 'Xóa'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
