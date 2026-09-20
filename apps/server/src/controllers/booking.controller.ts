import { Request, Response, NextFunction } from 'express';
import { bookingService, BookingService } from '../services/booking.service.js';
import { sendSuccess } from '../utils/response.util.js';
import { CreateBookingInput } from '../validators/booking.validator.js';

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
}

export const bookingController = new BookingController();
