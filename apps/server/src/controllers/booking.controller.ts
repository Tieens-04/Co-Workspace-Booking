import { Request, Response, NextFunction } from 'express';
import { bookingService, BookingService } from '../services/booking.service.js';
import { sendSuccess } from '../utils/response.util.js';
import { CreateBookingInput, GetBookingsQueryInput } from '../validators/booking.validator.js';

export class BookingController {
  constructor(private readonly service: BookingService = bookingService) {}

  createBooking = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.sub;
      const body = req.body as CreateBookingInput;
      const result = await this.service.createBooking(userId, body);
      return sendSuccess(res, result, 'Đặt phòng thành công', 201);
    } catch (err) {
      return next(err);
    }
  };

  getBookings = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.sub;
      const query = req.query as unknown as GetBookingsQueryInput;
      const result = await this.service.getBookings(userId, query);
      return sendSuccess(res, result, 'Lấy danh sách đặt phòng thành công', 200);
    } catch (err) {
      return next(err);
    }
  };

  getBookingById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.sub;
      const { id } = req.params;
      const result = await this.service.getBookingById(userId, id);
      return sendSuccess(res, result, 'Lấy chi tiết đặt phòng thành công', 200);
    } catch (err) {
      return next(err);
    }
  };
}

export const bookingController = new BookingController();
