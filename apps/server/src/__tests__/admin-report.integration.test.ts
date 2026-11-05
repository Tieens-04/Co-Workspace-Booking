import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import {
  BookingStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  Role,
  RoomStatus,
} from '@prisma/client';
import app from '../app.js';
import prisma from '../utils/prisma.util.js';
import { TestAccounts } from './support/test-accounts.js';

const BOM = String.fromCharCode(0xfeff);

describe('Admin CSV exports (CWB-69, real MySQL)', () => {
  const accounts = new TestAccounts();
  beforeAll(() => accounts.persist());
  afterAll(() => accounts.cleanup());

  const tag = randomUUID().slice(0, 8);
  const adminToken = accounts.token(Role.ADMIN, `admin-${tag}`);
  const customerToken = accounts.token(Role.CUSTOMER, `customer-${tag}`);
  let roomId: string;
  let otherRoomId: string;
  // 2031-03-10 in Vietnam; 23:30 VN on the 9th is 16:30Z and must belong to the 9th.
  const day = '2031-03-10';

  const get = (path: string, token = adminToken) =>
    request(app).get(path).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const [room, other] = await Promise.all(
      ['Phòng Báo cáo', 'Phòng Khác'].map((name) =>
        prisma.room.create({
          data: {
            name: `${name} ${tag}`,
            capacity: 4,
            pricePerHour: new Prisma.Decimal('100000.00'),
            status: RoomStatus.AVAILABLE,
          },
        }),
      ),
    );
    roomId = room.id;
    otherRoomId = other.id;
    const booking = (
      code: string,
      start: string,
      paymentStatus: PaymentStatus,
      status: BookingStatus,
      amount: string,
      guestName: string,
      targetRoom = roomId,
    ) => ({
      bookingCode: `CS-${tag}-${code}`,
      roomId: targetRoom,
      startTime: new Date(start),
      endTime: new Date(new Date(start).getTime() + 2 * 3_600_000),
      totalAmount: new Prisma.Decimal(amount),
      status,
      paymentStatus,
      paymentMethod: paymentStatus === PaymentStatus.PAID ? PaymentMethod.CASH : null,
      attendanceTrackingEnabled: false,
      guestName,
      guestPhone: '0900000000',
    });
    await prisma.booking.createMany({
      data: [
        booking(
          'A',
          '2031-03-10T02:00:00Z',
          PaymentStatus.PAID,
          BookingStatus.COMPLETED,
          '200000.00',
          'Nguyễn Văn A',
        ),
        booking(
          'B',
          '2031-03-10T05:00:00Z',
          PaymentStatus.UNPAID,
          BookingStatus.CONFIRMED,
          '150000.00',
          '=cmd|calc',
        ),
        booking(
          'C',
          '2031-03-10T07:00:00Z',
          PaymentStatus.UNPAID,
          BookingStatus.CANCELLED,
          '90000.00',
          'Hủy, không thu',
        ),
        booking(
          'D',
          '2031-03-09T16:30:00Z',
          PaymentStatus.PAID,
          BookingStatus.COMPLETED,
          '50000.00',
          'Đêm hôm trước',
        ),
        booking(
          'E',
          '2031-03-10T03:00:00Z',
          PaymentStatus.PAID,
          BookingStatus.COMPLETED,
          '70000.00',
          'Phòng khác',
          otherRoomId,
        ),
      ],
    });
  });

  afterAll(async () => {
    await prisma.booking.deleteMany({ where: { bookingCode: { startsWith: `CS-${tag}-` } } });
    await prisma.room.deleteMany({ where: { id: { in: [roomId, otherRoomId] } } });
  });

  it('requires ADMIN', async () => {
    const path = `/api/v1/admin/reports/bookings.csv?startDate=${day}&endDate=${day}`;
    expect((await request(app).get(path)).status).toBe(401);
    expect((await get(path, customerToken)).status).toBe(403);
  });

  it.each([
    ['missing period', ''],
    ['end before start', '?startDate=2031-03-10&endDate=2031-03-01'],
    ['over 92 days', '?startDate=2031-01-01&endDate=2031-04-30'],
    ['invalid date', '?startDate=2031-02-30&endDate=2031-03-01'],
    ['unknown filter', `?startDate=${day}&endDate=${day}&sort=asc`],
  ])('rejects %s with 400', async (_label, query) => {
    const res = await get(`/api/v1/admin/reports/bookings.csv${query}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('exports bookings for the Vietnam day with escaping and filters', async () => {
    const res = await get(
      `/api/v1/admin/reports/bookings.csv?startDate=${day}&endDate=${day}&roomId=${roomId}`,
    );

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/csv; charset=utf-8/);
    expect(res.headers['content-disposition']).toContain(`bookings_${day}_${day}.csv`);
    expect(res.text.startsWith(BOM)).toBe(true);
    const lines = res.text.replace(BOM, '').trim().split('\r\n');
    expect(lines[0]).toContain('Mã đặt phòng');
    expect(lines).toHaveLength(4); // header + A, B, C (D is the previous VN day, E another room)
    expect(res.text).toContain(
      `CS-${tag}-A,Phòng Báo cáo ${tag},Nguyễn Văn A,Vãng lai,2031-03-10 09:00`,
    );
    expect(res.text).toContain(`'=cmd|calc`);
    expect(res.text).toContain('"Hủy, không thu"');
    expect(res.text).not.toContain(`CS-${tag}-D`);
    expect(res.text).not.toContain(`CS-${tag}-E`);

    const paidOnly = await get(
      `/api/v1/admin/reports/bookings.csv?startDate=${day}&endDate=${day}&roomId=${roomId}&paymentStatus=PAID`,
    );
    expect(paidOnly.text).toContain(`CS-${tag}-A`);
    expect(paidOnly.text).not.toContain(`CS-${tag}-B`);
  });

  it('exports daily revenue with the paid-only actual revenue rule', async () => {
    const res = await get(
      `/api/v1/admin/reports/revenue.csv?startDate=2031-03-09&endDate=${day}&roomId=${roomId}`,
    );

    expect(res.status).toBe(200);
    const lines = res.text.replace(BOM, '').trim().split('\r\n');
    expect(lines[1]).toBe('2031-03-09,1,1,0,0,50000.00,0.00,50000.00');
    // A paid 200k; B unpaid 150k; C cancelled+unpaid contributes nothing.
    expect(lines[2]).toBe('2031-03-10,3,1,1,1,200000.00,150000.00,350000.00');
    expect(lines[3]).toBe('Tổng,4,2,1,1,250000.00,150000.00,400000.00');
  });
});
