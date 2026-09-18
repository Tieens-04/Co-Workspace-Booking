import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { Link, useSearchParams, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { roomApi } from '../services/room.api';
import { RoomListItem, Amenity, PaginationMeta } from '../types/room';
import { formatVnd } from '../utils/format';
import { useDebounce } from '../hooks/useDebounce';
import { ROOM_PLACEHOLDER_IMAGE } from './RoomDetailPage';
import {
  MYSQL_INT_MAX,
  normalizeRoomSearchParams,
  RoomFilterFieldErrors,
  validateRoomFilterInputs,
} from '../utils/roomFilters';

const PAGE_LIMIT = 10;

export const HomePage: React.FC = () => {
  const { isAuthenticated, principal, logout } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleClearFilters = () => {
    setCapacityInput('');
    setMinPriceInput('');
    setMaxPriceInput('');
    setErrors({});
    setSearchParams(new URLSearchParams());
  };

  const handleCardImageError = (roomId: string) => {
    setImageErrorMap((prev) => ({ ...prev, [roomId]: true }));
  };

  return (
    <main className="page-container discovery-page-container">
      {/* App Header */}
      <header className="app-header">
        <div className="brand-section">
          <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
            <h1>🏢 Co-Space Working</h1>
          </Link>
          <p>Hệ thống đặt chỗ làm việc thông minh (Co-Workspace Booking)</p>
        </div>

        <nav className="nav-actions">
          {isAuthenticated && principal ? (
            <>
              <span className="user-status-text">
                Xin chào, <strong>{principal.fullName || principal.email || principal.id}</strong>{' '}
                <span
                  className={`badge ${principal.role === 'ADMIN' ? 'badge-admin' : 'badge-customer'}`}
                >
                  {principal.role}
                </span>
              </span>
              {principal.role === 'ADMIN' && (
                <Link to="/admin" className="btn btn-outline">
                  Khu vực Quản trị
                </Link>
              )}
              <button
                type="button"
                className="btn btn-danger-outline"
                onClick={() => logout('userAction')}
              >
                Đăng xuất
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn-primary">
                Đăng nhập
              </Link>
              <Link to="/register" className="btn btn-outline">
                Đăng ký
              </Link>
            </>
          )}
        </nav>
      </header>

      {/* Main Discovery Layout */}
      <div className="discovery-layout">
        {/* Sidebar Filters */}
        <aside className="filter-sidebar card" aria-label="Bộ lọc tìm kiếm phòng">
          <div className="filter-header-row">
            <h2 className="filter-title">🔍 Bộ lọc tìm kiếm</h2>
            {(urlCapacity || urlMinPrice || urlMaxPrice || urlAmenityIds.length > 0) && (
              <button
                type="button"
                className="btn-link clear-filter-btn"
                onClick={handleClearFilters}
              >
                Xóa tất cả
              </button>
            )}
          </div>

          {/* Sức chứa */}
          <div className="form-group filter-group">
            <label htmlFor="capacity-filter" className="form-label">
              Sức chứa tối thiểu (người)
            </label>
            <input
              id="capacity-filter"
              type="number"
              min="1"
              max={MYSQL_INT_MAX}
              className={`form-control ${errors.capacity ? 'has-error' : ''}`}
              placeholder="VD: 4"
              value={capacityInput}
              onChange={(e) => setCapacityInput(e.target.value)}
              aria-describedby={errors.capacity ? 'capacity-error' : undefined}
            />
            {errors.capacity && (
              <div id="capacity-error" className="field-error" role="alert">
                {errors.capacity}
              </div>
            )}
          </div>

          {/* Khoảng giá */}
          <div className="form-group filter-group">
            <span className="form-label">Khoảng giá (VND/giờ)</span>
            <div className="price-inputs-row">
              <div className="price-col">
                <label htmlFor="min-price-filter" className="sr-only">
                  Giá tối thiểu
                </label>
                <input
                  id="min-price-filter"
                  type="text"
                  inputMode="decimal"
                  className={`form-control ${errors.minPrice || errors.priceRange ? 'has-error' : ''}`}
                  placeholder="Từ..."
                  value={minPriceInput}
                  onChange={(e) => setMinPriceInput(e.target.value)}
                  aria-describedby={
                    errors.minPrice
                      ? 'min-price-error'
                      : errors.priceRange
                        ? 'price-range-error'
                        : undefined
                  }
                />
              </div>
              <span className="price-separator">-</span>
              <div className="price-col">
                <label htmlFor="max-price-filter" className="sr-only">
                  Giá tối đa
                </label>
                <input
                  id="max-price-filter"
                  type="text"
                  inputMode="decimal"
                  className={`form-control ${errors.maxPrice || errors.priceRange ? 'has-error' : ''}`}
                  placeholder="Đến..."
                  value={maxPriceInput}
                  onChange={(e) => setMaxPriceInput(e.target.value)}
                  aria-describedby={
                    errors.maxPrice
                      ? 'max-price-error'
                      : errors.priceRange
                        ? 'price-range-error'
                        : undefined
                  }
                />
              </div>
            </div>
            {errors.minPrice && (
              <div id="min-price-error" className="field-error" role="alert">
                {errors.minPrice}
              </div>
            )}
            {errors.maxPrice && (
              <div id="max-price-error" className="field-error" role="alert">
                {errors.maxPrice}
              </div>
            )}
            {errors.priceRange && (
              <div id="price-range-error" className="field-error" role="alert">
                {errors.priceRange}
              </div>
            )}
          </div>

          {/* Tiện ích */}
          <div className="form-group filter-group">
            <span className="form-label">Tiện ích yêu cầu (Khớp tất cả)</span>

            {loadingAmenities && <div className="loading-small">⏳ Đang tải tiện ích...</div>}

            {amenitiesError && (
              <div className="amenity-error-box" role="alert">
                <p className="field-error" style={{ margin: 0 }}>
                  ❌ {amenitiesError}
                </p>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  style={{ marginTop: '0.5rem', fontSize: '0.75rem' }}
                  onClick={() => fetchAmenities()}
                >
                  Thử lại
                </button>
              </div>
            )}

            {!loadingAmenities && !amenitiesError && amenities.length > 0 && (
              <div className="amenity-checkbox-list" role="group" aria-label="Danh sách tiện ích">
                {amenities.map((amenity) => {
                  const isChecked = urlAmenityIds.includes(amenity.id);
                  return (
                    <label key={amenity.id} className="amenity-checkbox-item">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleAmenityToggle(amenity.id)}
                        className="amenity-checkbox"
                      />
                      <span className="amenity-name">
                        <span className="amenity-icon" aria-hidden="true">
                          {amenity.icon === 'wifi'
                            ? '📶'
                            : amenity.icon === 'coffee'
                              ? '☕'
                              : amenity.icon === 'monitor' || amenity.icon === 'tv'
                                ? '🖥️'
                                : amenity.icon === 'board'
                                  ? '📋'
                                  : '✨'}
                        </span>{' '}
                        {amenity.name}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        {/* Room Results Section */}
        <section
          className="rooms-content-section"
          aria-label="Danh sách phòng làm việc"
          aria-busy={isFetching}
        >
          {/* Header & Updating indicator */}
          <div className="results-header-row">
            <h2 className="results-title">
              Không gian làm việc{' '}
              {!isInitialLoading && pagination.total > 0 && (
                <span className="results-count">({pagination.total} phòng)</span>
              )}
            </h2>

            {isFetching && (
              <div className="updating-badge" role="status" aria-live="polite">
                🔄 Đang cập nhật...
              </div>
            )}
          </div>

          {/* Initial Loading Skeletons */}
          {isInitialLoading && (
            <div className="room-grid" aria-busy="true" aria-label="Đang nạp danh sách phòng">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div key={n} className="card room-card skeleton-card">
                  <div className="skeleton skeleton-img" />
                  <div className="room-card-body">
                    <div className="skeleton skeleton-title" />
                    <div className="skeleton skeleton-text" />
                    <div className="skeleton skeleton-text" style={{ width: '60%' }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Error State */}
          {!isInitialLoading && roomsError && (
            <div className="card error-state-card" role="alert">
              <div className="state-icon">⚠️</div>
              <h3 className="error-title">Không thể tải danh sách phòng</h3>
              <p className="error-description">{roomsError}</p>
              <button type="button" className="btn btn-primary" onClick={() => fetchRooms()}>
                Thử lại
              </button>
            </div>
          )}

          {/* Empty State */}
          {!isInitialLoading && !roomsError && rooms && rooms.length === 0 && (
            <div className="card empty-state-card">
              <div className="state-icon">🏢</div>
              <h3 className="empty-title">Không tìm thấy phòng phù hợp</h3>
              <p className="empty-description">
                Không có không gian làm việc nào đáp ứng tiêu chí tìm kiếm hiện tại của bạn. Vui
                lòng điều chỉnh hoặc xóa bớt bộ lọc.
              </p>
              <button type="button" className="btn btn-primary" onClick={handleClearFilters}>
                Xóa bộ lọc
              </button>
            </div>
          )}

          {/* Room Cards Grid */}
          {!isInitialLoading && !roomsError && rooms && rooms.length > 0 && (
            <>
              <div className="room-grid">
                {rooms.map((room) => {
                  const hasImgError = imageErrorMap[room.id];
                  const imgSrc = hasImgError
                    ? ROOM_PLACEHOLDER_IMAGE
                    : room.coverImage || ROOM_PLACEHOLDER_IMAGE;

                  return (
                    <article key={room.id} className="card room-card">
                      <Link
                        to={`/rooms/${room.id}`}
                        state={{ from: location.pathname + location.search }}
                        className="room-card-link"
                      >
                        <div className="room-card-image-wrapper">
                          <img
                            src={imgSrc}
                            alt={room.name}
                            className="room-card-image"
                            onError={() => handleCardImageError(room.id)}
                            loading="lazy"
                          />
                          <span
                            className={`badge room-status-badge ${
                              room.status === 'MAINTENANCE'
                                ? 'badge-maintenance'
                                : 'badge-available'
                            }`}
                          >
                            {room.status === 'MAINTENANCE' ? 'Bảo trì' : 'Sẵn sàng'}
                          </span>
                        </div>

                        <div className="room-card-body">
                          <h3 className="room-card-title">{room.name}</h3>

                          <div className="room-card-info-row">
                            <span className="room-card-price">{formatVnd(room.pricePerHour)}</span>
                            <span className="room-card-capacity">👥 {room.capacity} người</span>
                          </div>

                          {room.amenities.length > 0 && (
                            <div className="room-card-amenities" aria-label="Tiện ích phòng">
                              {room.amenities.slice(0, 3).map((amenity) => (
                                <span key={amenity.id} className="amenity-pill">
                                  {amenity.icon === 'wifi'
                                    ? '📶 '
                                    : amenity.icon === 'coffee'
                                      ? '☕ '
                                      : amenity.icon === 'monitor' || amenity.icon === 'tv'
                                        ? '🖥️ '
                                        : '✨ '}
                                  {amenity.name}
                                </span>
                              ))}
                              {room.amenities.length > 3 && (
                                <span className="amenity-pill-more">
                                  +{room.amenities.length - 3}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </Link>
                    </article>
                  );
                })}
              </div>

              {/* Pagination Controls */}
              {pagination.totalPages > 1 && (
                <nav className="pagination-container" aria-label="Điều hướng phân trang">
                  <button
                    type="button"
                    className="btn btn-outline pagination-btn"
                    disabled={pagination.page <= 1}
                    onClick={() => handlePageChange(pagination.page - 1)}
                    aria-label="Trang trước"
                  >
                    ← Trang trước
                  </button>

                  <span className="pagination-info">
                    Trang <strong>{pagination.page}</strong> / {pagination.totalPages}
                  </span>

                  <button
                    type="button"
                    className="btn btn-outline pagination-btn"
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => handlePageChange(pagination.page + 1)}
                    aria-label="Trang sau"
                  >
                    Trang sau →
                  </button>
                </nav>
              )}
            </>
          )}
        </section>
      </div>

      <footer className="app-footer">
        Co-Space Working Platform — Hệ thống đặt chỗ làm việc thông minh.
      </footer>
    </main>
  );
};
