import { Request, Response, NextFunction } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { sendError } from '../utils/response.util.js';

export const getClientRateLimitKey = (req: Request): string => {
  // Express resolves the client through the explicitly configured proxy boundary.
  // Group IPv6 clients by /56 so rotating addresses cannot bypass the limit.
  return ipKeyGenerator(req.ip || req.socket.remoteAddress || '127.0.0.1', 56);
};

const LOGIN_LOCKOUT_MESSAGE =
  'Quá nhiều lần đăng nhập không thành công. Vui lòng thử lại sau 15 phút.';
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

const tooManyAttempts = (message: string) => (_req: Request, res: Response) =>
  sendError(res, 'TOO_MANY_REQUESTS', message, 429);

// Normalized here as well, so the key never depends on `validateBody(loginSchema)` having run.
// An email always contains '@' and an IP key never does, so the composite key cannot collide.
const getLoginEmailKey = (req: Request): string => {
  const email: unknown = req.body?.email;
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
};
const getLoginClientEmailKey = (req: Request): string =>
  `${getClientRateLimitKey(req)}:${getLoginEmailKey(req)}`;

/**
 * Counts only real authentication failures (4xx other than 429). A request rejected by another
 * limiter (429) or by a server fault (5xx) is given back: otherwise one throttled client could
 * exhaust the shared per-email / per-IP allowance without guessing a single password.
 * `clearedOnSuccess` limiters are wiped by `resetLoginRateLimitOnSuccess`, so they must not also
 * decrement on 2xx: the store's `decrement` would recreate the key that was just deleted and
 * restart its 15-minute window.
 */
const loginFailureLimiter = (
  max: number,
  keyGenerator: (req: Request) => string,
  clearedOnSuccess: boolean,
) =>
  rateLimit({
    windowMs: LOGIN_WINDOW_MS,
    max,
    skipSuccessfulRequests: true,
    requestWasSuccessful: (_req, res) =>
      res.statusCode === 429 ||
      res.statusCode >= 500 ||
      (!clearedOnSuccess && res.statusCode < 400),
    standardHeaders: true, // Return RateLimit-* headers
    legacyHeaders: false, // Disable X-RateLimit-* headers
    keyGenerator,
    // One shared message so the error body never reveals which limiter blocked the client.
    handler: tooManyAttempts(LOGIN_LOCKOUT_MESSAGE),
  });

/**
 * Rate limiter for login endpoint to prevent brute-force attacks.
 * CWB-33: blocks after 10 consecutive failed logins per window (15 minutes), successful logins
 * are not counted. CWB-108: the counter is keyed by IP + email, so a success on account B never
 * erases the failures accumulated against account A from the same IP.
 */
export const loginRateLimiter = loginFailureLimiter(10, getLoginClientEmailKey, true);

/**
 * CWB-108: 20 failed logins per email across every IP per window, so a botnet cannot guess one
 * account's password by spreading attempts over many addresses. Cleared only by that account's
 * successful login (only the password owner can produce one). Trade-off: an attacker can
 * deliberately lock a victim's login for up to 15 minutes. Mounted after `loginRateLimiter`, so
 * requests already blocked for an IP + email pair never reach (or count against) this limiter.
 */
export const loginEmailRateLimiter = loginFailureLimiter(20, getLoginEmailKey, true);

/**
 * CWB-108: 50 failed logins per client IP (IPv6 grouped by /56) regardless of email. Never
 * reset by a successful login, so a client cannot launder its failure count by signing in to an
 * account it owns. Kept high so several users behind one NAT do not block each other.
 */
export const loginIpRateLimiter = loginFailureLimiter(50, getClientRateLimitKey, false);

/**
 * Middleware that resets the consecutive failed attempt counters of the authenticated account
 * (IP + email pair and email-wide) when a login request succeeds (2xx). The IP-wide ceiling is
 * intentionally left untouched.
 */
export const resetLoginRateLimitOnSuccess = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  res.on('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      void loginRateLimiter.resetKey(getLoginClientEmailKey(req));
      void loginEmailRateLimiter.resetKey(getLoginEmailKey(req));
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
