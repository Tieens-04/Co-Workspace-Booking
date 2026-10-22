import type * as React from 'react';
import { CircleAlert, LoaderCircle, RotateCcw, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/common/Field';
import { Checkbox } from '@/components/common/NativeSelect';
import type { Amenity } from '../../types/room';
import { MYSQL_INT_MAX, type RoomFilterFieldErrors } from '../../utils/roomFilters';
import { AmenityIcon } from './AmenityIcon';

export interface RoomFiltersProps {
  capacity: string;
  minPrice: string;
  maxPrice: string;
  onCapacityChange: (value: string) => void;
  onMinPriceChange: (value: string) => void;
  onMaxPriceChange: (value: string) => void;
  errors: RoomFilterFieldErrors;
  amenities: Amenity[];
  loadingAmenities: boolean;
  amenitiesError: string | null;
  onRetryAmenities: () => void;
  selectedAmenityIds: string[];
  onToggleAmenity: (amenityId: string) => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  /** The sheet supplies its own title, so the rail heading can be hidden there. */
  showTitle?: boolean;
}

function FilterError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} role="alert" className="flex items-start gap-1.5 text-[0.8125rem] text-destructive">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      {children}
    </p>
  );
}

/** Capacity, price range and amenity filters. Rendered once: in the rail or in the sheet. */
export function RoomFilters({
  capacity,
  minPrice,
  maxPrice,
  onCapacityChange,
  onMinPriceChange,
  onMaxPriceChange,
  errors,
  amenities,
  loadingAmenities,
  amenitiesError,
  onRetryAmenities,
  selectedAmenityIds,
  onToggleAmenity,
  hasActiveFilters,
  onClearFilters,
  showTitle = true,
}: RoomFiltersProps) {
  const minPriceDescribedBy = errors.minPrice
    ? 'min-price-error'
    : errors.priceRange
      ? 'price-range-error'
      : undefined;
  const maxPriceDescribedBy = errors.maxPrice
    ? 'max-price-error'
    : errors.priceRange
      ? 'price-range-error'
      : undefined;

  return (
    <div className="grid gap-6">
      {(showTitle || hasActiveFilters) && (
        <div className="flex min-h-8 items-baseline justify-between gap-3">
          {showTitle && <h2 className="text-xl leading-snug">Bộ lọc tìm kiếm</h2>}
          {hasActiveFilters && (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="ml-auto text-[0.8125rem]"
              onClick={onClearFilters}
            >
              <RotateCcw aria-hidden="true" className="size-3.5" />
              Xóa tất cả
            </Button>
          )}
        </div>
      )}

      <Field
        id="capacity-filter"
        label="Sức chứa tối thiểu (người)"
        error={errors.capacity}
        errorId="capacity-error"
      >
        <Input
          type="number"
          min="1"
          max={MYSQL_INT_MAX}
          inputMode="numeric"
          className="tabular-nums"
          placeholder="VD: 4"
          value={capacity}
          onChange={(e) => onCapacityChange(e.target.value)}
        />
      </Field>

      <div className="grid gap-1.5">
        <span className="text-sm font-medium">Khoảng giá (VND/giờ)</span>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
          <div className="min-w-0">
            <label htmlFor="min-price-filter" className="sr-only">
              Giá tối thiểu
            </label>
            <Input
              id="min-price-filter"
              type="text"
              inputMode="decimal"
              className="tabular-nums"
              placeholder="Từ..."
              value={minPrice}
              onChange={(e) => onMinPriceChange(e.target.value)}
              aria-invalid={errors.minPrice || errors.priceRange ? true : undefined}
              aria-describedby={minPriceDescribedBy}
            />
          </div>
          <span aria-hidden="true" className="text-muted-foreground">
            –
          </span>
          <div className="min-w-0">
            <label htmlFor="max-price-filter" className="sr-only">
              Giá tối đa
            </label>
            <Input
              id="max-price-filter"
              type="text"
              inputMode="decimal"
              className="tabular-nums"
              placeholder="Đến..."
              value={maxPrice}
              onChange={(e) => onMaxPriceChange(e.target.value)}
              aria-invalid={errors.maxPrice || errors.priceRange ? true : undefined}
              aria-describedby={maxPriceDescribedBy}
            />
          </div>
        </div>
        {errors.minPrice && <FilterError id="min-price-error">{errors.minPrice}</FilterError>}
        {errors.maxPrice && <FilterError id="max-price-error">{errors.maxPrice}</FilterError>}
        {errors.priceRange && <FilterError id="price-range-error">{errors.priceRange}</FilterError>}
      </div>

      <div className="grid gap-3">
        <span className="text-sm font-medium">Tiện ích yêu cầu (Khớp tất cả)</span>

        {loadingAmenities && (
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
            Đang tải tiện ích...
          </p>
        )}

        {amenitiesError && (
          <div
            role="alert"
            className="grid justify-items-start gap-2 rounded-lg border border-status-cancelled-border bg-status-cancelled-bg p-3 text-status-cancelled"
          >
            <p className="flex items-start gap-1.5 text-[0.8125rem]">
              <CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              {amenitiesError}
            </p>
            <Button type="button" variant="outline" size="xs" onClick={onRetryAmenities}>
              <RotateCw aria-hidden="true" />
              Thử lại
            </Button>
          </div>
        )}

        {!loadingAmenities && !amenitiesError && amenities.length > 0 && (
          <div className="grid gap-0.5" role="group" aria-label="Danh sách tiện ích">
            {amenities.map((amenity) => (
              <label
                key={amenity.id}
                className="-mx-2 flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors duration-150 hover:bg-muted"
              >
                <Checkbox
                  checked={selectedAmenityIds.includes(amenity.id)}
                  onChange={() => onToggleAmenity(amenity.id)}
                />
                <AmenityIcon icon={amenity.icon} className="size-4 text-muted-foreground" />
                <span className="min-w-0">{amenity.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
