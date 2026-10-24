import React, { useState, useEffect, useCallback, useRef } from 'react';
import { roomApi } from '../services/room.api';
import { adminRoomApi } from '../services/admin-room.api';
import { RoomListItem, Amenity, RoomStatus } from '../types/room';
import {
  AdminRoomFormValues,
  AdminFormErrors,
  MAX_ROOM_IMAGE_FILES,
  MAX_ROOM_IMAGE_SIZE_BYTES,
  ALLOWED_IMAGE_MIME_TYPES,
  FutureBookingWarningDetails,
  UpdateRoomPayload,
} from '../types/admin-room';

import { DoorOpen, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { Pagination } from '@/components/common/Pagination';
import { cn } from '@/lib/utils';
import { RoomTable } from '../components/admin/rooms/RoomTable';
import { RoomForm } from '../components/admin/rooms/RoomForm';
import { RoomNotice } from '../components/admin/rooms/RoomNotice';

const initialFormValues: AdminRoomFormValues = {
  name: '',
  description: '',
  capacity: '',
  pricePerHour: '',
  amenityIds: [],
  images: [],
  status: 'AVAILABLE',
};

function getImageUploadError(error: { response?: { status?: number; data?: unknown } }): string {
  const data = error.response?.data;
  if (data && typeof data === 'object' && 'message' in data) {
    if (typeof data.message === 'string' && data.message.trim()) return data.message;
  }
  if (error.response?.status === 413) {
    return 'Dung lượng tải lên vượt giới hạn máy chủ. Vui lòng giảm số lượng hoặc dung lượng ảnh rồi thử lại.';
  }
  return 'Không thể tải ảnh lên. Vui lòng thử lại.';
}

export const AdminPage: React.FC = () => {
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

  // Future booking warning state (AC1)
  const [futureBookingWarning, setFutureBookingWarning] =
    useState<FutureBookingWarningDetails | null>(null);
  const [frozenUpdatePayload, setFrozenUpdatePayload] = useState<UpdateRoomPayload | null>(null);
  const [isConfirmingMaintenance, setIsConfirmingMaintenance] = useState<boolean>(false);

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
    setFormData(initialFormValues);
    setFormErrors({});
    setPendingImageFiles([]);
    setIsUploadingImages(false);
    setImageUploadError(null);
    setCreatedRoomIdForRetry(null);
    lastCommittedFormSnapshotRef.current = null;
    setFutureBookingWarning(null);
    setFrozenUpdatePayload(null);
    setIsConfirmingMaintenance(false);
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
    setFutureBookingWarning(null);
    setFrozenUpdatePayload(null);
    setIsConfirmingMaintenance(false);
    try {
      const res = await roomApi.getRoomById(roomId, controller.signal);
      if (res.success && !controller.signal.aborted && detailRequestRef.current === controller) {
        const room = res.data;
        setEditingRoomId(room.id);
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
          status: room.status,
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
    if (isSubmitting || isUploadingImages || isConfirmingMaintenance) return;
    uploadRequestRef.current?.abort();
    uploadRequestRef.current = null;
    setIsFormOpen(false);
    setFormMode('create');
    setEditingRoomId(null);
    setFormData(initialFormValues);
    setFormErrors({});
    setPendingImageFiles([]);
    setIsUploadingImages(false);
    setImageUploadError(null);
    setCreatedRoomIdForRetry(null);
    lastCommittedFormSnapshotRef.current = null;
    setFutureBookingWarning(null);
    setFrozenUpdatePayload(null);
    setIsConfirmingMaintenance(false);
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
    const normalizedDescription =
      formData.description.trim() === '' ? null : formData.description.trim();
    const payloadImages = formData.images.map((img) => ({
      imageUrl: img.imageUrl.trim(),
      isPrimary: img.isPrimary,
    }));

    setIsSubmitting(true);
    setImageUploadError(null);

    try {
      const currentFormSnapshot = JSON.stringify({
        name: trimmedName,
        description: normalizedDescription,
        capacity: capacityNum,
        pricePerHour: priceStr,
        amenityIds: [...formData.amenityIds].sort(),
        images: payloadImages,
        status: formMode === 'edit' ? formData.status : undefined,
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
            status: formData.status,
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

      if (err.response?.data?.code === 'ROOM_HAS_FUTURE_BOOKINGS') {
        const details = err.response.data.details as FutureBookingWarningDetails;
        setFutureBookingWarning(details);
        setFrozenUpdatePayload({
          name: trimmedName,
          description: normalizedDescription,
          capacity: capacityNum,
          pricePerHour: priceStr,
          amenityIds: formData.amenityIds,
          images: payloadImages,
          status: formData.status,
        });
        return;
      }

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
      setImageUploadError(getImageUploadError(err));
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

  const handleConfirmMaintenance = async () => {
    if (!editingRoomId || !frozenUpdatePayload || isConfirmingMaintenance) return;
    setIsConfirmingMaintenance(true);
    setImageUploadError(null);

    try {
      await adminRoomApi.updateRoom(editingRoomId, {
        ...frozenUpdatePayload,
        acknowledgeFutureBookings: true,
      });
      lastCommittedFormSnapshotRef.current = JSON.stringify({
        name: frozenUpdatePayload.name,
        description: frozenUpdatePayload.description,
        capacity: frozenUpdatePayload.capacity,
        pricePerHour: String(frozenUpdatePayload.pricePerHour),
        amenityIds: [...(frozenUpdatePayload.amenityIds || [])].sort(),
        images: frozenUpdatePayload.images,
        status: frozenUpdatePayload.status,
      });
      setFutureBookingWarning(null);
      setFrozenUpdatePayload(null);
    } catch (err: any) {
      setIsConfirmingMaintenance(false);
      setFormErrors({
        general: err.response?.data?.message || 'Không thể chuyển phòng sang bảo trì.',
      });
      return;
    } finally {
      setIsConfirmingMaintenance(false);
    }

    // If no pending image files to upload, complete immediately
    if (pendingImageFiles.length === 0) {
      setSuccessMessage('Cập nhật thông tin phòng thành công!');
      handleCloseForm();
      fetchRooms(currentPage);
      return;
    }

    // Upload pending image files
    setIsUploadingImages(true);
    uploadRequestRef.current?.abort();
    const uploadController = new AbortController();
    uploadRequestRef.current = uploadController;

    try {
      await adminRoomApi.uploadRoomImages(
        editingRoomId,
        pendingImageFiles,
        uploadController.signal,
      );
      if (uploadController.signal.aborted || uploadRequestRef.current !== uploadController) return;

      setPendingImageFiles([]);
      setSuccessMessage('Cập nhật thông tin phòng thành công!');
      handleCloseForm();
      fetchRooms(currentPage);
    } catch (err: any) {
      if (uploadController.signal.aborted || uploadRequestRef.current !== uploadController) return;
      setImageUploadError(getImageUploadError(err));
    } finally {
      if (uploadRequestRef.current === uploadController) {
        uploadRequestRef.current = null;
        setIsUploadingImages(false);
      }
    }
  };

  const handleDismissWarning = () => {
    setFutureBookingWarning(null);
    setFrozenUpdatePayload(null);
  };

  const handleStatusChange = (val: RoomStatus) => {
    setFormData((prev) => ({ ...prev, status: val }));
    if (futureBookingWarning) {
      setFutureBookingWarning(null);
      setFrozenUpdatePayload(null);
    }
  };

  const showRoomList = !isLoadingRooms && !loadError;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:gap-8">
      <PageHeader
        eyebrow="Phòng"
        title="Quản Lý Phòng Làm Việc"
        description="Thêm mới, cập nhật thông tin tiện ích, giá thuê và bảo trì phòng"
        className="gap-4 border-border pb-5"
        actions={
          <Button
            type="button"
            onClick={(event) => handleOpenCreate(event.currentTarget)}
            data-testid="admin-add-room-btn"
          >
            <Plus aria-hidden="true" />
            Thêm phòng mới
          </Button>
        }
      />

      {successMessage && (
        <RoomNotice
          tone="success"
          role="status"
          dismissLabel="Đóng thông báo thành công"
          onDismiss={() => setSuccessMessage(null)}
        >
          <span>{successMessage}</span>
        </RoomNotice>
      )}

      {detailLoadError && (
        <RoomNotice
          tone="error"
          role="alert"
          dismissLabel="Đóng thông báo lỗi"
          onDismiss={() => setDetailLoadError(null)}
        >
          <span>{detailLoadError}</span>
        </RoomNotice>
      )}

      <div
        className={cn(
          'grid grid-cols-[minmax(0,1fr)] items-start gap-6',
          isFormOpen && 'xl:grid-cols-[minmax(0,1fr)_420px]',
        )}
      >
        {/* Room list */}
        <section
          className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4"
          aria-labelledby="admin-room-list-title"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="admin-room-list-title" className="text-h3">
              Danh sách phòng làm việc{' '}
              <span className="text-sm font-medium text-muted-foreground tabular-nums">
                ({totalRooms} phòng)
              </span>
            </h2>
          </div>

          {isLoadingRooms && (
            <div
              className="grid gap-3 rounded-xl border bg-card p-4"
              data-testid="admin-loading-state"
              aria-busy="true"
            >
              <p className="text-sm text-muted-foreground">Đang tải danh sách phòng...</p>
              {[0, 1, 2].map((row) => (
                <div key={row} className="flex items-center gap-4">
                  <Skeleton className="h-11 w-16 rounded-md" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="hidden h-4 w-24 sm:block" />
                  <Skeleton className="h-8 w-16 rounded-md" />
                </div>
              ))}
            </div>
          )}

          {!isLoadingRooms && loadError && (
            <ErrorState title={loadError} onRetry={() => fetchRooms(currentPage)} />
          )}

          {showRoomList && rooms.length === 0 && (
            <EmptyState
              icon={DoorOpen}
              title="Chưa có phòng nào"
              description='Hệ thống hiện tại chưa có phòng nào. Nhấn vào nút "+ Thêm phòng mới" ở trên để tạo phòng đầu tiên.'
              data-testid="admin-empty-state"
            />
          )}

          {showRoomList && rooms.length > 0 && (
            <RoomTable
              rooms={rooms}
              loadingRoomId={loadingDetailId}
              activeRoomId={isFormOpen ? editingRoomId : null}
              onEdit={handleOpenEdit}
            />
          )}

          {showRoomList && totalPages > 1 && (
            <Pagination
              page={currentPage}
              totalPages={totalPages}
              onPageChange={(page) => setCurrentPage(Math.min(totalPages, Math.max(1, page)))}
              testId="admin-pagination"
            />
          )}
        </section>

        {/* Shared inline create / edit form */}
        {isFormOpen && (
          <RoomForm
            isEditing={Boolean(editingRoomId)}
            headingRef={formHeadingRef}
            values={formData}
            errors={formErrors}
            isSubmitting={isSubmitting}
            isUploadingImages={isUploadingImages}
            isConfirmingMaintenance={isConfirmingMaintenance}
            amenities={availableAmenities}
            isLoadingAmenities={isLoadingAmenities}
            amenitiesError={amenitiesError}
            pendingImageFiles={pendingImageFiles}
            imageUploadError={imageUploadError}
            futureBookingWarning={futureBookingWarning}
            onClose={handleCloseForm}
            onSubmit={handleSubmit}
            onInputChange={handleInputChange}
            onStatusChange={handleStatusChange}
            onAmenityToggle={handleAmenityToggle}
            onRetryAmenities={fetchAmenities}
            onAddImage={handleAddImage}
            onRemoveImage={handleRemoveImage}
            onSetPrimaryImage={handleSetPrimaryImage}
            onImageUrlChange={handleImageUrlChange}
            onFileSelect={handleFileSelect}
            onRemovePendingFile={handleRemovePendingFile}
            onDismissWarning={handleDismissWarning}
            onConfirmMaintenance={handleConfirmMaintenance}
          />
        )}
      </div>
    </div>
  );
};
