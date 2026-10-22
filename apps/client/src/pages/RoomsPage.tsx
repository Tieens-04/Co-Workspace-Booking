import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { LoaderCircle, SearchX, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { EmptyState, ErrorState } from '@/components/common/EmptyState';
import { Pagination } from '@/components/common/Pagination';
import { cn } from '@/lib/utils';
import { RoomCard } from '../components/rooms/RoomCard';
import { RoomFilters } from '../components/rooms/RoomFilters';
import { RoomGridSkeleton } from '../components/rooms/RoomGridSkeleton';
import { ActiveFilters, type RemovableFilter } from '../components/rooms/ActiveFilters';
import { Stagger, StaggerItem } from '../components/motion/Stagger';
import { Reveal } from '../components/editorial/Reveal';
import { SplitReveal } from '../components/editorial/SplitReveal';
import { useSmoothScroll } from '../components/editorial/useSmoothScroll';
import { SwapValue } from '../components/motion/SwapValue';
import { MOBILE_FILTERS_QUERY, useMediaQuery } from '../components/rooms/useMediaQuery';
import { roomApi } from '../services/room.api';
import { RoomListItem, Amenity, PaginationMeta } from '../types/room';
import { useDebounce } from '../hooks/useDebounce';
import {
  normalizeRoomSearchParams,
  RoomFilterFieldErrors,
  validateRoomFilterInputs,
} from '../utils/roomFilters';

const PAGE_LIMIT = 10;

export const RoomsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const isMobile = useMediaQuery(MOBILE_FILTERS_QUERY);
  // Same inertial wheel scrolling as the landing; the filter rail keeps native scroll.
  useSmoothScroll();
  const [filtersOpen, setFiltersOpen] = useState<boolean>(false);

  // URL is the committed filter state. Invalid values are removed before any API request.
  const normalizedSearch = useMemo(
    () => normalizeRoomSearchParams(searchParams, PAGE_LIMIT),
    [searchParams],
  );
  const urlPage = normalizedSearch.page;
  const urlCapacity = normalizedSearch.capacity?.toString() ?? '';
  const urlMinPrice = normalizedSearch.minPrice ?? '';
  const urlMaxPrice = normalizedSearch.maxPrice ?? '';
  const urlAmenityIds = normalizedSearch.amenityIds;
  const urlAmenityIdsParam = urlAmenityIds.join(',');

  useEffect(() => {
    if (normalizedSearch.changed) {
      setSearchParams(normalizedSearch.searchParams, { replace: true });
    }
  }, [normalizedSearch, setSearchParams]);

  // --- Local Input States for Debouncing ---
  const [capacityInput, setCapacityInput] = useState<string>(urlCapacity);
  const [minPriceInput, setMinPriceInput] = useState<string>(urlMinPrice);
  const [maxPriceInput, setMaxPriceInput] = useState<string>(urlMaxPrice);

  // Sync inputs when URL changes from browser back/forward
  useEffect(() => {
    setCapacityInput(urlCapacity);
  }, [urlCapacity]);

  useEffect(() => {
    setMinPriceInput(urlMinPrice);
  }, [urlMinPrice]);

  useEffect(() => {
    setMaxPriceInput(urlMaxPrice);
  }, [urlMaxPrice]);

  // Debounced input values
  const debouncedCapacity = useDebounce(capacityInput, 300);
  const debouncedMinPrice = useDebounce(minPriceInput, 300);
  const debouncedMaxPrice = useDebounce(maxPriceInput, 300);

  // --- Validation State ---
  const [errors, setErrors] = useState<RoomFilterFieldErrors>({});

  // Run validation whenever inputs change
  useEffect(() => {
    const currentErrors = validateRoomFilterInputs(capacityInput, minPriceInput, maxPriceInput);
    setErrors(currentErrors);
  }, [capacityInput, minPriceInput, maxPriceInput]);

  // Refs let this effect react only to debounced input, not to browser navigation.
  const searchParamsRef = useRef(searchParams);
  const setSearchParamsRef = useRef(setSearchParams);
  const committedNumericFiltersRef = useRef({
    capacity: urlCapacity,
    minPrice: urlMinPrice,
    maxPrice: urlMaxPrice,
  });
  searchParamsRef.current = searchParams;
  setSearchParamsRef.current = setSearchParams;
  committedNumericFiltersRef.current = {
    capacity: urlCapacity,
    minPrice: urlMinPrice,
    maxPrice: urlMaxPrice,
  };

  // Update URL searchParams when debounced local input changes (if valid).
  useEffect(() => {
    const currentErrors = validateRoomFilterInputs(
      debouncedCapacity,
      debouncedMinPrice,
      debouncedMaxPrice,
    );

    if (Object.keys(currentErrors).length > 0) {
      // Do not sync invalid values to URL
      return;
    }

    const trimmedCap = debouncedCapacity.trim();
    const trimmedMin = debouncedMinPrice.trim();
    const trimmedMax = debouncedMaxPrice.trim();

    const committedFilters = committedNumericFiltersRef.current;
    const hasChanged =
      trimmedCap !== committedFilters.capacity ||
      trimmedMin !== committedFilters.minPrice ||
      trimmedMax !== committedFilters.maxPrice;

    if (hasChanged) {
      const nextParams = new URLSearchParams(searchParamsRef.current);

      if (trimmedCap) nextParams.set('capacity', trimmedCap);
      else nextParams.delete('capacity');

      if (trimmedMin) nextParams.set('minPrice', trimmedMin);
      else nextParams.delete('minPrice');

      if (trimmedMax) nextParams.set('maxPrice', trimmedMax);
      else nextParams.delete('maxPrice');

      // Reset page to 1 on filter change
      nextParams.delete('page');

      setSearchParamsRef.current(nextParams, { replace: true });
    }
  }, [debouncedCapacity, debouncedMinPrice, debouncedMaxPrice]);

  // --- Amenities State & Independent Fetching ---
  const [amenities, setAmenities] = useState<Amenity[]>([]);
  const [loadingAmenities, setLoadingAmenities] = useState<boolean>(true);
  const [amenitiesError, setAmenitiesError] = useState<string | null>(null);

  const fetchAmenities = (signal?: AbortSignal) => {
    setLoadingAmenities(true);
    setAmenitiesError(null);

    roomApi
      .getAmenities(signal)
      .then((res) => {
        setAmenities(res.data);
        setLoadingAmenities(false);
      })
      .catch((err) => {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
        setAmenitiesError(
          err.response?.data?.message || err.message || 'Lỗi tải danh mục tiện ích',
        );
        setLoadingAmenities(false);
      });
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchAmenities(controller.signal);
    return () => {
      controller.abort();
    };
  }, []);

  // --- Room List State & Fetching with AbortController ---
  const [rooms, setRooms] = useState<RoomListItem[] | null>(null);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: PAGE_LIMIT,
    total: 0,
    totalPages: 0,
  });
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [imageErrorMap, setImageErrorMap] = useState<Record<string, boolean>>({});

  const abortControllerRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLElement | null>(null);
  const hasLoadedOnceRef = useRef<boolean>(false);

  const fetchRooms = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (!hasLoadedOnceRef.current) {
      setIsInitialLoading(true);
    } else {
      setIsFetching(true);
    }
    setRoomsError(null);

    const params: {
      page: number;
      limit: number;
      capacity?: number;
      minPrice?: string;
      maxPrice?: string;
      amenityIds?: string;
    } = {
      page: urlPage,
      limit: PAGE_LIMIT,
    };

    if (urlCapacity) params.capacity = parseInt(urlCapacity, 10);
    if (urlMinPrice) params.minPrice = urlMinPrice;
    if (urlMaxPrice) params.maxPrice = urlMaxPrice;
    if (urlAmenityIdsParam) params.amenityIds = urlAmenityIdsParam;

    roomApi
      .getRooms(params, controller.signal)
      .then((res) => {
        hasLoadedOnceRef.current = true;
        setRooms(res.data.items);
        setPagination(res.data.pagination);
        setIsInitialLoading(false);
        setIsFetching(false);
      })
      .catch((err) => {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
        setRoomsError(
          err.response?.data?.message || err.message || 'Không thể tải danh sách phòng',
        );
        setIsInitialLoading(false);
        setIsFetching(false);
      });
  }, [urlPage, urlCapacity, urlMinPrice, urlMaxPrice, urlAmenityIdsParam]);

  useEffect(() => {
    fetchRooms();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchRooms]);

  // --- Handlers ---
  const handleAmenityToggle = (amenityId: string) => {
    const nextParams = new URLSearchParams(searchParams);
    let updated: string[];

    if (urlAmenityIds.includes(amenityId)) {
      updated = urlAmenityIds.filter((id) => id !== amenityId);
    } else {
      updated = [...urlAmenityIds, amenityId];
    }

    if (updated.length > 0) {
      nextParams.set('amenityIds', updated.join(','));
    } else {
      nextParams.delete('amenityIds');
    }

    // Reset to page 1
    nextParams.delete('page');
    setSearchParams(nextParams);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || (pagination.totalPages > 0 && newPage > pagination.totalPages)) {
      return;
    }
    const nextParams = new URLSearchParams(searchParams);
    if (newPage === 1) {
      nextParams.delete('page');
    } else {
      nextParams.set('page', newPage.toString());
    }
    setSearchParams(nextParams);
    scrollToResults();
  };

  // Bring the top of the results into view (not the page top) only when it has scrolled away.
  const scrollToResults = () => {
    const results = resultsRef.current;
    if (!results || results.getBoundingClientRect().top >= 0) return;
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    results.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  };

  const handleRemoveFilter = (filter: RemovableFilter) => {
    if (filter.kind === 'amenity') {
      handleAmenityToggle(filter.id);
      return;
    }
    // Inputs follow the URL through the sync effects above, so only the URL changes here.
    const nextParams = new URLSearchParams(searchParams);
    if (filter.kind === 'capacity') {
      nextParams.delete('capacity');
    } else {
      nextParams.delete('minPrice');
      nextParams.delete('maxPrice');
    }
    nextParams.delete('page');
    setSearchParams(nextParams);
  };

  const handleClearFilters = () => {
    setCapacityInput('');
    setMinPriceInput('');
    setMaxPriceInput('');
    setErrors({});
    setSearchParams(new URLSearchParams());
  };

  const handleCardImageError = useCallback((roomId: string) => {
    setImageErrorMap((prev) => ({ ...prev, [roomId]: true }));
  }, []);

  const hasActiveFilters = Boolean(
    urlCapacity || urlMinPrice || urlMaxPrice || urlAmenityIds.length > 0,
  );
  const activeFilterCount =
    (urlCapacity ? 1 : 0) + (urlMinPrice || urlMaxPrice ? 1 : 0) + urlAmenityIds.length;
  const listUrl = location.pathname + location.search;

  const filters = (
    <RoomFilters
      capacity={capacityInput}
      minPrice={minPriceInput}
      maxPrice={maxPriceInput}
      onCapacityChange={setCapacityInput}
      onMinPriceChange={setMinPriceInput}
      onMaxPriceChange={setMaxPriceInput}
      errors={errors}
      amenities={amenities}
      loadingAmenities={loadingAmenities}
      amenitiesError={amenitiesError}
      onRetryAmenities={() => fetchAmenities()}
      selectedAmenityIds={urlAmenityIds}
      onToggleAmenity={handleAmenityToggle}
      // On desktop the active-filter summary above the grid owns "clear all".
      hasActiveFilters={isMobile && hasActiveFilters}
      onClearFilters={handleClearFilters}
      showTitle={!isMobile}
    />
  );

  const showResults = !isInitialLoading && !roomsError;
  const isEmpty = showResults && rooms !== null && rooms.length === 0;
  const showToolbar = isMobile || isFetching || hasActiveFilters;

  return (
    <div className="container-page pt-10 pb-16 md:pt-14 md:pb-24">
      <Stagger
        stagger={0.08}
        className="grid gap-8 border-b pb-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:pb-10"
      >
        <div className="grid gap-5">
          <StaggerItem>
            <p className="eyebrow">Khám phá không gian</p>
          </StaggerItem>
          <SplitReveal
            as="h1"
            by="chars"
            trigger="mount"
            delay={0.1}
            className="max-w-[14ch] text-display-xl font-bold"
          >
            Tìm phòng làm việc phù hợp
          </SplitReveal>
          <StaggerItem>
            <p className="max-w-[58ch] text-[1.0625rem] text-muted-foreground">
              Lọc theo sức chứa, mức giá và tiện ích. Chọn ngày ở trang chi tiết phòng để xem khung
              giờ còn trống và đặt chỗ theo bước 30 phút.
            </p>
          </StaggerItem>
        </div>
        {!isInitialLoading && !roomsError && pagination.total > 0 && (
          <p className="flex items-baseline gap-2 text-sm text-muted-foreground tabular-nums md:grid md:justify-items-end md:gap-0 md:text-right">
            <strong className="text-display-lg font-bold text-foreground">
              <SwapValue value={pagination.total}>{pagination.total}</SwapValue>
            </strong>
            phòng phù hợp
          </p>
        )}
      </Stagger>

      <div className="mt-8 grid gap-8 lg:mt-10 lg:grid-cols-[272px_minmax(0,1fr)] lg:items-start lg:gap-10 xl:grid-cols-[288px_minmax(0,1fr)] xl:gap-12">
        {!isMobile && (
          <aside
            data-lenis-prevent
            className="rounded-xl border bg-card p-6 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto"
            aria-label="Bộ lọc tìm kiếm phòng"
          >
            {filters}
          </aside>
        )}

        <section
          ref={resultsRef}
          aria-label="Danh sách phòng làm việc"
          aria-busy={isFetching}
          className="min-w-0 scroll-mt-28"
        >
          <h2 className="sr-only">Không gian làm việc</h2>

          {showToolbar && (
            <div className="mb-6 flex min-h-9 flex-wrap items-center gap-3">
              {isMobile && (
                <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
                  <SheetTrigger asChild>
                    <Button type="button" variant="outline" size="sm">
                      <SlidersHorizontal aria-hidden="true" />
                      Bộ lọc
                      {activeFilterCount > 0 && (
                        <span className="tabular-nums">({activeFilterCount})</span>
                      )}
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-[88vw] gap-0 overflow-y-auto">
                    <SheetHeader className="border-b px-5 py-4">
                      <SheetTitle>Bộ lọc tìm kiếm</SheetTitle>
                      <SheetDescription>Lọc phòng theo sức chứa, giá và tiện ích.</SheetDescription>
                    </SheetHeader>
                    <div className="px-5 py-5">{filters}</div>
                    <SheetFooter className="border-t px-5 py-4">
                      <SheetClose asChild>
                        <Button type="button" className="w-full">
                          Xem kết quả
                        </Button>
                      </SheetClose>
                    </SheetFooter>
                  </SheetContent>
                </Sheet>
              )}

              {hasActiveFilters && (
                <ActiveFilters
                  capacity={urlCapacity}
                  minPrice={urlMinPrice}
                  maxPrice={urlMaxPrice}
                  amenityIds={urlAmenityIds}
                  amenities={amenities}
                  onRemove={handleRemoveFilter}
                  onClearAll={handleClearFilters}
                  showClearAll={!isEmpty}
                />
              )}

              {isFetching && (
                <p
                  className="ml-auto inline-flex items-center gap-1.5 text-sm text-muted-foreground"
                  role="status"
                  aria-live="polite"
                >
                  <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
                  Đang cập nhật...
                </p>
              )}
            </div>
          )}

          {isInitialLoading && <RoomGridSkeleton />}

          {!isInitialLoading && roomsError && (
            <ErrorState
              title="Không thể tải danh sách phòng"
              description={roomsError}
              onRetry={() => fetchRooms()}
            />
          )}

          {isEmpty && (
            <EmptyState
              icon={SearchX}
              title="Không tìm thấy phòng phù hợp"
              description="Không có không gian làm việc nào đáp ứng tiêu chí tìm kiếm hiện tại của bạn. Vui lòng điều chỉnh hoặc xóa bớt bộ lọc."
              action={
                <Button type="button" variant="outline" size="sm" onClick={handleClearFilters}>
                  Xóa bộ lọc
                </Button>
              }
            />
          )}

          {showResults && rooms && rooms.length > 0 && (
            <>
              {/* Cards rise in once per page of results; filter changes swap them instantly. */}
              <Reveal
                as="ul"
                key={pagination.page}
                y={32}
                duration={0.8}
                stagger={0.08}
                aria-label="Kết quả tìm kiếm"
                className={cn(
                  'grid gap-5 transition-opacity duration-150 sm:grid-cols-2 xl:grid-cols-3',
                  isFetching && 'opacity-60',
                )}
              >
                {rooms.map((room) => (
                  <li key={room.id} data-reveal className="min-w-0">
                    <RoomCard
                      room={room}
                      from={listUrl}
                      imageFailed={Boolean(imageErrorMap[room.id])}
                      onImageError={handleCardImageError}
                    />
                  </li>
                ))}
              </Reveal>

              {pagination.totalPages > 1 && (
                <Pagination
                  className="mt-12"
                  page={pagination.page}
                  totalPages={pagination.totalPages}
                  onPageChange={handlePageChange}
                  ariaLabel="Điều hướng phân trang"
                />
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
};
