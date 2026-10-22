import type * as React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/common/Field';
import { NativeSelect } from '@/components/common/NativeSelect';
import { StatusBadge } from '@/components/common/StatusBadge';
import { cn } from '@/lib/utils';
import type { Amenity, RoomStatus } from '../../../types/room';
import type {
  AdminFormErrors,
  AdminRoomFormValues,
  FutureBookingWarningDetails,
} from '../../../types/admin-room';
import { AmenityChecklist } from './AmenityChecklist';
import { MaintenanceWarning } from './MaintenanceWarning';
import { RoomImageUpload, RoomImageUrlList } from './RoomImageManager';
import { RoomNotice } from './RoomNotice';

interface RoomFormProps {
  isEditing: boolean;
  headingRef: React.Ref<HTMLHeadingElement>;
  values: AdminRoomFormValues;
  errors: AdminFormErrors;
  isSubmitting: boolean;
  isUploadingImages: boolean;
  isConfirmingMaintenance: boolean;
  amenities: Amenity[];
  isLoadingAmenities: boolean;
  amenitiesError: string | null;
  pendingImageFiles: File[];
  imageUploadError: string | null;
  futureBookingWarning: FutureBookingWarningDetails | null;
  className?: string;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onInputChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onStatusChange: (status: RoomStatus) => void;
  onAmenityToggle: (amenityId: string) => void;
  onRetryAmenities: () => void;
  onAddImage: () => void;
  onRemoveImage: (index: number) => void;
  onSetPrimaryImage: (index: number) => void;
  onImageUrlChange: (index: number, value: string) => void;
  onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemovePendingFile: (index: number) => void;
  onDismissWarning: () => void;
  onConfirmMaintenance: () => void;
}

const RequiredMark = () => <span className="text-destructive">*</span>;

