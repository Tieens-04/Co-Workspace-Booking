import type * as React from 'react';
import { CircleAlert, ImageIcon, LoaderCircle, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AdminRoomImageItem } from '../../../types/admin-room';
import { RoomNotice } from './RoomNotice';

interface RoomImageUrlListProps {
  images: AdminRoomImageItem[];
  error?: string;
  disabled: boolean;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onSetPrimary: (index: number) => void;
  onUrlChange: (index: number, value: string) => void;
}

/** Editable list of image URLs with exactly one primary image. */
export function RoomImageUrlList({
  images,
  error,
  disabled,
  onAdd,
  onRemove,
  onSetPrimary,
  onUrlChange,
}: RoomImageUrlListProps) {
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">Danh sách URL ảnh</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAdd}
          disabled={disabled}
          data-testid="admin-add-image-btn"
        >
          <Plus aria-hidden="true" />
          Thêm URL ảnh
        </Button>
      </div>
      <p className="text-[0.8125rem] text-muted-foreground">
        Nhập URL ảnh (HTTP/HTTPS). Nếu có ảnh, phải chọn đúng 1 ảnh chính.
      </p>

      {error && (
        <p
          id="error-images"
          className="flex items-start gap-1.5 text-[0.8125rem] text-destructive"
          data-testid="error-images"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      )}

      {images.length > 0 && (
        <div className="grid gap-2">
          {images.map((img, idx) => (
            <div
              key={idx}
              className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2"
              data-testid={`admin-image-row-${idx}`}
            >
              <label htmlFor={`room-image-url-${idx}`} className="sr-only">
                URL ảnh {idx + 1}
              </label>
              <Input
                id={`room-image-url-${idx}`}
                type="url"
                placeholder="https://example.com/image.jpg"
                value={img.imageUrl}
                onChange={(e) => onUrlChange(idx, e.target.value)}
                disabled={disabled}
                maxLength={500}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'error-images' : undefined}
                data-testid={`admin-image-input-${idx}`}
              />
              <label className="flex cursor-pointer items-center gap-1.5 text-[0.8125rem] whitespace-nowrap has-disabled:cursor-not-allowed has-disabled:opacity-60">
                <input
                  type="radio"
                  name="primaryImage"
                  className="size-4 cursor-pointer accent-primary disabled:cursor-not-allowed"
                  checked={img.isPrimary}
                  onChange={() => onSetPrimary(idx)}
                  disabled={disabled}
                  data-testid={`admin-primary-radio-${idx}`}
                />
                <span>Ảnh chính</span>
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-status-cancelled-bg"
                onClick={() => onRemove(idx)}
                disabled={disabled}
                data-testid={`admin-remove-image-${idx}`}
              >
                <Trash2 aria-hidden="true" />
                Xóa
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface RoomImageUploadProps {
  pendingFiles: File[];
  uploadError: string | null;
  isUploading: boolean;
  disabled: boolean;
  onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemovePendingFile: (index: number) => void;
}

/** Native multi-file picker for direct (Cloudinary) uploads plus the pending file queue. */
export function RoomImageUpload({
  pendingFiles,
  uploadError,
  isUploading,
  disabled,
  onFileSelect,
  onRemovePendingFile,
}: RoomImageUploadProps) {
  return (
    <div className="grid gap-2">
      <label htmlFor="room-image-files" className="text-sm font-medium">
        Tải ảnh trực tiếp (Cloudinary)
      </label>
      <p className="text-[0.8125rem] text-muted-foreground">
        Hỗ trợ JPEG, PNG, WebP. Tối đa 10 ảnh, dung lượng tối đa 5MB mỗi ảnh.
      </p>

      {uploadError && (
        <RoomNotice
          tone="error"
          role="alert"
          id="error-image-upload"
          data-testid="image-upload-error"
        >
          <span>{uploadError}</span>
        </RoomNotice>
      )}

      <input
        id="room-image-files"
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        onChange={onFileSelect}
        disabled={disabled}
        aria-describedby={uploadError ? 'error-image-upload' : undefined}
        data-testid="admin-room-files-input"
        className="block w-full cursor-pointer rounded-lg border border-dashed border-input bg-card p-3 text-sm text-muted-foreground transition-colors duration-150 file:mr-3 file:h-8 file:cursor-pointer file:rounded-md file:border file:border-input file:bg-card file:px-3 file:text-[0.8125rem] file:font-medium file:text-foreground hover:border-foreground disabled:cursor-not-allowed disabled:opacity-50"
      />

      {pendingFiles.length > 0 && (
        <div className="grid gap-2" data-testid="admin-pending-files-list">
          <p className="text-[0.8125rem] text-muted-foreground">
            Đã chọn {pendingFiles.length} file chờ tải lên:
          </p>
          <ul className="divide-y rounded-lg border">
            {pendingFiles.map((file, idx) => (
              <li
                key={`${file.name}-${idx}`}
                className="flex items-center gap-2 py-1.5 pr-1.5 pl-3 text-sm"
                data-testid={`admin-pending-file-${idx}`}
              >
                <ImageIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate" title={file.name}>
                  {file.name}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  ({(file.size / 1024 / 1024).toFixed(2)} MB)
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => onRemovePendingFile(idx)}
                  disabled={disabled}
                  aria-label={`Xóa file ${file.name}`}
                  data-testid={`admin-remove-file-${idx}`}
                >
                  <X aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isUploading && (
        <div
          className="flex items-center gap-2 text-sm text-muted-foreground"
          aria-live="polite"
          data-testid="uploading-indicator"
        >
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          <span>Đang tải ảnh...</span>
        </div>
      )}
    </div>
  );
}
