import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { roomApi } from '../services/room.api';
import { adminRoomApi } from '../services/admin-room.api';
import { RoomListItem, Amenity, RoomStatus } from '../types/room';
import {
  AdminRoomFormValues,
  AdminFormErrors,
  MAX_ROOM_IMAGE_FILES,
  MAX_ROOM_IMAGE_SIZE_BYTES,
  ALLOWED_IMAGE_MIME_TYPES,
} from '../types/admin-room';

const initialFormValues: AdminRoomFormValues = {
  name: '',
  description: '',
  capacity: '',
  pricePerHour: '',
  amenityIds: [],
  images: [],
};

export const AdminPage: React.FC = () => {
  const { principal, logout } = useAuth();

  // Room list state
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [availableAmenities, setAvailableAmenities] = useState<Amenity[]>([]);
  const [isLoadingAmenities, setIsLoadingAmenities] = useState<boolean>(true);
  const [amenitiesError, setAmenitiesError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalRooms, setTotalRooms] = useState<number>(0);
  const [isLoadingRooms, setIsLoadingRooms] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Shared create/edit form state
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editingRoomStatus, setEditingRoomStatus] = useState<RoomStatus | null>(null);
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);
  const [detailLoadError, setDetailLoadError] = useState<string | null>(null);
  const [formData, setFormData] = useState<AdminRoomFormValues>(initialFormValues);
  const [formErrors, setFormErrors] = useState<AdminFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // File upload state (Cloudinary)
  const [pendingImageFiles, setPendingImageFiles] = useState<File[]>([]);
  const [isUploadingImages, setIsUploadingImages] = useState<boolean>(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [createdRoomIdForRetry, setCreatedRoomIdForRetry] = useState<string | null>(null);
  const lastCommittedFormSnapshotRef = useRef<string | null>(null);

  const amenitiesRequestRef = useRef<AbortController | null>(null);
  const detailRequestRef = useRef<AbortController | null>(null);
  const uploadRequestRef = useRef<AbortController | null>(null);
  const formHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const formTriggerRef = useRef<HTMLButtonElement | null>(null);

  const fetchAmenities = useCallback(async () => {
    amenitiesRequestRef.current?.abort();
    const controller = new AbortController();
    amenitiesRequestRef.current = controller;
    setIsLoadingAmenities(true);
    setAmenitiesError(null);

    try {
      const res = await roomApi.getAmenities(controller.signal);
      if (controller.signal.aborted || amenitiesRequestRef.current !== controller) return;

      if (res.success) {
        setAvailableAmenities(res.data);
      } else {
        setAmenitiesError(res.message || 'Không thể tải danh sách tiện ích.');
      }
    } catch (err: any) {
      if (controller.signal.aborted || amenitiesRequestRef.current !== controller) return;
      setAmenitiesError(
        err.response?.data?.message || 'Không thể tải danh sách tiện ích. Vui lòng thử lại.',
      );
    } finally {
      if (amenitiesRequestRef.current === controller) {
        amenitiesRequestRef.current = null;
        setIsLoadingAmenities(false);
      }
    }
  }, []);

  // Fetch amenities once and cancel in-flight requests when leaving the page.
  useEffect(() => {
    fetchAmenities();

    return () => {
      amenitiesRequestRef.current?.abort();
      detailRequestRef.current?.abort();
      uploadRequestRef.current?.abort();
    };
  }, [fetchAmenities]);

  useEffect(() => {
    if (!isFormOpen) return;
    const frameId = window.requestAnimationFrame(() => {
      const active = document.activeElement;
      const isInputFocused =
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.tagName === 'SELECT');
      if (!isInputFocused) {
        formHeadingRef.current?.focus();
      }
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [isFormOpen]);

  // Fetch rooms
  const fetchRooms = useCallback(async (pageToLoad: number) => {
    setIsLoadingRooms(true);
    setLoadError(null);
    try {
      const res = await adminRoomApi.getAdminRooms({ page: pageToLoad, limit: 10 });
      if (res.success) {
        setRooms(res.data.items);
        setCurrentPage(res.data.pagination.page);
        setTotalPages(res.data.pagination.totalPages);
        setTotalRooms(res.data.pagination.total);
      }
    } catch (err: any) {
      setLoadError(
        err.response?.data?.message || 'Không thể tải danh sách phòng. Vui lòng thử lại.',
      );
    } finally {
      setIsLoadingRooms(false);
    }
  }, []);

  useEffect(() => {
    fetchRooms(currentPage);
  }, [fetchRooms, currentPage]);

  // Open Create Form
  const handleOpenCreate = (trigger: HTMLButtonElement) => {
    detailRequestRef.current?.abort();
    detailRequestRef.current = null;
    uploadRequestRef.current?.abort();
    uploadRequestRef.current = null;
    setLoadingDetailId(null);
    setDetailLoadError(null);
    formTriggerRef.current = trigger;
    setFormMode('create');
    setEditingRoomId(null);
    setEditingRoomStatus(null);
    setFormData(initialFormValues);
    setFormErrors({});
    setPendingImageFiles([]);
    setIsUploadingImages(false);
    setImageUploadError(null);
    setCreatedRoomIdForRetry(null);
    lastCommittedFormSnapshotRef.current = null;
    setIsFormOpen(true);
  };

  // Open Edit Form
  const handleOpenEdit = async (roomId: string, trigger: HTMLButtonElement) => {
    detailRequestRef.current?.abort();
    uploadRequestRef.current?.abort();
    uploadRequestRef.current = null;
    const controller = new AbortController();
    detailRequestRef.current = controller;
    formTriggerRef.current = trigger;
    setIsFormOpen(false);
    setFormMode('edit');
    setLoadingDetailId(roomId);
    setDetailLoadError(null);
    setFormErrors({});
    setPendingImageFiles([]);
    setIsUploadingImages(false);
    setImageUploadError(null);
    setCreatedRoomIdForRetry(null);
    lastCommittedFormSnapshotRef.current = null;
    try {
      const res = await roomApi.getRoomById(roomId, controller.signal);
      if (res.success && !controller.signal.aborted && detailRequestRef.current === controller) {
        const room = res.data;
        setEditingRoomId(room.id);
        setEditingRoomStatus(room.status);
        setFormData({
          name: room.name,
          description: room.description || '',
          capacity: String(room.capacity),
          pricePerHour: room.pricePerHour,
          amenityIds: room.amenities.map((a) => a.id),
          images: room.images.map((img) => ({
            imageUrl: img.imageUrl,
            isPrimary: img.isPrimary,
          })),
        });
        setIsFormOpen(true);
      }
    } catch (err: any) {
      if (controller.signal.aborted || detailRequestRef.current !== controller) return;
      setDetailLoadError(err.response?.data?.message || 'Không thể tải thông tin phòng để sửa.');
    } finally {
      if (detailRequestRef.current === controller) {
        detailRequestRef.current = null;
        setLoadingDetailId(null);
      }
    }
  };

  // Close & Reset Form
  const handleCloseForm = () => {
    if (isSubmitting || isUploadingImages) return;
    uploadRequestRef.current?.abort();
    uploadRequestRef.current = null;
    setIsFormOpen(false);
    setFormMode('create');
    setEditingRoomId(null);
    setEditingRoomStatus(null);
    setFormData(initialFormValues);
    setFormErrors({});
    setPendingImageFiles([]);
    setIsUploadingImages(false);
    setImageUploadError(null);
    setCreatedRoomIdForRetry(null);
    lastCommittedFormSnapshotRef.current = null;
    const trigger = formTriggerRef.current;
    formTriggerRef.current = null;
    window.requestAnimationFrame(() => trigger?.focus());
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const selected = Array.from(e.target.files);
    setImageUploadError(null);

    const combined = [...pendingImageFiles, ...selected];
    if (combined.length > MAX_ROOM_IMAGE_FILES) {
      setImageUploadError(
        `Số lượng file vượt quá giới hạn cho phép (tối đa ${MAX_ROOM_IMAGE_FILES} file)`,
      );
      e.target.value = '';
      return;
    }

    for (const file of selected) {
      if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type)) {
        setImageUploadError('Chỉ chấp nhận các định dạng ảnh JPEG, PNG, WebP');
        e.target.value = '';
        return;
      }
      if (file.size > MAX_ROOM_IMAGE_SIZE_BYTES) {
        setImageUploadError(
          `Kích thước file "${file.name}" vượt quá giới hạn cho phép (tối đa 5MB)`,
        );
        e.target.value = '';
        return;
      }
    }

    setPendingImageFiles(combined);
    e.target.value = '';
  };

  const handleRemovePendingFile = (indexToRemove: number) => {
    setPendingImageFiles((prev) => prev.filter((_, idx) => idx !== indexToRemove));
    setImageUploadError(null);
  };

  // Form field handlers
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (formErrors[name as keyof AdminFormErrors]) {
      setFormErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleAmenityToggle = (amenityId: string) => {
    setFormData((prev) => {
      const exists = prev.amenityIds.includes(amenityId);
      const updated = exists
        ? prev.amenityIds.filter((id) => id !== amenityId)
        : [...prev.amenityIds, amenityId];
      return { ...prev, amenityIds: updated };
    });
    if (formErrors.amenityIds) {
      setFormErrors((prev) => ({ ...prev, amenityIds: undefined }));
    }
  };

  const handleAddImage = () => {
    setFormData((prev) => {
      const isFirst = prev.images.length === 0;
      return {
        ...prev,
        images: [...prev.images, { imageUrl: '', isPrimary: isFirst }],
      };
    });
    if (formErrors.images) {
      setFormErrors((prev) => ({ ...prev, images: undefined }));
    }
  };

  const handleRemoveImage = (indexToRemove: number) => {
    setFormData((prev) => {
      const wasPrimary = prev.images[indexToRemove]?.isPrimary;
      const remaining = prev.images.filter((_, i) => i !== indexToRemove);
      if (wasPrimary && remaining.length > 0) {
        remaining[0].isPrimary = true;
      }
      return { ...prev, images: remaining };
    });
    if (formErrors.images) {
      setFormErrors((prev) => ({ ...prev, images: undefined }));
    }
  };

  const handleSetPrimaryImage = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      images: prev.images.map((img, i) => ({
        ...img,
        isPrimary: i === index,
      })),
    }));
    if (formErrors.images) {
      setFormErrors((prev) => ({ ...prev, images: undefined }));
    }
  };

  const handleImageUrlChange = (index: number, value: string) => {
    setFormData((prev) => ({
      ...prev,
      images: prev.images.map((img, i) => (i === index ? { ...img, imageUrl: value } : img)),
    }));
    if (formErrors.images) {
      setFormErrors((prev) => ({ ...prev, images: undefined }));
    }
  };

  // Form submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});

    if (isLoadingAmenities || amenitiesError) {
      setFormErrors({
        general: amenitiesError || 'Vui lòng chờ tải xong danh sách tiện ích trước khi lưu phòng.',
      });
      return;
    }

    // Client-side validations
    const errors: AdminFormErrors = {};
    const trimmedName = formData.name.trim();
    if (!trimmedName) {
      errors.name = 'Tên phòng không được để trống';
    } else if (trimmedName.length > 191) {
      errors.name = 'Tên phòng tối đa 191 ký tự';
    }

    const capacityNum = Number(formData.capacity);
    if (!formData.capacity || !Number.isInteger(capacityNum) || capacityNum <= 0) {
      errors.capacity = 'Sức chứa phải là số nguyên dương';
    }

    const priceStr = formData.pricePerHour.toString().trim();
    if (!priceStr || !/^\d+(\.\d{1,2})?$/.test(priceStr)) {
      errors.pricePerHour = 'Đơn giá phải là số tiền không âm với tối đa 2 chữ số thập phân';
    }

    if (formData.images.length > 0) {
      for (let i = 0; i < formData.images.length; i++) {
        const img = formData.images[i];
        const trimmedUrl = img.imageUrl.trim();
        if (!trimmedUrl) {
          errors.images = 'URL ảnh không được để trống';
          break;
        }
        if (!/^https?:\/\//i.test(trimmedUrl)) {
          errors.images = 'URL ảnh phải bắt đầu bằng http:// hoặc https://';
          break;
        }
        if (trimmedUrl.length > 500) {
          errors.images = 'URL ảnh không được vượt quá 500 ký tự';
          break;
        }
      }

      if (!errors.images) {
        const urls = formData.images.map((img) => img.imageUrl.trim());
        if (new Set(urls).size !== urls.length) {
          errors.images = 'Danh sách ảnh không được chứa URL trùng lặp';
        } else {
          const primaryCount = formData.images.filter((img) => img.isPrimary).length;
          if (primaryCount !== 1) {
            errors.images = 'Nếu phòng có ảnh, phải có duy nhất một ảnh chính (isPrimary = true)';
          }
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    if (isSubmitting || isUploadingImages) return;

    const isCreateFlow = formMode === 'create';
    let targetRoomId: string | null = isCreateFlow ? createdRoomIdForRetry : editingRoomId;

    setIsSubmitting(true);
    setImageUploadError(null);

    try {
      const normalizedDescription =
        formData.description.trim() === '' ? null : formData.description.trim();
      const payloadImages = formData.images.map((img) => ({
        imageUrl: img.imageUrl.trim(),
        isPrimary: img.isPrimary,
      }));

      const currentFormSnapshot = JSON.stringify({
        name: trimmedName,
        description: normalizedDescription,
        capacity: capacityNum,
        pricePerHour: priceStr,
        amenityIds: [...formData.amenityIds].sort(),
        images: payloadImages,
      });

      const isMetadataCommitted =
        targetRoomId !== null && lastCommittedFormSnapshotRef.current === currentFormSnapshot;

      if (!isMetadataCommitted) {
        if (targetRoomId) {
          await adminRoomApi.updateRoom(targetRoomId, {
            name: trimmedName,
            description: normalizedDescription,
            capacity: capacityNum,
            pricePerHour: priceStr,
            amenityIds: formData.amenityIds,
            images: payloadImages,
          });
          lastCommittedFormSnapshotRef.current = currentFormSnapshot;
        } else {
          const createRes = await adminRoomApi.createRoom({
            name: trimmedName,
            description: normalizedDescription,
            capacity: capacityNum,
            pricePerHour: priceStr,
            amenityIds: formData.amenityIds,
            images: payloadImages,
          });
          targetRoomId = createRes.data.id;
          setCreatedRoomIdForRetry(createRes.data.id);
          lastCommittedFormSnapshotRef.current = currentFormSnapshot;
        }
      }
    } catch (err: any) {
      setIsSubmitting(false);
      const serverDetails = err.response?.data?.details;
      const serverMessage = err.response?.data?.message || 'Đã có lỗi xảy ra khi lưu phòng.';
      const mapped: AdminFormErrors = { general: serverMessage };

      if (Array.isArray(serverDetails)) {
        for (const item of serverDetails) {
          if (item.field === 'name') mapped.name = item.message;
          else if (item.field === 'capacity') mapped.capacity = item.message;
          else if (item.field === 'pricePerHour') mapped.pricePerHour = item.message;
          else if (item.field === 'description') mapped.description = item.message;
          else if (item.field?.startsWith('images') || item.field === 'images')
            mapped.images = item.message;
          else if (item.field?.startsWith('amenityIds') || item.field === 'amenityIds')
            mapped.amenityIds = item.message;
          else mapped.general = item.message;
        }
      }
      setFormErrors(mapped);
      return;
    } finally {
      setIsSubmitting(false);
    }

    // If no pending image files to upload, complete immediately
    if (!targetRoomId || pendingImageFiles.length === 0) {
      setSuccessMessage(
        isCreateFlow ? 'Tạo phòng mới thành công!' : 'Cập nhật thông tin phòng thành công!',
      );
      handleCloseForm();
      if (isCreateFlow) {
        setCurrentPage(1);
        fetchRooms(1);
      } else {
        fetchRooms(currentPage);
      }
      return;
    }

    // Upload pending image files
    setIsUploadingImages(true);
    uploadRequestRef.current?.abort();
    const uploadController = new AbortController();
    uploadRequestRef.current = uploadController;

    try {
      await adminRoomApi.uploadRoomImages(targetRoomId, pendingImageFiles, uploadController.signal);
      if (uploadController.signal.aborted || uploadRequestRef.current !== uploadController) return;

      setPendingImageFiles([]);
      setSuccessMessage(
        isCreateFlow ? 'Tạo phòng mới thành công!' : 'Cập nhật thông tin phòng thành công!',
      );
      handleCloseForm();
      if (isCreateFlow) {
        setCurrentPage(1);
        fetchRooms(1);
      } else {
        fetchRooms(currentPage);
      }
    } catch (err: any) {
      if (uploadController.signal.aborted || uploadRequestRef.current !== uploadController) return;
      const serverMessage =
        err.response?.data?.message || 'Không thể tải ảnh lên. Vui lòng thử lại.';
      setImageUploadError(serverMessage);
      if (isCreateFlow && targetRoomId) {
        setCreatedRoomIdForRetry(targetRoomId);
      }
    } finally {
      if (uploadRequestRef.current === uploadController) {
        uploadRequestRef.current = null;
        setIsUploadingImages(false);
      }
    }
  };

  return (
    <main className="page-container admin-page-container">
      {/* App Header */}
      <header className="app-header">
        <div className="brand-section">
          <h1>🏢 Co-Space Working — Quản Trị Phòng</h1>
          <p>Quản trị viên: {principal?.fullName || principal?.email}</p>
        </div>

        <nav className="nav-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={(event) => handleOpenCreate(event.currentTarget)}
            data-testid="admin-add-room-btn"
          >
            + Thêm phòng mới
          </button>
          <Link to="/" className="btn btn-outline">
            Về trang chủ
          </Link>
          <button
            type="button"
            className="btn btn-danger-outline"
            onClick={() => logout('userAction')}
          >
            Đăng xuất
          </button>
        </nav>
      </header>

      {/* Success Notification */}
      {successMessage && (
        <div className="alert alert-success admin-success-banner" role="status">
          <span>{successMessage}</span>
          <button
            type="button"
            className="btn-link"
            style={{ marginLeft: 'auto', fontWeight: 'bold' }}
            onClick={() => setSuccessMessage(null)}
            aria-label="Đóng thông báo thành công"
          >
            ✕
          </button>
        </div>
      )}

      {detailLoadError && (
        <div className="alert alert-danger admin-error-box" role="alert">
          <span>{detailLoadError}</span>
          <button
            type="button"
            className="btn-link"
            onClick={() => setDetailLoadError(null)}
            aria-label="Đóng thông báo lỗi"
          >
            ✕
          </button>
        </div>
      )}

      {/* Room List Section */}
      <section className="card admin-table-card">
        <div className="results-header-row">
          <h2 className="results-title">
            Danh sách phòng làm việc <span className="results-count">({totalRooms} phòng)</span>
          </h2>
        </div>

        {/* Loading state */}
        {isLoadingRooms && (
          <div className="loading-container" data-testid="admin-loading-state">
            <p>Đang tải danh sách phòng...</p>
          </div>
        )}

        {/* Error state */}
        {!isLoadingRooms && loadError && (
          <div className="alert alert-danger admin-error-box" role="alert">
            <p>{loadError}</p>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => fetchRooms(currentPage)}
            >
              Thử lại
            </button>
          </div>
        )}

        {/* Empty state */}
        {!isLoadingRooms && !loadError && rooms.length === 0 && (
          <div className="empty-state-card" data-testid="admin-empty-state">
            <div className="state-icon">🏢</div>
            <h3 className="empty-title">Chưa có phòng nào</h3>
            <p className="empty-description">
              Hệ thống hiện tại chưa có phòng nào. Nhấn vào nút "+ Thêm phòng mới" ở trên để tạo
              phòng đầu tiên.
            </p>
          </div>
        )}

        {/* Room Table / List */}
        {!isLoadingRooms && !loadError && rooms.length > 0 && (
          <div className="table-responsive">
            <table className="admin-room-table" data-testid="admin-room-table">
              <thead>
                <tr>
                  <th>Ảnh</th>
                  <th>Tên phòng</th>
                  <th>Sức chứa</th>
                  <th>Đơn giá / giờ</th>
                  <th>Trạng thái</th>
                  <th>Tiện ích</th>
                  <th style={{ textAlign: 'right' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((room) => (
                  <tr key={room.id} data-testid={`admin-room-row-${room.id}`}>
                    <td className="admin-room-img-col">
                      {room.coverImage ? (
                        <img src={room.coverImage} alt={room.name} className="admin-room-thumb" />
                      ) : (
                        <div className="admin-room-no-img">Không ảnh</div>
                      )}
                    </td>
                    <td className="admin-room-name-col">
                      <strong>{room.name}</strong>
                    </td>
                    <td>{room.capacity} người</td>
                    <td className="admin-price-text">
                      {Number(room.pricePerHour).toLocaleString('vi-VN')} đ/h
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          room.status === 'AVAILABLE' ? 'badge-available' : 'badge-maintenance'
                        }`}
                      >
                        {room.status}
                      </span>
                    </td>
                    <td>
                      <div className="admin-amenities-tags">
                        {room.amenities.length > 0 ? (
                          room.amenities.map((am) => (
                            <span key={am.id} className="amenity-pill">
                              {am.name}
                            </span>
                          ))
                        ) : (
                          <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                        )}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={(event) => handleOpenEdit(room.id, event.currentTarget)}
                        disabled={loadingDetailId === room.id}
                        data-testid={`admin-edit-btn-${room.id}`}
                      >
                        {loadingDetailId === room.id ? 'Đang tải...' : 'Sửa'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination controls */}
        {!isLoadingRooms && !loadError && totalPages > 1 && (
          <div className="pagination-container" data-testid="admin-pagination">
            <button
              type="button"
              className="btn btn-outline pagination-btn"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              ← Trang trước
            </button>
            <span className="pagination-info">
              Trang {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              className="btn btn-outline pagination-btn"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              Trang sau →
            </button>
          </div>
        )}
      </section>

      {/* Shared inline Create / Edit Form */}
      {isFormOpen && (
        <section
          className="card admin-room-form-card"
          data-testid="admin-room-form"
          aria-labelledby="admin-room-form-title"
        >
          <div className="admin-form-header">
            <h2 id="admin-room-form-title" ref={formHeadingRef} tabIndex={-1}>
              {editingRoomId ? 'Chỉnh Sửa Phòng' : 'Thêm Phòng Mới'}
            </h2>
            <button
              type="button"
              className="btn-close"
              onClick={handleCloseForm}
              disabled={isSubmitting || isUploadingImages}
              aria-label="Đóng biểu mẫu phòng"
            >
              ✕
            </button>
          </div>

          {/* Read-only Status Notice */}
          <div className="admin-status-notice">
            {editingRoomId ? (
              <p>
                <strong>Trạng thái phòng:</strong>{' '}
                <span
                  className={`badge ${
                    editingRoomStatus === 'AVAILABLE' ? 'badge-available' : 'badge-maintenance'
                  }`}
                >
                  {editingRoomStatus}
                </span>{' '}
                <small style={{ color: 'var(--color-text-muted)' }}>
                  (Chỉ xem - không thể thay đổi ở tác vụ này)
                </small>
              </p>
            ) : (
              <p>
                <strong>Trạng thái ban đầu:</strong>{' '}
                <span className="badge badge-available">AVAILABLE</span>{' '}
                <small style={{ color: 'var(--color-text-muted)' }}>(Mặc định cho phòng mới)</small>
              </p>
            )}
          </div>

          {/* General form error banner */}
          {formErrors.general && (
            <div className="alert alert-danger" role="alert" data-testid="form-general-error">
              {formErrors.general}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate aria-busy={isSubmitting || isUploadingImages}>
            {/* Name */}
            <div className="form-group">
              <label htmlFor="room-name" className="form-label">
                Tên phòng <span style={{ color: 'var(--color-error)' }}>*</span>
              </label>
              <input
                id="room-name"
                type="text"
                name="name"
                className={`form-control ${formErrors.name ? 'has-error' : ''}`}
                value={formData.name}
                onChange={handleInputChange}
                placeholder="Ví dụ: Phòng Họp Sáng Tạo A"
                maxLength={191}
                disabled={isSubmitting || isUploadingImages}
                aria-invalid={Boolean(formErrors.name)}
                aria-describedby={formErrors.name ? 'error-name' : undefined}
              />
              {formErrors.name && (
                <p id="error-name" className="field-error" data-testid="error-name">
                  {formErrors.name}
                </p>
              )}
            </div>

            {/* Description */}
            <div className="form-group">
              <label htmlFor="room-description" className="form-label">
                Mô tả phòng
              </label>
              <textarea
                id="room-description"
                name="description"
                className={`form-control ${formErrors.description ? 'has-error' : ''}`}
                value={formData.description}
                onChange={handleInputChange}
                rows={3}
                placeholder="Mô tả các đặc điểm nổi bật, ánh sáng, thiết bị..."
                disabled={isSubmitting || isUploadingImages}
                aria-invalid={Boolean(formErrors.description)}
                aria-describedby={formErrors.description ? 'error-description' : undefined}
              />
              {formErrors.description && (
                <p id="error-description" className="field-error" data-testid="error-description">
                  {formErrors.description}
                </p>
              )}
            </div>

            {/* Capacity & Price Per Hour */}
            <div className="admin-form-row">
              <div className="form-group" style={{ flex: 1 }}>
                <label htmlFor="room-capacity" className="form-label">
                  Sức chứa (người) <span style={{ color: 'var(--color-error)' }}>*</span>
                </label>
                <input
                  id="room-capacity"
                  type="number"
                  name="capacity"
                  min="1"
                  className={`form-control ${formErrors.capacity ? 'has-error' : ''}`}
                  value={formData.capacity}
                  onChange={handleInputChange}
                  placeholder="Ví dụ: 8"
                  disabled={isSubmitting || isUploadingImages}
                  aria-invalid={Boolean(formErrors.capacity)}
                  aria-describedby={formErrors.capacity ? 'error-capacity' : undefined}
                />
                {formErrors.capacity && (
                  <p id="error-capacity" className="field-error" data-testid="error-capacity">
                    {formErrors.capacity}
                  </p>
                )}
              </div>

              <div className="form-group" style={{ flex: 1 }}>
                <label htmlFor="room-price" className="form-label">
                  Đơn giá mỗi giờ (VNĐ) <span style={{ color: 'var(--color-error)' }}>*</span>
                </label>
                <input
                  id="room-price"
                  type="text"
                  name="pricePerHour"
                  className={`form-control ${formErrors.pricePerHour ? 'has-error' : ''}`}
                  value={formData.pricePerHour}
                  onChange={handleInputChange}
                  placeholder="Ví dụ: 150000.00"
                  disabled={isSubmitting || isUploadingImages}
                  aria-invalid={Boolean(formErrors.pricePerHour)}
                  aria-describedby={formErrors.pricePerHour ? 'error-pricePerHour' : undefined}
                />
                {formErrors.pricePerHour && (
                  <p
                    id="error-pricePerHour"
                    className="field-error"
                    data-testid="error-pricePerHour"
                  >
                    {formErrors.pricePerHour}
                  </p>
                )}
              </div>
            </div>

            {/* Amenities Checklist */}
            <div className="form-group">
              <span id="room-amenities-label" className="form-label">
                Tiện ích phòng
              </span>
              <div
                className="admin-amenities-checklist"
                role="group"
                aria-labelledby="room-amenities-label"
                aria-busy={isLoadingAmenities}
                aria-describedby={formErrors.amenityIds ? 'error-amenityIds' : undefined}
              >
                {isLoadingAmenities ? (
                  <p className="admin-amenities-message">Đang tải danh sách tiện ích...</p>
                ) : amenitiesError ? (
                  <div className="admin-amenity-error-box" role="alert">
                    <p>{amenitiesError}</p>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={fetchAmenities}
                    >
                      Thử tải lại
                    </button>
                  </div>
                ) : availableAmenities.length > 0 ? (
                  availableAmenities.map((amenity) => (
                    <label
                      key={amenity.id}
                      className="amenity-checkbox-item"
                      data-testid={`amenity-item-${amenity.id}`}
                    >
                      <input
                        type="checkbox"
                        className="amenity-checkbox"
                        checked={formData.amenityIds.includes(amenity.id)}
                        onChange={() => handleAmenityToggle(amenity.id)}
                        disabled={
                          isSubmitting ||
                          isUploadingImages ||
                          isLoadingAmenities ||
                          Boolean(amenitiesError)
                        }
                      />
                      <span>{amenity.name}</span>
                    </label>
                  ))
                ) : (
                  <p className="admin-amenities-message">Chưa có tiện ích nào trong hệ thống.</p>
                )}
              </div>
              {formErrors.amenityIds && (
                <p id="error-amenityIds" className="field-error" data-testid="error-amenityIds">
                  {formErrors.amenityIds}
                </p>
              )}
            </div>

            {/* Image URLs Dynamic List */}
            <div className="form-group">
              <div className="admin-images-header">
                <span className="form-label" style={{ margin: 0 }}>
                  Danh sách URL ảnh
                </span>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={handleAddImage}
                  disabled={isSubmitting || isUploadingImages}
                  data-testid="admin-add-image-btn"
                >
                  + Thêm URL ảnh
                </button>
              </div>
              <small
                style={{
                  display: 'block',
                  color: 'var(--color-text-muted)',
                  marginBottom: '0.75rem',
                }}
              >
                Nhập URL ảnh (HTTP/HTTPS). Nếu có ảnh, phải chọn đúng 1 ảnh chính.
              </small>

              {formErrors.images && (
                <p
                  id="error-images"
                  className="field-error"
                  style={{ marginBottom: '0.75rem' }}
                  data-testid="error-images"
                >
                  {formErrors.images}
                </p>
              )}

              <div className="admin-images-list">
                {formData.images.map((img, idx) => (
                  <div key={idx} className="admin-image-row" data-testid={`admin-image-row-${idx}`}>
                    <label htmlFor={`room-image-url-${idx}`} className="sr-only">
                      URL ảnh {idx + 1}
                    </label>
                    <input
                      id={`room-image-url-${idx}`}
                      type="url"
                      className="form-control admin-image-url-input"
                      placeholder="https://example.com/image.jpg"
                      value={img.imageUrl}
                      onChange={(e) => handleImageUrlChange(idx, e.target.value)}
                      disabled={isSubmitting || isUploadingImages}
                      maxLength={500}
                      aria-invalid={Boolean(formErrors.images)}
                      aria-describedby={formErrors.images ? 'error-images' : undefined}
                      data-testid={`admin-image-input-${idx}`}
                    />
                    <label className="admin-primary-radio-label">
                      <input
                        type="radio"
                        name="primaryImage"
                        checked={img.isPrimary}
                        onChange={() => handleSetPrimaryImage(idx)}
                        disabled={isSubmitting || isUploadingImages}
                        data-testid={`admin-primary-radio-${idx}`}
                      />
                      <span>Ảnh chính</span>
                    </label>
                    <button
                      type="button"
                      className="btn btn-danger-outline btn-sm"
                      onClick={() => handleRemoveImage(idx)}
                      disabled={isSubmitting || isUploadingImages}
                      data-testid={`admin-remove-image-${idx}`}
                    >
                      Xóa
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Direct File Upload Section (Cloudinary) */}
            <div className="form-group admin-upload-section">
              <div className="admin-upload-header">
                <label htmlFor="room-image-files" className="form-label" style={{ margin: 0 }}>
                  Tải ảnh trực tiếp (Cloudinary)
                </label>
              </div>
              <p className="admin-upload-helptext">
                Hỗ trợ JPEG, PNG, WebP. Tối đa 10 ảnh, dung lượng tối đa 5MB mỗi ảnh.
              </p>

              {imageUploadError && (
                <div
                  className="alert alert-danger"
                  role="alert"
                  id="error-image-upload"
                  data-testid="image-upload-error"
                  style={{ marginBottom: '0.75rem' }}
                >
                  <span>{imageUploadError}</span>
                </div>
              )}

              <div className="admin-file-input-wrapper">
                <input
                  id="room-image-files"
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileSelect}
                  disabled={isSubmitting || isUploadingImages}
                  aria-describedby={imageUploadError ? 'error-image-upload' : undefined}
                  data-testid="admin-room-files-input"
                  className="admin-file-input"
                />
              </div>

              {/* Selected pending files list */}
              {pendingImageFiles.length > 0 && (
                <div className="admin-pending-files-list" data-testid="admin-pending-files-list">
                  <p className="admin-pending-files-count">
                    Đã chọn {pendingImageFiles.length} file chờ tải lên:
                  </p>
                  <ul className="admin-pending-files-items">
                    {pendingImageFiles.map((file, idx) => (
                      <li
                        key={`${file.name}-${idx}`}
                        className="admin-pending-file-item"
                        data-testid={`admin-pending-file-${idx}`}
                      >
                        <span className="admin-pending-file-name" title={file.name}>
                          📷 {file.name}
                        </span>
                        <span className="admin-pending-file-size">
                          ({(file.size / 1024 / 1024).toFixed(2)} MB)
                        </span>
                        <button
                          type="button"
                          className="btn-link admin-remove-file-btn"
                          onClick={() => handleRemovePendingFile(idx)}
                          disabled={isSubmitting || isUploadingImages}
                          aria-label={`Xóa file ${file.name}`}
                          data-testid={`admin-remove-file-${idx}`}
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Upload loading state indicator */}
              {isUploadingImages && (
                <div
                  className="admin-uploading-indicator"
                  aria-live="polite"
                  data-testid="uploading-indicator"
                >
                  <span>Đang tải ảnh...</span>
                </div>
              )}
            </div>

            {/* Form Action Buttons */}
            <div className="admin-form-actions">
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleCloseForm}
                disabled={isSubmitting || isUploadingImages}
              >
                Hủy
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={
                  isSubmitting || isUploadingImages || isLoadingAmenities || Boolean(amenitiesError)
                }
                data-testid="admin-submit-room-btn"
              >
                {isUploadingImages
                  ? 'Đang tải ảnh...'
                  : isSubmitting
                    ? 'Đang lưu...'
                    : imageUploadError && pendingImageFiles.length > 0
                      ? 'Thử lại tải ảnh'
                      : editingRoomId
                        ? 'Lưu thay đổi'
                        : 'Tạo phòng'}
              </button>
            </div>
          </form>
        </section>
      )}
    </main>
  );
};
