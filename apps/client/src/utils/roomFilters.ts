export const MYSQL_INT_MAX = 2_147_483_647;
export const ROOM_PRICE_MAX_CENTS = 9_999_999_999n;

const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;
const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface RoomFilterFieldErrors {
  capacity?: string;
  minPrice?: string;
  maxPrice?: string;
  priceRange?: string;
}

export interface NormalizedRoomSearch {
  searchParams: URLSearchParams;
  changed: boolean;
  page: number;
  capacity?: number;
  minPrice?: string;
  maxPrice?: string;
  amenityIds: string[];
}

function parsePositiveInteger(value: string, maximum: bigint): number | null {
  if (!POSITIVE_INTEGER_PATTERN.test(value)) return null;

  const parsed = BigInt(value);
  if (parsed > maximum) return null;
  return Number(parsed);
}

function moneyToCents(value: string): bigint {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

function isValidMoney(value: string): boolean {
  return MONEY_PATTERN.test(value) && moneyToCents(value) <= ROOM_PRICE_MAX_CENTS;
}

export function validateRoomFilterInputs(
  capacity: string,
  minPrice: string,
  maxPrice: string,
): RoomFilterFieldErrors {
  const errors: RoomFilterFieldErrors = {};
  const trimmedCapacity = capacity.trim();
  const trimmedMinPrice = minPrice.trim();
  const trimmedMaxPrice = maxPrice.trim();

  if (trimmedCapacity) {
    if (!POSITIVE_INTEGER_PATTERN.test(trimmedCapacity)) {
      errors.capacity = 'Sức chứa phải là số nguyên dương';
    } else if (BigInt(trimmedCapacity) > BigInt(MYSQL_INT_MAX)) {
      errors.capacity = 'Sức chứa vượt quá giới hạn cho phép';
    }
  }

  if (trimmedMinPrice) {
    if (!MONEY_PATTERN.test(trimmedMinPrice)) {
      errors.minPrice = 'Giá tối thiểu không hợp lệ (tối đa 2 số thập phân)';
    } else if (moneyToCents(trimmedMinPrice) > ROOM_PRICE_MAX_CENTS) {
      errors.minPrice = 'Giá tối thiểu vượt quá giới hạn cho phép';
    }
  }

  if (trimmedMaxPrice) {
    if (!MONEY_PATTERN.test(trimmedMaxPrice)) {
      errors.maxPrice = 'Giá tối đa không hợp lệ (tối đa 2 số thập phân)';
    } else if (moneyToCents(trimmedMaxPrice) > ROOM_PRICE_MAX_CENTS) {
      errors.maxPrice = 'Giá tối đa vượt quá giới hạn cho phép';
    }
  }

  if (
    !errors.minPrice &&
    !errors.maxPrice &&
    trimmedMinPrice &&
    trimmedMaxPrice &&
    moneyToCents(trimmedMinPrice) > moneyToCents(trimmedMaxPrice)
  ) {
    errors.priceRange = 'Giá tối thiểu không được lớn hơn giá tối đa';
  }

  return errors;
}

export function normalizeRoomSearchParams(
  source: URLSearchParams,
  pageLimit: number,
): NormalizedRoomSearch {
  const normalized = new URLSearchParams(source);
  const maxPage = BigInt(Math.floor(MYSQL_INT_MAX / pageLimit) + 1);

  const rawPage = source.get('page')?.trim() ?? '';
  const parsedPage = rawPage ? parsePositiveInteger(rawPage, maxPage) : 1;
  const page = parsedPage ?? 1;
  if (!parsedPage || page === 1) normalized.delete('page');
  else normalized.set('page', String(page));

  const rawCapacity = source.get('capacity')?.trim() ?? '';
  const capacity = rawCapacity ? parsePositiveInteger(rawCapacity, BigInt(MYSQL_INT_MAX)) : null;
  if (capacity === null) normalized.delete('capacity');
  else normalized.set('capacity', String(capacity));

  const rawMinPrice = source.get('minPrice')?.trim() ?? '';
  const rawMaxPrice = source.get('maxPrice')?.trim() ?? '';
  let minPrice = rawMinPrice && isValidMoney(rawMinPrice) ? rawMinPrice : undefined;
  let maxPrice = rawMaxPrice && isValidMoney(rawMaxPrice) ? rawMaxPrice : undefined;

  if (minPrice && maxPrice && moneyToCents(minPrice) > moneyToCents(maxPrice)) {
    minPrice = undefined;
    maxPrice = undefined;
  }

  if (minPrice) normalized.set('minPrice', minPrice);
  else normalized.delete('minPrice');
  if (maxPrice) normalized.set('maxPrice', maxPrice);
  else normalized.delete('maxPrice');

  const rawAmenityIds = source.get('amenityIds') ?? '';
  const amenityIds = Array.from(
    new Set(
      rawAmenityIds
        .split(',')
        .map((id) => id.trim())
        .filter((id) => UUID_PATTERN.test(id)),
    ),
  );
  if (amenityIds.length > 0) normalized.set('amenityIds', amenityIds.join(','));
  else normalized.delete('amenityIds');

  return {
    searchParams: normalized,
    changed: normalized.toString() !== source.toString(),
    page,
    ...(capacity !== null ? { capacity } : {}),
    ...(minPrice ? { minPrice } : {}),
    ...(maxPrice ? { maxPrice } : {}),
    amenityIds,
  };
}