/** Inline create/edit room panel. All state and side effects live in the page. */
export function RoomForm({
  isEditing,
  headingRef,
  values,
  errors,
  isSubmitting,
  isUploadingImages,
  isConfirmingMaintenance,
  amenities,
  isLoadingAmenities,
  amenitiesError,
  pendingImageFiles,
  imageUploadError,
  futureBookingWarning,
  className,
  onClose,
  onSubmit,
  onInputChange,
  onStatusChange,
  onAmenityToggle,
  onRetryAmenities,
  onAddImage,
  onRemoveImage,
  onSetPrimaryImage,
  onImageUrlChange,
  onFileSelect,
  onRemovePendingFile,
  onDismissWarning,
  onConfirmMaintenance,
}: RoomFormProps) {
  const isBusy = isSubmitting || isUploadingImages;

  return (
    <section
      className={cn(
        'grid min-w-0 animate-rise gap-5 rounded-xl border bg-card p-5 sm:p-6',
        className,
      )}
      data-testid="admin-room-form"
      aria-labelledby="admin-room-form-title"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="grid gap-1">
          <p className="eyebrow">{isEditing ? 'Cập nhật' : 'Tạo mới'}</p>
          <h2
            id="admin-room-form-title"
            ref={headingRef}
            tabIndex={-1}
            className="scroll-mt-6 text-h3 outline-none"
          >
            {isEditing ? 'Chỉnh Sửa Phòng' : 'Thêm Phòng Mới'}
          </h2>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          disabled={isBusy}
          aria-label="Đóng biểu mẫu phòng"
        >
          <X aria-hidden="true" />
        </Button>
      </div>

      {/* Status control for edit / notice for create */}
      {isEditing ? (
        <Field id="room-status-select" label="Trạng thái phòng">
          <NativeSelect
            name="status"
            value={values.status}
            onChange={(e) => onStatusChange(e.target.value as RoomStatus)}
            disabled={isBusy || isConfirmingMaintenance}
            data-testid="admin-room-status-select"
          >
            <option value="AVAILABLE">AVAILABLE (Sẵn sàng)</option>
            <option value="MAINTENANCE">MAINTENANCE (Bảo trì)</option>
          </NativeSelect>
        </Field>
      ) : (
        <div className="rounded-lg bg-muted px-4 py-3 text-sm">
          <p className="flex flex-wrap items-center gap-2">
            <strong className="font-semibold">Trạng thái ban đầu:</strong>
            <StatusBadge kind="room" status="AVAILABLE" label="AVAILABLE" />
            <small className="text-[0.8125rem] text-muted-foreground">
              (Mặc định cho phòng mới)
            </small>
          </p>
        </div>
      )}

      {futureBookingWarning && (
        <MaintenanceWarning
          warning={futureBookingWarning}
          isConfirming={isConfirmingMaintenance}
          onDismiss={onDismissWarning}
          onConfirm={onConfirmMaintenance}
        />
      )}

      {errors.general && (
        <RoomNotice tone="error" role="alert" data-testid="form-general-error">
          {errors.general}
        </RoomNotice>
      )}

      <form onSubmit={onSubmit} noValidate aria-busy={isBusy} className="grid gap-5">
        <Field
          id="room-name"
          label={
            <>
              Tên phòng <RequiredMark />
            </>
          }
          error={errors.name}
          errorId="error-name"
          errorTestId="error-name"
        >
          <Input
            type="text"
            name="name"
            value={values.name}
            onChange={onInputChange}
            placeholder="Ví dụ: Phòng Họp Sáng Tạo A"
            maxLength={191}
            disabled={isBusy}
          />
        </Field>

        <Field
          id="room-description"
          label="Mô tả phòng"
          error={errors.description}
          errorId="error-description"
          errorTestId="error-description"
        >
          <Textarea
            name="description"
            value={values.description}
            onChange={onInputChange}
            rows={3}
            placeholder="Mô tả các đặc điểm nổi bật, ánh sáng, thiết bị..."
            disabled={isBusy}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="room-capacity"
            label={
              <>
                Sức chứa (người) <RequiredMark />
              </>
            }
            error={errors.capacity}
            errorId="error-capacity"
            errorTestId="error-capacity"
          >
            <Input
              type="number"
              name="capacity"
              min="1"
              className="tabular-nums"
              value={values.capacity}
              onChange={onInputChange}
              placeholder="Ví dụ: 8"
              disabled={isBusy}
            />
          </Field>

          <Field
            id="room-price"
            label={
              <>
                Đơn giá mỗi giờ (VNĐ) <RequiredMark />
              </>
            }
            error={errors.pricePerHour}
            errorId="error-pricePerHour"
            errorTestId="error-pricePerHour"
          >
            <Input
              type="text"
              name="pricePerHour"
              inputMode="decimal"
              className="tabular-nums"
              value={values.pricePerHour}
              onChange={onInputChange}
              placeholder="Ví dụ: 150000.00"
              disabled={isBusy}
            />
          </Field>
        </div>

        <AmenityChecklist
          amenities={amenities}
          selectedIds={values.amenityIds}
          isLoading={isLoadingAmenities}
          loadError={amenitiesError}
          error={errors.amenityIds}
          disabled={isBusy || isLoadingAmenities || Boolean(amenitiesError)}
          onToggle={onAmenityToggle}
          onRetry={onRetryAmenities}
        />

        <Separator />

        <RoomImageUrlList
          images={values.images}
          error={errors.images}
          disabled={isBusy}
          onAdd={onAddImage}
          onRemove={onRemoveImage}
          onSetPrimary={onSetPrimaryImage}
          onUrlChange={onImageUrlChange}
        />

        <RoomImageUpload
          pendingFiles={pendingImageFiles}
          uploadError={imageUploadError}
          isUploading={isUploadingImages}
          disabled={isBusy}
          onFileSelect={onFileSelect}
          onRemovePendingFile={onRemovePendingFile}
        />

        <div className="flex flex-wrap justify-end gap-2 border-t pt-5">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isBusy || isConfirmingMaintenance}
          >
            Hủy
          </Button>
          <Button
            type="submit"
            disabled={
              isBusy || isConfirmingMaintenance || isLoadingAmenities || Boolean(amenitiesError)
            }
            data-testid="admin-submit-room-btn"
          >
            {isUploadingImages
              ? 'Đang tải ảnh...'
              : isSubmitting
                ? 'Đang lưu...'
                : imageUploadError && pendingImageFiles.length > 0
                  ? 'Thử lại tải ảnh'
                  : isEditing
                    ? 'Lưu thay đổi'
                    : 'Tạo phòng'}
          </Button>
        </div>
      </form>
    </section>
  );
}
