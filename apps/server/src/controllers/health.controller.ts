import { Request, Response } from 'express';
import { sendSuccess } from '../utils/response.util.js';

export class HealthController {
  public static checkHealth(_req: Request, res: Response) {
    const healthData = {
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: 'Co-Space Working API',
    };
    return sendSuccess(res, healthData, 'API Server đang hoạt động tốt');
  }
}
