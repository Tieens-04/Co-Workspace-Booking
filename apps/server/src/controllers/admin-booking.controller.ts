import { Request, Response, NextFunction } from 'express';
import { adminBookingService, AdminBookingService } from '../services/admin-booking.service.js';
import { sendSuccess } from '../utils/response.util.js';
import {
  GetAdminBookingsQueryInput,
  CreateGuestBookingInput,
  ConfirmPaymentParamsInput,
  ConfirmPaymentBodyInput,
  AdminCancelBookingParamsInput,
  AdminCancelBookingBodyInput,
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
      const data = await this.service.createGuestBooking(body);
      return sendSuccess(res, data, 'Đặt phòng cho khách vãng lai thành công', 201);
    } catch (err) {
      return next(err);
    }
  };

  confirmPayment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params as unknown as ConfirmPaymentParamsInput;
      const { paymentMethod } = req.body as ConfirmPaymentBodyInput;
      const data = await this.service.confirmPayment(id, paymentMethod);
      return sendSuccess(res, data, 'Xác nhận thanh toán thành công', 200);
    } catch (err) {
      return next(err);
    }
  };

  cancelBooking = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params as unknown as AdminCancelBookingParamsInput;
      const { reason } = req.body as AdminCancelBookingBodyInput;
      const data = await this.service.cancelBooking(id, reason);
      return sendSuccess(res, data, 'Hủy đơn đặt phòng thành công', 200);
    } catch (err) {
      return next(err);
    }
  };
}

export const adminBookingController = new AdminBookingController();
