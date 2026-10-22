import { CircleAlert, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/common/NativeSelect';
import type { Amenity } from '../../../types/room';

interface AmenityChecklistProps {
  amenities: Amenity[];
  selectedIds: string[];
  isLoading: boolean;
  loadError: string | null;
  /** Validation message for the amenity selection. */
  error?: string;
  disabled: boolean;
  onToggle: (amenityId: string) => void;
  onRetry: () => void;
}

/** Native checkbox group for Room ↔ Amenity relations. */
export function AmenityChecklist({
  amenities,
  selectedIds,
  isLoading,
  loadError,
  error,
  disabled,
  onToggle,
  onRetry,
}: AmenityChecklistProps) {
  return (
    <div className="grid gap-2">
      <span id="room-amenities-label" className="text-sm font-medium">
        Tiện ích phòng
      </span>
      <div
        role="group"
        aria-labelledby="room-amenities-label"
        aria-busy={isLoading}
        aria-describedby={error ? 'error-amenityIds' : undefined}
        className="rounded-lg border p-3"
      >
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Đang tải danh sách tiện ích...</p>
        ) : loadError ? (
          <div role="alert" className="grid justify-items-start gap-2 text-sm text-destructive">
            <p className="flex items-start gap-1.5">
              <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {loadError}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              <RotateCw aria-hidden="true" />
              Thử tải lại
            </Button>
          </div>
        ) : amenities.length > 0 ? (
          <div className="grid gap-x-4 gap-y-2.5 sm:grid-cols-2">
            {amenities.map((amenity) => (
              <label
                key={amenity.id}
                className="flex cursor-pointer items-center gap-2.5 text-sm has-disabled:cursor-not-allowed has-disabled:opacity-60"
                data-testid={`amenity-item-${amenity.id}`}
              >
                <Checkbox
                  checked={selectedIds.includes(amenity.id)}
                  onChange={() => onToggle(amenity.id)}
                  disabled={disabled}
                />
                <span>{amenity.name}</span>
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Chưa có tiện ích nào trong hệ thống.</p>
        )}
      </div>
      {error && (
        <p
          id="error-amenityIds"
          className="flex items-start gap-1.5 text-[0.8125rem] text-destructive"
          data-testid="error-amenityIds"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
