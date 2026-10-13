import React, { useEffect, useState } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import { roomApi } from '../services/room.api';
import { RoomDetail } from '../types/room';
import { formatVnd } from '../utils/format';
import { useAuth } from '../hooks/useAuth';
import { BookingForm } from '../components/BookingForm';
import { AppHeader } from '../layouts/AppHeader';
import { AppFooter } from '../layouts/AppFooter';
import { ArrowLeft } from 'lucide-react';
import styles from './RoomDetailPage.module.css';

export const ROOM_PLACEHOLDER_IMAGE =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400" fill="%23f3f4f6"><rect width="600" height="400"/><path d="M260 170a30 30 0 1 0 0-60 30 30 0 0 0 0 60zm-90 130h360l-110-140-90 110-50-60-110 90z" fill="%23cbd5e1"/><text x="50%" y="85%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="20" fill="%239ca3af">Co-Space</text></svg>';

export const RoomDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { isAuthenticated, principal } = useAuth();

  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState<number>(0);
  const [imageErrorMap, setImageErrorMap] = useState<Record<string, boolean>>({});

  // Preserve previous filter query or fallback to root
  const backUrl = (location.state as { from?: string })?.from || '/';

  const fetchRoom = (roomId: string, signal?: AbortSignal) => {
    setLoading(true);
    setErrorCode(null);
    setErrorMessage(null);

    roomApi
      .getRoomById(roomId, signal)
      .then((res) => {
        setRoom(res.data);
        setActiveImageIndex(0);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') {
          return;
        }
        const serverCode = err.response?.data?.code;
        const serverMessage = err.response?.data?.message || err.message;
        setErrorCode(serverCode || (err.response?.status === 404 ? 'ROOM_NOT_FOUND' : 'ERROR'));
        setErrorMessage(serverMessage || 'Không thể tải thông tin phòng');
        setLoading(false);
      });
  };

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    fetchRoom(id, controller.signal);

    return () => {
      controller.abort();
    };
  }, [id]);

  const handleImageError = (imgId: string) => {
    setImageErrorMap((prev) => ({ ...prev, [imgId]: true }));
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-canvas, #fafafa)' }}>
      <AppHeader />

      <main className={`page-container detail-page-container ${styles.container}`} style={{ flex: 1, width: '100%' }}>
        <div className={`back-nav-container ${styles.backNav}`}>
          <Link to={backUrl} className={`btn btn-outline btn-back ${styles.backBtn}`}>
            <ArrowLeft size={16} />
            <span>← Quay lại danh sách phòng</span>
          </Link>
        </div>

      {loading && (
        <section
          className="room-detail-skeleton"
          aria-busy="true"
          aria-label="Đang tải thông tin phòng"
        >
          <div className="skeleton skeleton-gallery" />
          <div className="skeleton-detail-info">
            <div className="skeleton skeleton-title" />
            <div className="skeleton skeleton-text" />
            <div className="skeleton skeleton-text" />
            <div className="skeleton skeleton-badge-row" />
          </div>
        </section>
      )}

      {!loading && errorCode === 'ROOM_NOT_FOUND' && (
        <section className="card error-state-card" role="alert">
          <div className="state-icon">🔍</div>
          <h2 className="error-title">Không tìm thấy phòng</h2>
          <p className="error-description">
            Phòng bạn đang tìm kiếm không tồn tại hoặc đã bị ngừng cung cấp dịch vụ.
          </p>
          <Link to={backUrl} className="btn btn-primary">
            Quay về danh sách phòng
          </Link>
        </section>
      )}

      {!loading && errorCode && errorCode !== 'ROOM_NOT_FOUND' && (
        <section className="card error-state-card" role="alert">
          <div className="state-icon">⚠️</div>
          <h2 className="error-title">Lỗi kết nối</h2>
          <p className="error-description">
            {errorMessage || 'Đã có lỗi xảy ra khi tải thông tin chi tiết phòng.'}
          </p>
          <div className="action-row" style={{ justifyContent: 'center' }}>
            <button type="button" className="btn btn-primary" onClick={() => id && fetchRoom(id)}>
              Thử lại
            </button>
            <Link to={backUrl} className="btn btn-outline">
              Về danh sách
            </Link>
          </div>
        </section>
      )}

      {!loading && room && (
        <article className={`room-detail-layout card ${styles.detailLayout}`}>
          {/* Main Content Column */}
          <div className={styles.mainContent}>
            {/* Gallery Section */}
            <section
              className={`room-gallery-section ${styles.galleryCard}`}
              aria-label="Bộ sưu tập hình ảnh phòng"
            >
              <div className={`gallery-main-container ${styles.mainImageWrapper}`}>
                {room.images && room.images.length > 0 ? (
                  <img
                    src={
                      imageErrorMap[room.images[activeImageIndex]?.id]
                        ? ROOM_PLACEHOLDER_IMAGE
                        : room.images[activeImageIndex]?.imageUrl || ROOM_PLACEHOLDER_IMAGE
                    }
                    alt={`${room.name} - Ảnh ${activeImageIndex + 1}`}
                    className={`gallery-main-image ${styles.mainImage}`}
                    onError={() => handleImageError(room.images[activeImageIndex]?.id)}
                  />
                ) : (
                  <img
                    src={ROOM_PLACEHOLDER_IMAGE}
                    alt={`${room.name} - Chưa có ảnh`}
                    className={`gallery-main-image ${styles.mainImage}`}
                  />
                )}
              </div>

              {room.images && room.images.length > 1 && (
                <div
                  className={`thumbnail-strip ${styles.thumbnailStrip}`}
                  role="group"
                  aria-label="Danh sách ảnh thu nhỏ"
                >
                  {room.images.map((img, idx) => (
                    <button
                      key={img.id}
                      type="button"
                      className={`thumbnail-btn ${styles.thumbnailBtn} ${
                        idx === activeImageIndex ? `active ${styles.thumbnailActive}` : ''
                      }`}
                      onClick={() => setActiveImageIndex(idx)}
                      aria-label={`Xem ảnh ${idx + 1}`}
                      aria-current={idx === activeImageIndex}
                    >
                      <img
                        src={imageErrorMap[img.id] ? ROOM_PLACEHOLDER_IMAGE : img.imageUrl}
                        alt={`Thumbnail ${idx + 1}`}
                        className={`thumbnail-img ${styles.thumbnailImg}`}
                        onError={() => handleImageError(img.id)}
                      />
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* Details & Specs Section */}
            <section className={`room-info-section ${styles.infoCard}`}>
              <div className={`room-header-row ${styles.headerRow}`}>
                <h1 className={`room-detail-name ${styles.roomName}`}>{room.name}</h1>
                <span
                  className={`badge ${styles.statusPill} ${
                    room.status === 'MAINTENANCE' ? 'badge-maintenance' : 'badge-available'
                  }`}
                >
                  {room.status === 'MAINTENANCE' ? 'Bảo trì' : 'Sẵn sàng'}
                </span>
              </div>

              <div className={`room-specs-card ${styles.specsGrid}`}>
                <div className={`spec-item ${styles.specCard}`}>
                  <span className={`spec-label ${styles.specLabel}`}>Giá thuê theo giờ:</span>
                  <span
                    className={`spec-value price-highlight ${styles.specValue} ${styles.priceHighlight}`}
                  >
                    {formatVnd(room.pricePerHour)}
                  </span>
                </div>
                <div className={`spec-item ${styles.specCard}`}>
                  <span className={`spec-label ${styles.specLabel}`}>Sức chứa tối đa:</span>
                  <span className={`spec-value ${styles.specValue}`}>{room.capacity} người</span>
                </div>
              </div>

              <div className={`room-description-section ${styles.sectionBlock}`}>
                <h3 className={styles.sectionTitle}>Mô tả phòng</h3>
                <p className={`room-description-text ${styles.descriptionText}`}>
                  {room.description ? room.description : 'Chưa có mô tả chi tiết cho phòng này.'}
                </p>
              </div>

              <div className={`room-amenities-section ${styles.sectionBlock}`}>
                <h3 className={styles.sectionTitle}>Tiện ích sẵn có ({room.amenities.length})</h3>
                {room.amenities.length > 0 ? (
                  <ul className={`detail-amenity-grid ${styles.amenitiesGrid}`}>
                    {room.amenities.map((amenity) => (
                      <li key={amenity.id} className={`detail-amenity-card ${styles.amenityCard}`}>
                        <span className={`detail-amenity-icon ${styles.amenityIcon}`} aria-hidden="true">
                          {amenity.icon === 'wifi'
                            ? '📶'
                            : amenity.icon === 'coffee'
                              ? '☕'
                              : amenity.icon === 'monitor' || amenity.icon === 'tv'
                                ? '🖥️'
                                : amenity.icon === 'board'
                                  ? '📋'
                                  : '✨'}
                        </span>
                        <div className="detail-amenity-content">
                          <strong>{amenity.name}</strong>
                          {amenity.description && <p>{amenity.description}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted">Phòng này hiện chưa có danh sách tiện ích bổ sung.</p>
                )}
              </div>
            </section>
          </div>

          {/* Sticky Booking Sidebar Column */}
          <aside className={styles.bookingSidebar} aria-label="Khu vực đặt phòng">
            <BookingForm
              roomId={room.id}
              roomName={room.name}
              roomStatus={room.status}
              pricePerHour={room.pricePerHour}
              isAuthenticated={isAuthenticated}
              userRole={principal?.role}
              userId={principal?.id}
            />
          </aside>
        </article>
      )}
      </main>

      <AppFooter />
    </div>
  );
};

