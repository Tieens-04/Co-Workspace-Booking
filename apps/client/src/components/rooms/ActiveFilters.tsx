import { RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Amenity } from '../../types/room';
import { formatCurrency } from '../../utils/format';

export type RemovableFilter =
  { kind: 'capacity' } | { kind: 'price' } | { kind: 'amenity'; id: string };

interface ActiveFiltersProps {
  /** Committed (URL) values, not the in-progress input text. */
  capacity: string;
  minPrice: string;
  maxPrice: string;
  amenityIds: string[];
  amenities: Amenity[];
  onRemove: (filter: RemovableFilter) => void;
  onClearAll: () => void;
  /** The empty state carries its own "Xóa bộ lọc" CTA, so the summary can drop its copy. */
  showClearAll?: boolean;
}

function priceLabel(minPrice: string, maxPrice: string): string {
  if (minPrice && maxPrice) return `${formatCurrency(minPrice)} – ${formatCurrency(maxPrice)}`;
  if (minPrice) return `Từ ${formatCurrency(minPrice)}`;
  return `Đến ${formatCurrency(maxPrice)}`;
}

/** Removable chips for each committed filter plus a clear-all action. */
export function ActiveFilters({
  capacity,
  minPrice,
  maxPrice,
  amenityIds,
  amenities,
  onRemove,
  onClearAll,
  showClearAll = true,
}: ActiveFiltersProps) {
  const chips: { key: string; label: string; filter: RemovableFilter }[] = [];
  if (capacity) {
    chips.push({ key: 'capacity', label: `Từ ${capacity} người`, filter: { kind: 'capacity' } });
  }
  if (minPrice || maxPrice) {
    chips.push({
      key: 'price',
      label: `Giá ${priceLabel(minPrice, maxPrice)}/giờ`,
      filter: { kind: 'price' },
    });
  }
  for (const id of amenityIds) {
    const name = amenities.find((amenity) => amenity.id === id)?.name ?? 'Tiện ích đã chọn';
    chips.push({ key: id, label: name, filter: { kind: 'amenity', id } });
  }

  if (chips.length === 0) return null;

  return (
    <div
      role="group"
      aria-label="Bộ lọc đang áp dụng"
      className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
    >
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => onRemove(chip.filter)}
          aria-label={`Bỏ lọc: ${chip.label}`}
          className="inline-flex h-9 max-w-full items-center gap-1.5 rounded-full border bg-card pr-2.5 pl-3.5 text-[0.8125rem] font-medium text-foreground transition-colors duration-150 hover:border-input focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
        >
          <span className="truncate tabular-nums">{chip.label}</span>
          <X aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      ))}
      {showClearAll && (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="ml-1 text-[0.8125rem]"
          onClick={onClearAll}
        >
          <RotateCcw aria-hidden="true" className="size-3.5" />
          Xóa bộ lọc
        </Button>
      )}
    </div>
  );
}
