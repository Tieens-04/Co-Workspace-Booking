import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { sendError } from '../utils/response.util.js';

export const getClientRateLimitKey = (req: Request): string => {
  if (req.headers['x-forwarded-for']) {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return ip.trim();
  }
  return req.ip || req.socket.remoteAddress || '127.0.0.1';
};

/**
 * Rate limiter for login endpoint to prevent brute-force attacks.
 * Conforms to CWB-33 Acceptance Criteria:
 * - Rate limit blocks after 10 consecutive failed logins.
 * - Successful logins (status < 400) are not counted (skipSuccessfulRequests = true).
 * - Window: 15 minutes.
 */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Max 10 consecutive failed attempts per window
  skipSuccessfulRequests: true, // Only count failed requests (status >= 400)
  standardHeaders: true, // Return RateLimit-* headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  keyGenerator: (req) => getClientRateLimitKey(req),
  handler: (_req, res) => {
    return sendError(
      res,
      'TOO_MANY_REQUESTS',
      'Quá nhiều lần đăng nhập không thành công. Vui lòng thử lại sau 15 phút.',
      429,
    );
  },
});

/**
 * Middleware that resets the consecutive failed attempt counter for the client
 * when a login request succeeds (2xx), guaranteeing the "10 consecutive failed" invariant.
 */
export const resetLoginRateLimitOnSuccess = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  res.on('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      const key = getClientRateLimitKey(req);
      loginRateLimiter.resetKey(key);
    }
  });
  next();
};
