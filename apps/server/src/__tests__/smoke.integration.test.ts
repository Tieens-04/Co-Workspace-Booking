import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../app.js';

describe('Production Smoke Integration Tests (Real MySQL & Live Server)', () => {
  it('GET /health returns 200 liveness and response time under 300ms SLA', async () => {
    const start = Date.now();
    const res = await request(app).get('/health');
    const duration = Date.now() - start;

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('OK');
    expect(res.body.data.service).toBe('Co-Space Working API');
    expect(duration).toBeLessThan(300);
  });

  it('GET /api/v1/health returns 200 with database: connected under 300ms SLA', async () => {
    const start = Date.now();
    const res = await request(app).get('/api/v1/health');
    const duration = Date.now() - start;

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.database).toBe('connected');
    expect(duration).toBeLessThan(300);
  });

  it('GET /api/v1/rooms responds with real catalog under 300ms SLA', async () => {
    const start = Date.now();
    const res = await request(app).get('/api/v1/rooms');
    const duration = Date.now() - start;

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(duration).toBeLessThan(300);
  });

  it('GET /api/v1/amenities responds under 300ms SLA', async () => {
    const start = Date.now();
    const res = await request(app).get('/api/v1/amenities');
    const duration = Date.now() - start;

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(duration).toBeLessThan(300);
  });

  it('unknown routes return structured 404 error envelope without crashing', async () => {
    const res = await request(app).get('/api/v1/non-existent-smoke-probe');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      code: 'NOT_FOUND',
      message: 'Route không tồn tại',
    });
  });
});
