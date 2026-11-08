import type { RoomSortOption } from '../types/room';
import { getVietnamTodayString, parseVnDateTimeLocalToUtc } from './bookingTime';

export { getVietnamTodayString };

export const MYSQL_INT_MAX = 2_147_483_647;
export const ROOM_PRICE_MAX_CENTS = 9_999_999_999n;

export const VALID_SORT_OPTIONS: RoomSortOption[] = [
  'newest',
  'price_asc',
  'price_desc',
  'capacity_asc',
  'capacity_desc',
];

const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;
const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface RoomFilterFieldErrors {
  capacity?: string;
  minPrice?: string;
  maxPrice?: string;
  priceRange?: string;
  slot?: string;
}

export interface NormalizedRoomSearch {
  searchParams: URLSearchParams;
  changed: boolean;
  page: number;
  capacity?: number;
  minPrice?: string;
  maxPrice?: string;
  amenityIds: string[];
  q?: string;
  sort?: RoomSortOption;
  date?: string;
  startTime?: string;
  endTime?: string;
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

export function parseTimeToMinutes(timeStr: string): number | null {
  if (!TIME_PATTERN.test(timeStr)) return null;
  const [hours, minutes] = timeStr.split(':').map(Number);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export interface SlotValidationResult {
  isValid: boolean;
  error?: string;
}

export function validateSlotRules(
  dateStr: string,
  startTimeStr: string,
  endTimeStr: string,
  now: Date = new Date(),
): SlotValidationResult {
  if (!DATE_PATTERN.test(dateStr)) {
    return { isValid: false, error: 'Định dạng ngày không hợp lệ (YYYY-MM-DD)' };
  }

  const todayVn = getVietnamTodayString(now);
  if (dateStr < todayVn) {
    return { isValid: false, error: 'Không được chọn ngày trong quá khứ' };
  }

  const startMinutes = parseTimeToMinutes(startTimeStr);
  const endMinutes = parseTimeToMinutes(endTimeStr);

  if (startMinutes === null || endMinutes === null) {
    return { isValid: false, error: 'Định dạng thời gian không hợp lệ (HH:mm)' };
  }

  if (startMinutes % 30 !== 0 || endMinutes % 30 !== 0) {
    return { isValid: false, error: 'Thời gian phải đúng mốc 30 phút' };
  }

  const duration = endMinutes - startMinutes;
  if (duration <= 0) {
    return { isValid: false, error: 'Giờ kết thúc phải sau giờ bắt đầu' };
  }
  if (duration < 60) {
    return { isValid: false, error: 'Thời lượng đặt phòng tối thiểu là 1 giờ' };
  }
  if (duration > 480) {
    return { isValid: false, error: 'Thời lượng đặt phòng tối đa là 8 giờ' };
  }
  if (startMinutes < 7 * 60 || endMinutes > 22 * 60) {
    return {
      isValid: false,
      error: 'Chỉ được đặt phòng trong khung giờ hoạt động (07:00 - 22:00)',
    };
  }

  if (dateStr === todayVn) {
    const startUtc = parseVnDateTimeLocalToUtc(`${dateStr}T${startTimeStr}`);
    if (startUtc && startUtc.getTime() <= now.getTime()) {
      return { isValid: false, error: 'Thời gian bắt đầu không được ở trong quá khứ' };
    }
    if (startUtc && startUtc.getTime() - now.getTime() < 30 * 60 * 1000) {
      return { isValid: false, error: 'Phải đặt phòng trước thời gian bắt đầu ít nhất 30 phút' };
    }
  }

  return { isValid: true };
}

export function isSlotValid(
  dateStr: string,
  startTimeStr: string,
  endTimeStr: string,
  now: Date = new Date(),
): boolean {
  return validateSlotRules(dateStr, startTimeStr, endTimeStr, now).isValid;
}

export function validateRoomFilterInputs(
  capacity: string,
  minPrice: string,
  maxPrice: string,
  date?: string,
  startTime?: string,
  endTime?: string,
  now: Date = new Date(),
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

  const trimmedDate = date?.trim() || '';
  const trimmedStart = startTime?.trim() || '';
  const trimmedEnd = endTime?.trim() || '';

  if (trimmedDate || trimmedStart || trimmedEnd) {
    if (!trimmedDate || !trimmedStart || !trimmedEnd) {
      errors.slot = 'Vui lòng chọn đầy đủ ngày, giờ bắt đầu và giờ kết thúc';
    } else {
      const slotValidation = validateSlotRules(trimmedDate, trimmedStart, trimmedEnd, now);
      if (!slotValidation.isValid && slotValidation.error) {
        errors.slot = slotValidation.error;
      }
    }
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

  const rawQ = source.get('q')?.trim() ?? '';
  const q = rawQ.length > 0 ? (rawQ.length > 100 ? rawQ.slice(0, 100).trim() : rawQ) : undefined;
  if (q) normalized.set('q', q);
  else normalized.delete('q');

  const rawSort = source.get('sort')?.trim() ?? '';
  const sort = VALID_SORT_OPTIONS.includes(rawSort as RoomSortOption)
    ? (rawSort as RoomSortOption)
    : undefined;
  if (sort && sort !== 'newest') normalized.set('sort', sort);
  else normalized.delete('sort');

  const rawDate = source.get('date')?.trim() ?? '';
  const rawStartTime = source.get('startTime')?.trim() ?? '';
  const rawEndTime = source.get('endTime')?.trim() ?? '';

  const validSlot = Boolean(
    rawDate &&
      rawStartTime &&
      rawEndTime &&
      isSlotValid(rawDate, rawStartTime, rawEndTime),
  );

  if (validSlot) {
    normalized.set('date', rawDate);
    normalized.set('startTime', rawStartTime);
    normalized.set('endTime', rawEndTime);
  } else {
    normalized.delete('date');
    normalized.delete('startTime');
    normalized.delete('endTime');
  }

  return {
    searchParams: normalized,
    changed: normalized.toString() !== source.toString(),
    page,
    ...(capacity !== null ? { capacity } : {}),
    ...(minPrice ? { minPrice } : {}),
    ...(maxPrice ? { maxPrice } : {}),
    amenityIds,
    ...(q ? { q } : {}),
    ...(sort ? { sort } : {}),
    ...(validSlot ? { date: rawDate, startTime: rawStartTime, endTime: rawEndTime } : {}),
  };
}
