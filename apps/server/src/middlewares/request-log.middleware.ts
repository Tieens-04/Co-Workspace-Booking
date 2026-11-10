import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Writable } from 'node:stream';
import type { RequestHandler } from 'express';
import morgan from 'morgan';

export type RequestLogFormat = 'dev' | 'json' | 'off';

/** CWB-90: `development` keeps a short human-readable line, `production` one JSON object per
 * request for log collectors, and `test` stays quiet. Unknown values fall back to JSON. */
export const requestLogFormatFor = (nodeEnv: string): RequestLogFormat => {
  if (nodeEnv === 'test') return 'off';
  if (nodeEnv === 'development') return 'dev';
  return 'json';
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Long opaque segments (reset/verification tokens, signed values) never reach the log. */
const OPAQUE_SEGMENT = /^[A-Za-z0-9_\-.~%]{24,}$/;

/**
 * Path without the query string; any long opaque segment that is not a UUID is masked. Query
 * strings are dropped entirely because they may carry tokens or personal search terms.
 */
export const safeRequestPath = (url: string | undefined): string => {
  const path = (url ?? '/').split(/[?#]/, 1)[0] || '/';
  return path
    .split('/')
    .map((segment) => (OPAQUE_SEGMENT.test(segment) && !UUID.test(segment) ? ':redacted' : segment))
    .join('/');
};

type Req = IncomingMessage & { originalUrl?: string; ip?: string };

morgan.token<Req>('safe-path', (req) => safeRequestPath(req.originalUrl ?? req.url));

/** Short line like morgan `dev` (no ANSI colors), on the sanitized path. */
const DEV_FORMAT = ':method :safe-path :status :response-time ms - :res[content-length]';

const jsonLine: morgan.FormatFn<Req, ServerResponse> = (tokens, req, res) => {
  const status = tokens.status(req, res);
  const duration = tokens['response-time'](req, res);
  const length = tokens.res(req, res, 'content-length');
  // Only these fields are logged: no headers (Authorization, cookies), bodies or query strings.
  return JSON.stringify({
    time: tokens.date(req, res, 'iso'),
    method: tokens.method(req, res),
    path: safeRequestPath(req.originalUrl ?? req.url),
    status: status === undefined ? null : Number(status),
    durationMs: duration === undefined ? null : Number(duration),
    bytes: length === undefined ? null : Number(length),
    ip: req.ip ?? null,
  });
};

/** Request logger for the given environment, or null when request logging is off. */
export const createRequestLogger = (
  nodeEnv: string,
  stream: Writable = process.stdout,
): RequestHandler | null => {
  const format = requestLogFormatFor(nodeEnv);
  if (format === 'off') return null;
  if (format === 'dev') return morgan<Req, ServerResponse>(DEV_FORMAT, { stream });
  return morgan<Req, ServerResponse>(jsonLine, { stream });
};
