import { Request, Response, NextFunction } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { sendError } from '../utils/response.util.js';

export const getClientRateLimitKey = (req: Request): string => {
  // Express resolves the client through the explicitly configured proxy boundary.
  // Group IPv6 clients by /56 so rotating addresses cannot bypass the limit.
  return ipKeyGenerator(req.ip || req.socket.remoteAddress || '127.0.0.1', 56);
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

/**
 * Brute-force guard for POST /me/password: 5 failed attempts (wrong current password) per
 * authenticated account per 15 minutes. Keyed by verified user id so one account cannot be
 * hammered from many IPs; validation errors return before this limiter and are not counted.
 */
export const changePasswordRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `user:${req.user?.sub ?? getClientRateLimitKey(req)}`,
  handler: (_req, res) => {
    return sendError(
      res,
      'TOO_MANY_REQUESTS',
      'Quá nhiều lần nhập sai mật khẩu hiện tại. Vui lòng thử lại sau 15 phút.',
      429,
    );
  },
});

const tooManyAttempts = (message: string) => (_req: Request, res: Response) =>
  sendError(res, 'TOO_MANY_REQUESTS', message, 429);

/** Every forgot-password request counts (responses are always 200): 5 per IP per 15 minutes. */
export const forgotPasswordRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientRateLimitKey(req),
  handler: tooManyAttempts('Quá nhiều yêu cầu đặt lại mật khẩu. Vui lòng thử lại sau 15 phút.'),
});

/** Failed reset attempts (invalid/expired token): 10 per IP per 15 minutes. */
export const resetPasswordRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientRateLimitKey(req),
  handler: tooManyAttempts(
    'Quá nhiều lần đặt lại mật khẩu không thành công. Vui lòng thử lại sau.',
  ),
});

/** Failed verify attempts (invalid/expired token): 10 per IP per 15 minutes. */
export const verifyEmailRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientRateLimitKey(req),
  handler: tooManyAttempts(
    'Quá nhiều lần xác thực email không thành công. Vui lòng thử lại sau.',
  ),
});

/** Resend verification email: 5 requests per user per 15 minutes. Keyed by verified user id. */
export const resendVerificationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `user:${req.user?.sub ?? getClientRateLimitKey(req)}`,
  handler: tooManyAttempts(
    'Quá nhiều yêu cầu gửi lại email xác thực. Vui lòng thử lại sau 15 phút.',
  ),
});

/**
 * CWB-78: account creation is free, so every POST /auth/register request counts:
 * 10 per IP per hour. Placed before validation so malformed scripted requests count too.
 */
export const registerRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientRateLimitKey(req),
  handler: tooManyAttempts(
    'Quá nhiều yêu cầu đăng ký từ mạng của bạn. Vui lòng thử lại sau 1 giờ.',
  ),
});

/**
 * CWB-78: bookings are UNPAID until the counter, so POST /bookings is throttled per verified
 * account (not IP, so customers behind one NAT do not block each other): every request counts,
 * 20 per user per 15 minutes. Mounted after verifyToken, before validation.
 */
export const createBookingRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `user:${req.user?.sub ?? getClientRateLimitKey(req)}`,
  handler: tooManyAttempts('Bạn gửi quá nhiều yêu cầu đặt phòng. Vui lòng thử lại sau 15 phút.'),
});
