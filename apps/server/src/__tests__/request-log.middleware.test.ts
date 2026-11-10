import { describe, expect, it } from 'vitest';
import { PassThrough } from 'node:stream';
import express from 'express';
import request from 'supertest';
import {
  createRequestLogger,
  requestLogFormatFor,
  safeRequestPath,
} from '../middlewares/request-log.middleware.js';

/** Express app with the logger for `nodeEnv`, writing into a captured stream. */
const appWithLogger = (nodeEnv: string) => {
  const stream = new PassThrough();
  const lines: string[] = [];
  stream.on('data', (chunk: Buffer) =>
    lines.push(...chunk.toString('utf8').split('\n').filter(Boolean)),
  );
  const app = express();
  app.set('trust proxy', 1);
  const logger = createRequestLogger(nodeEnv, stream);
  if (logger) app.use(logger);
  app.get('/api/v1/rooms/:id', (_req, res) => res.status(200).json({ ok: true }));
  app.post('/api/v1/auth/reset-password', (_req, res) => res.status(400).json({ ok: false }));
  app.get('/api/v1/tokens/:token', (_req, res) => res.status(404).end());
  return { app, lines, logger };
};

// The log line is written when the response finishes; give the stream a tick to flush.
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('request logging per NODE_ENV (CWB-90)', () => {
  it.each([
    ['development', 'dev'],
    ['production', 'json'],
    ['test', 'off'],
    ['staging', 'json'],
    ['', 'json'],
  ])('NODE_ENV=%j uses the %s format', (nodeEnv, format) => {
    expect(requestLogFormatFor(nodeEnv)).toBe(format);
  });

  it('mounts no request logger under test', async () => {
    const { app, lines, logger } = appWithLogger('test');
    expect(logger).toBeNull();
    await request(app).get('/api/v1/rooms/abc');
    await flush();
    expect(lines).toEqual([]);
  });

  it('writes one parseable JSON line per request in production', async () => {
    const { app, lines } = appWithLogger('production');
    const roomId = '0b7f4c1e-3a2d-4c5b-9e8f-1a2b3c4d5e6f';

    await request(app)
      .get(`/api/v1/rooms/${roomId}?q=Nguyễn&token=secret-reset-token`)
      .set('Authorization', 'Bearer header.payload.signature')
      .set('X-Forwarded-For', '203.0.113.7');
    await flush();

    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry).toEqual({
      time: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      method: 'GET',
      path: `/api/v1/rooms/${roomId}`,
      status: 200,
      durationMs: expect.any(Number),
      bytes: expect.any(Number),
      ip: '203.0.113.7',
    });
    // No ANSI colors, query strings, headers or tokens.
    expect(lines[0]).not.toContain(String.fromCharCode(27));
    expect(lines[0]).not.toContain('secret-reset-token');
    expect(lines[0]).not.toContain('Nguy');
    expect(lines[0]).not.toContain('Bearer');
    expect(lines[0]).not.toContain('signature');
  });

  it('never logs request bodies (reset tokens are sent in the body)', async () => {
    const { app, lines } = appWithLogger('production');
    await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'reset-token-value-1234567890', newPassword: 'Password123!' });
    await flush();

    expect(JSON.parse(lines[0])).toMatchObject({
      method: 'POST',
      path: '/api/v1/auth/reset-password',
      status: 400,
    });
    expect(lines[0]).not.toContain('reset-token-value');
    expect(lines[0]).not.toContain('Password123');
  });

  it('masks long opaque path segments in every format', async () => {
    const token = 'Aq3xZ9_kLm-PQ7rT2vW8yB4nC6dE1fG5hJ0';
    for (const nodeEnv of ['production', 'development']) {
      const { app, lines } = appWithLogger(nodeEnv);
      await request(app).get(`/api/v1/tokens/${token}`);
      await flush();
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('/api/v1/tokens/:redacted');
      expect(lines[0]).not.toContain(token);
    }
  });

  it('keeps a short human-readable line without the query string in development', async () => {
    const { app, lines } = appWithLogger('development');
    await request(app).get('/api/v1/rooms/abc?token=secret');
    await flush();

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^GET \/api\/v1\/rooms\/abc 200 \d+(\.\d+)? ms - \d+$/);
  });

  it.each([
    ['/api/v1/rooms?page=2', '/api/v1/rooms'],
    ['/health#x', '/health'],
    ['', '/'],
    [undefined, '/'],
    [
      '/api/v1/rooms/0b7f4c1e-3a2d-4c5b-9e8f-1a2b3c4d5e6f',
      '/api/v1/rooms/0b7f4c1e-3a2d-4c5b-9e8f-1a2b3c4d5e6f',
    ],
    ['/verify-email/eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2ln', '/verify-email/:redacted'],
    ['/api/v1/admin/bookings/CS-20261110-ABCD', '/api/v1/admin/bookings/CS-20261110-ABCD'],
  ])('safeRequestPath(%j) = %j', (url, expected) => {
    expect(safeRequestPath(url)).toBe(expected);
  });
});
