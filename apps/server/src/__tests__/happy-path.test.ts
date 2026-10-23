import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { Role, BookingStatus, PaymentStatus, RoomStatus, Prisma } from '@prisma/client';
import app from '../app.js';
import { userRepository } from '../repositories/user.repository.js';
import { roomRepository } from '../repositories/room.repository.js';
import { bookingRepository } from '../repositories/booking.repository.js';
import { hashPassword } from '../utils/password.util.js';
import { BookingResponseDto } from '../types/booking.type.js';
import { AdminBookingResponseDto } from '../types/admin-booking.type.js';

// Prevent real DB access during unit tests
vi.mock('../utils/prisma.util.js', () => ({ default: {}, prisma: {} }));

// Helper to convert internal record to customer DTO
function toCustomerDto(record: any): BookingResponseDto {
  return {
    id: record.id,
    bookingCode: record.bookingCode,
    room: record.room,
    startTime: record.startTime,
    endTime: record.endTime,
    totalAmount: record.totalAmount,
    note: record.note,
    status: record.status,
    paymentStatus: record.paymentStatus,
    paymentMethod: record.paymentMethod,
    checkedInAt: record.checkedInAt ?? null,
    attendanceTrackingEnabled: record.attendanceTrackingEnabled ?? false,
    cancellationReason: record.cancellationReason ?? null,
  };
}

// Helper to convert internal record to admin DTO
function toAdminDto(record: any): AdminBookingResponseDto {
  return {
    id: record.id,
    bookingCode: record.bookingCode,
    room: record.room,
    startTime: record.startTime,
    endTime: record.endTime,
    totalAmount: record.totalAmount,
    note: record.note,
    status: record.status,
    paymentStatus: record.paymentStatus,
    paymentMethod: record.paymentMethod,
    checkedInAt: record.checkedInAt ?? null,
    attendanceTrackingEnabled: record.attendanceTrackingEnabled ?? false,
    customer: record.customer,
  };
}

// Generate future aligned time slot dynamically
function getFutureSlotIso(daysInAdvance = 7, durationHours = 2) {
  const start = new Date(Date.now() + daysInAdvance * 24 * 60 * 60 * 1000);
  start.setMinutes(0, 0, 0); // 30-min alignment
  const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
  return {
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    dateStr: start.toISOString().slice(0, 10),
  };
}

