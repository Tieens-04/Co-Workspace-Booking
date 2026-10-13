import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../utils/response.util.js';
import { HealthService } from '../services/health.service.js';

export class HealthController {
  public static checkLiveness(_req: Request, res: Response) {
    const livenessData = HealthService.getLiveness();
    return sendSuccess(res, livenessData, 'API Server đang hoạt động tốt');
  }

  public static async checkHealth(_req: Request, res: Response) {
    const readinessData = await HealthService.getReadiness();
    if (readinessData.status === 'OK') {
      return sendSuccess(res, readinessData, 'API Server đang hoạt động tốt', 200);
    }
    return sendError(
      res,
      'SERVICE_UNAVAILABLE',
      'API Server đang hoạt động ở chế độ suy giảm (Database mất kết nối)',
      503,
      readinessData,
    );
  }
}
