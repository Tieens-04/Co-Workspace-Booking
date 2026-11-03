import { Request, Response, NextFunction } from 'express';
import { adminBookingService, AdminBookingService } from '../services/admin-booking.service.js';
import { sendSuccess } from '../utils/response.util.js';
import { auditActorOf } from '../utils/audit-actor.util.js';
import { parseIdempotencyKey } from '../utils/idempotency.util.js';
import {
  GetAdminBookingsQueryInput,
  CreateGuestBookingInput,
  ConfirmPaymentParamsInput,
  ConfirmPaymentBodyInput,
  AdminCancelBookingParamsInput,
  AdminCancelBookingBodyInput,
  CompleteBookingParamsInput,
  CheckInBookingParamsInput,
  MarkNoShowParamsInput,
  GetRevenueQueryInput,
} from '../validators/admin-booking.validator.js';

export class AdminBookingController {
  constructor(private readonly service: AdminBookingService = adminBookingService) {}

  getBookings = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as unknown as GetAdminBookingsQueryInput;
      const data = await this.service.getBookings(query);
      return sendSuccess(res, data, 'Lấy danh sách đặt phòng thành công', 200);
    } catch (err) {
      return next(err);
    }
  };

  createGuestBooking = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as CreateGuestBookingInput;
      const key = parseIdempotencyKey(req.get('Idempotency-Key'));
      const { idempotentReplay, ...data } = await this.service.createGuestBooking(
        body,
        new Date(),
        key ? { adminId: req.user!.sub, idempotencyKey: key } : undefined,
        auditActorOf(req),
      );
      if (idempotentReplay) res.setHeader('Idempotent-Replayed', 'true');
      return sendSuccess(
        res,
        data,
        'Đặt phòng cho khách vãng lai thành công',
        idempotentReplay ? 200 : 201,
      );
    } catch (err) {
      return next(err);
    }
  };

  confirmPayment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params as unknown as ConfirmPaymentParamsInput;
      const { paymentMethod } = req.body as ConfirmPaymentBodyInput;
      const data = await this.service.confirmPayment(id, paymentMethod, auditActorOf(req));
      return sendSuccess(res, data, 'Xác nhận thanh toán thành công', 200);
    } catch (err) {
      return next(err);
    }
  };

  cancelBooking = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params as unknown as AdminCancelBookingParamsInput;
      const { reason } = req.body as AdminCancelBookingBodyInput;
      const data = await this.service.cancelBooking(id, reason, auditActorOf(req));
      return sendSuccess(res, data, 'Hủy đơn đặt phòng thành công', 200);
    } catch (err) {
      return next(err);
    }
  };

  checkInBooking = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params as unknown as CheckInBookingParamsInput;
      const data = await this.service.checkInBooking(id, auditActorOf(req));
      return sendSuccess(res, data, 'Check-in thành công', 200);
    } catch (err) {
      return next(err);
    }
  };

  completeBooking = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params as unknown as CompleteBookingParamsInput;
      const data = await this.service.completeBooking(id, auditActorOf(req));
      return sendSuccess(res, data, 'Hoàn tất đơn đặt phòng thành công', 200);
    } catch (err) {
      return next(err);
    }
  };

  markNoShow = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params as unknown as MarkNoShowParamsInput;
      const data = await this.service.markNoShow(id, auditActorOf(req));
      return sendSuccess(res, data, 'Đánh dấu khách không đến thành công', 200);
    } catch (err) {
      return next(err);
    }
  };

  getRevenue = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as unknown as GetRevenueQueryInput;
      const data = await this.service.getRevenue(query);
      return sendSuccess(res, data, 'Lấy báo cáo doanh thu thành công', 200);
    } catch (err) {
      return next(err);
    }
  };
}

export const adminBookingController = new AdminBookingController();