describe('Customer & Admin End-to-End Happy Path Regression Suite (CWB-34)', () => {
  let mockUsers: Map<string, any>;
  let mockBookings: Map<string, any>;
  const sampleRoomId = '11111111-1111-4111-8111-111111111111';

  beforeEach(async () => {
    vi.restoreAllMocks();
    mockUsers = new Map();
    mockBookings = new Map();

    // Seed admin user
    const adminPasswordHash = await hashPassword('AdminPass123!');
    const adminUser = {
      id: randomUUID(),
      email: 'admin@co-space.local',
      fullName: 'Quản Trị Viên',
      phoneNumber: '0901234567',
      role: Role.ADMIN,
      passwordHash: adminPasswordHash,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockUsers.set(adminUser.email, adminUser);

    // Wire up in-memory userRepository
    vi.spyOn(userRepository, 'findByEmail').mockImplementation(async (email) => {
      return mockUsers.get(email.toLowerCase().trim()) || null;
    });

    vi.spyOn(userRepository, 'create').mockImplementation(async (data) => {
      const created = {
        id: randomUUID(),
        email: data.email.toLowerCase().trim(),
        fullName: data.fullName,
        phoneNumber: data.phoneNumber || null,
        role: data.role || Role.CUSTOMER,
        passwordHash: data.passwordHash,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockUsers.set(created.email, created);
      return created as any;
    });

    vi.spyOn(userRepository, 'findById').mockImplementation(async (id) => {
      return Array.from(mockUsers.values()).find((u) => u.id === id) || null;
    });

    // Wire up roomRepository
    vi.spyOn(roomRepository, 'findManyAndCount').mockResolvedValue([
      1,
      [
        {
          id: sampleRoomId,
          name: 'Executive Boardroom',
          capacity: 8,
          pricePerHour: new Prisma.Decimal('200000.00'),
          status: RoomStatus.AVAILABLE,
          createdAt: new Date(),
          images: [{ id: 'img-1', imageUrl: 'https://images.example.com/boardroom.jpg', isPrimary: true, createdAt: new Date() }],
          amenities: [{ amenity: { id: 'amenity-1', name: 'Wifi tốc độ cao', icon: 'wifi', description: 'High speed wifi' } }],
        } as any,
      ],
    ]);

    vi.spyOn(roomRepository, 'findById').mockResolvedValue({
      id: sampleRoomId,
      name: 'Executive Boardroom',
      description: 'Phòng họp cao cấp đầy đủ tiện nghi',
      capacity: 8,
      pricePerHour: new Prisma.Decimal('200000.00'),
      status: RoomStatus.AVAILABLE,
      images: [{ id: 'img-1', imageUrl: 'https://images.example.com/boardroom.jpg', isPrimary: true, createdAt: new Date() }],
      amenities: [{ amenity: { id: 'amenity-1', name: 'Wifi tốc độ cao', icon: 'wifi', description: 'High speed wifi' } }],
    } as any);

    vi.spyOn(roomRepository, 'findAvailabilityById').mockResolvedValue({
      id: sampleRoomId,
      status: RoomStatus.AVAILABLE,
      bookings: [],
    });

    // Wire up bookingRepository
    vi.spyOn(bookingRepository, 'evaluateNoShowBookings').mockResolvedValue(0);

    vi.spyOn(bookingRepository, 'createBooking').mockImplementation(async (data) => {
      const user = data.userId ? Array.from(mockUsers.values()).find((u) => u.id === data.userId) : null;
      const bookingId = randomUUID();
      const code = data.bookingCode;
      const hours = data.durationMinutes / 60;
      const totalAmount = (hours * 200000).toFixed(2);

      const record: any = {
        id: bookingId,
        bookingCode: code,
        userId: data.userId ?? null,
        guestName: data.guestName ?? null,
        guestPhone: data.guestPhone ?? null,
        roomId: data.roomId,
        startTime: data.startDate,
        endTime: data.endDate,
        totalAmount,
        note: data.note || null,
        status: BookingStatus.CONFIRMED,
        paymentStatus: PaymentStatus.UNPAID,
        paymentMethod: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        room: { id: data.roomId, name: 'Executive Boardroom' },
        customer: data.userId
          ? { kind: 'USER', name: user?.fullName || 'Khách', email: user?.email, phone: user?.phoneNumber, id: data.userId }
          : { kind: 'GUEST', name: data.guestName, phone: data.guestPhone },
      };

      mockBookings.set(bookingId, record);
      return toCustomerDto(record);
    });

    vi.spyOn(bookingRepository, 'findManyAndCountForUser').mockImplementation(async (userId) => {
      const list = Array.from(mockBookings.values()).filter((bookingRecord) => bookingRecord.userId === userId);
      const items = list.map(toCustomerDto);
      return [items.length, items];
    });

    vi.spyOn(bookingRepository, 'findByIdForUser').mockImplementation(async (userId, id) => {
      const bookingRecord = mockBookings.get(id);
      if (!bookingRecord || bookingRecord.userId !== userId) return null;
      return toCustomerDto(bookingRecord);
    });

    vi.spyOn(bookingRepository, 'findManyAndCountForAdmin').mockImplementation(async (filter) => {
      let list = Array.from(mockBookings.values());
      if (filter.bookingCode) {
        list = list.filter((bookingRecord) => bookingRecord.bookingCode.includes(filter.bookingCode!));
      }
      const items = list.map(toAdminDto);
      return [items.length, items];
    });

    vi.spyOn(bookingRepository, 'confirmPaymentForAdmin').mockImplementation(async (id, method) => {
      const bookingRecord = mockBookings.get(id);
      if (!bookingRecord) throw new Error('Not found');
      bookingRecord.paymentStatus = PaymentStatus.PAID;
      bookingRecord.paymentMethod = method;
      return toAdminDto(bookingRecord);
    });

    vi.spyOn(bookingRepository, 'completeBookingForAdmin').mockImplementation(async (id) => {
      const bookingRecord = mockBookings.get(id);
      if (!bookingRecord) throw new Error('Not found');
      bookingRecord.status = BookingStatus.COMPLETED;
      return toAdminDto(bookingRecord);
    });

    vi.spyOn(bookingRepository, 'cancelBooking').mockImplementation(async (userId, id) => {
      const bookingRecord = mockBookings.get(id);
      if (!bookingRecord || bookingRecord.userId !== userId) throw new Error('Not found');
      bookingRecord.status = BookingStatus.CANCELLED;
      return toCustomerDto(bookingRecord);
    });
  });

  it('Customer & Admin Full Happy Path: Register -> Login -> Browse -> Book -> View History -> Admin Payment -> Complete', async () => {
    // -------------------------------------------------------------
    // STEP 1: Customer Registration
    // -------------------------------------------------------------
    const customerRegisterRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        fullName: 'Nguyễn Văn Khách',
        email: 'khachhang@example.com',
        password: 'Password123!',
        phoneNumber: '0912345678',
      });

    expect(customerRegisterRes.status).toBe(201);
    expect(customerRegisterRes.body.success).toBe(true);
    expect(customerRegisterRes.body.data.email).toBe('khachhang@example.com');
    expect(customerRegisterRes.body.data.role).toBe('CUSTOMER');
    expect(customerRegisterRes.body.data.passwordHash).toBeUndefined();

    // -------------------------------------------------------------
    // STEP 2: Customer Login
    // -------------------------------------------------------------
    const customerLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'khachhang@example.com',
        password: 'Password123!',
      });

    expect(customerLoginRes.status).toBe(200);
    expect(customerLoginRes.body.success).toBe(true);
    const customerToken = customerLoginRes.body.data.accessToken;
    expect(customerToken).toBeDefined();

    // -------------------------------------------------------------
    // STEP 3: Room Discovery (Browse catalog)
    // -------------------------------------------------------------
    const browseRes = await request(app)
      .get('/api/v1/rooms?capacity=4');

    expect(browseRes.status).toBe(200);
    expect(browseRes.body.success).toBe(true);
    expect(browseRes.body.data.items.length).toBeGreaterThan(0);
    const selectedRoom = browseRes.body.data.items[0];
    expect(selectedRoom.id).toBe(sampleRoomId);
    expect(selectedRoom.status).toBe('AVAILABLE');

    // -------------------------------------------------------------
    // STEP 4: Room Detail & 30-min Availability Matrix
    // -------------------------------------------------------------
    const detailRes = await request(app)
      .get(`/api/v1/rooms/${selectedRoom.id}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.id).toBe(selectedRoom.id);

    const slot = getFutureSlotIso(5, 2);

    const availabilityRes = await request(app)
      .get(`/api/v1/rooms/${selectedRoom.id}/availability?date=${slot.dateStr}`);
    expect(availabilityRes.status).toBe(200);
    expect(availabilityRes.body.data.slots.length).toBeGreaterThan(0);

    // -------------------------------------------------------------
    // STEP 5: Customer Creates Booking (2 hours slot)
    // -------------------------------------------------------------
    const bookingPayload = {
      roomId: selectedRoom.id,
      startTime: slot.startTime,
      endTime: slot.endTime,
      note: 'Yêu cầu bảng viết và nước uống',
    };

    const createBookingRes = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send(bookingPayload);

    expect(createBookingRes.status).toBe(201);
    expect(createBookingRes.body.success).toBe(true);
    const createdBooking = createBookingRes.body.data;
    expect(createdBooking.bookingCode).toMatch(/^CS-\d{8}-[A-Z0-9]{4}$/);
    expect(createdBooking.status).toBe('CONFIRMED');
    expect(createdBooking.paymentStatus).toBe('UNPAID');
    expect(createdBooking.totalAmount).toBe('400000.00'); // 2h * 200,000 VND

    // -------------------------------------------------------------
    // STEP 6: Customer Views Booking History and Detail
    // -------------------------------------------------------------
    const customerHistoryRes = await request(app)
      .get('/api/v1/bookings')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(customerHistoryRes.status).toBe(200);
    expect(customerHistoryRes.body.data.items).toHaveLength(1);
    expect(customerHistoryRes.body.data.items[0].id).toBe(createdBooking.id);

    const customerDetailRes = await request(app)
      .get(`/api/v1/bookings/${createdBooking.id}`)
      .set('Authorization', `Bearer ${customerToken}`);

    expect(customerDetailRes.status).toBe(200);
    expect(customerDetailRes.body.data.bookingCode).toBe(createdBooking.bookingCode);
    expect(customerDetailRes.body.data.totalAmount).toBe('400000.00');

    // -------------------------------------------------------------
    // STEP 7: Admin Login
    // -------------------------------------------------------------
    const adminLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'admin@co-space.local',
        password: 'AdminPass123!',
      });

    expect(adminLoginRes.status).toBe(200);
    expect(adminLoginRes.body.data.user.role).toBe('ADMIN');
    const adminToken = adminLoginRes.body.data.accessToken;

    // -------------------------------------------------------------
    // STEP 8: Admin Finds Customer Booking
    // -------------------------------------------------------------
    const adminSearchRes = await request(app)
      .get(`/api/v1/admin/bookings?bookingCode=${createdBooking.bookingCode}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(adminSearchRes.status).toBe(200);
    expect(adminSearchRes.body.data.items).toHaveLength(1);
    expect(adminSearchRes.body.data.items[0].id).toBe(createdBooking.id);
    expect(adminSearchRes.body.data.items[0].paymentStatus).toBe('UNPAID');

    // -------------------------------------------------------------
    // STEP 9: Admin Confirms Counter Payment (CASH)
    // -------------------------------------------------------------
    const confirmPaymentRes = await request(app)
      .patch(`/api/v1/admin/bookings/${createdBooking.id}/payment`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ paymentMethod: 'CASH' });

    expect(confirmPaymentRes.status).toBe(200);
    expect(confirmPaymentRes.body.success).toBe(true);
    expect(confirmPaymentRes.body.data.paymentStatus).toBe('PAID');
    expect(confirmPaymentRes.body.data.paymentMethod).toBe('CASH');

    // -------------------------------------------------------------
    // STEP 10: Admin Completes Shift
    // -------------------------------------------------------------
    const completeShiftRes = await request(app)
      .patch(`/api/v1/admin/bookings/${createdBooking.id}/complete`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(completeShiftRes.status).toBe(200);
    expect(completeShiftRes.body.success).toBe(true);
    expect(completeShiftRes.body.data.status).toBe('COMPLETED');

    // -------------------------------------------------------------
    // STEP 11: Final State Verification across Admin System
    // -------------------------------------------------------------
    const finalBookingRes = await request(app)
      .get(`/api/v1/admin/bookings?bookingCode=${createdBooking.bookingCode}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(finalBookingRes.status).toBe(200);
    expect(finalBookingRes.body.data.items).toHaveLength(1);
    expect(finalBookingRes.body.data.items[0].status).toBe('COMPLETED');
    expect(finalBookingRes.body.data.items[0].paymentStatus).toBe('PAID');
    expect(finalBookingRes.body.data.items[0].paymentMethod).toBe('CASH');
  });

  it('Customer Self-Cancellation Happy Path (> 1 hour in advance)', async () => {
    // 1. Register & Login
    const regRes = await request(app).post('/api/v1/auth/register').send({
      fullName: 'Khách Tự Hủy',
      email: 'canceller@example.com',
      password: 'Password123!',
      phoneNumber: '0933333333',
    });
    expect(regRes.status).toBe(201);

    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: 'canceller@example.com',
      password: 'Password123!',
    });
    const token = loginRes.body.data.accessToken;

    // 2. Create Booking dynamically in future
    const cancelSlot = getFutureSlotIso(8, 2);
    const bookRes = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        roomId: sampleRoomId,
        startTime: cancelSlot.startTime,
        endTime: cancelSlot.endTime,
      });
    expect(bookRes.status).toBe(201);
    const bookingId = bookRes.body.data.id;

    // 3. Customer Cancels
    const cancelRes = await request(app)
      .patch(`/api/v1/bookings/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${token}`);

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.success).toBe(true);
    expect(cancelRes.body.data.status).toBe('CANCELLED');
  });

  it('Admin Walk-in Guest Booking & Payment Happy Path', async () => {
    // 1. Admin Login
    const adminLoginRes = await request(app).post('/api/v1/auth/login').send({
      email: 'admin@co-space.local',
      password: 'AdminPass123!',
    });
    const adminToken = adminLoginRes.body.data.accessToken;

    // 2. Admin creates Walk-in Guest Booking
    const guestSlot = getFutureSlotIso(9, 2);
    const guestBookingRes = await request(app)
      .post('/api/v1/admin/bookings/guest')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roomId: sampleRoomId,
        startTime: guestSlot.startTime,
        endTime: guestSlot.endTime,
        guestName: 'Nguyễn Văn Khách Vãng Lai',
        guestPhone: '0988776655',
        note: 'Khách đến trực tiếp tại quầy',
      });

    expect(guestBookingRes.status).toBe(201);
    expect(guestBookingRes.body.success).toBe(true);
    const guestBooking = guestBookingRes.body.data;
    expect(guestBooking.customer.kind).toBe('GUEST');
    expect(guestBooking.customer.name).toBe('Nguyễn Văn Khách Vãng Lai');
    expect(guestBooking.paymentStatus).toBe('UNPAID');

    // 3. Admin confirms payment via QR
    const payRes = await request(app)
      .patch(`/api/v1/admin/bookings/${guestBooking.id}/payment`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ paymentMethod: 'QR' });

    expect(payRes.status).toBe(200);
    expect(payRes.body.data.paymentStatus).toBe('PAID');
    expect(payRes.body.data.paymentMethod).toBe('QR');

    // 4. Admin marks completion
    const completeRes = await request(app)
      .patch(`/api/v1/admin/bookings/${guestBooking.id}/complete`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(completeRes.status).toBe(200);
    expect(completeRes.body.data.status).toBe('COMPLETED');
  });
});
