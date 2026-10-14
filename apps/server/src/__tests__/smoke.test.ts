import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { HealthService } from '../services/health.service.js';
import { roomRepository } from '../repositories/room.repository.js';
import { amenityRepository } from '../repositories/amenity.repository.js';
import { Prisma, RoomStatus } from '@prisma/client';

describe('Production Smoke Tests & Release Verification', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Health Check & Deployment Stability (AC: Hệ thống triển khai ổn định)', () => {
    it('GET /health (liveness probe) responds with 200 and valid liveness payload', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('OK');
      expect(res.body.data.service).toBe('Co-Space Working API');
      expect(typeof res.body.data.uptime).toBe('number');
    });

    it('GET /api/v1/health (readiness probe) responds with 200 and reports database connectivity', async () => {
      vi.spyOn(HealthService, 'checkDatabase').mockResolvedValueOnce(true);

      const res = await request(app).get('/api/v1/health');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        status: 'OK',
        database: 'connected',
        service: 'Co-Space Working API',
      });
      expect(res.body.data.timestamp).toBeDefined();
    });

    it('GET /api/v1/health reports 503 and DEGRADED when database probe fails', async () => {
      vi.spyOn(HealthService, 'checkDatabase').mockResolvedValueOnce(false);

      const res = await request(app).get('/api/v1/health');
      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('SERVICE_UNAVAILABLE');
      expect(res.body.details.status).toBe('DEGRADED');
      expect(res.body.details.database).toBe('disconnected');
    });

    it('GET /api/v1/health/liveness returns 200 without DB dependency', async () => {
      const res = await request(app).get('/api/v1/health/liveness');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('OK');
    });
  });

  describe('2. Routing & Error Envelope Consistency (AC: không có lỗi blocker/critical)', () => {
    it('returns standardized 404 JSON response for unknown routes without leaking internal details', async () => {
      const res = await request(app).get('/api/v1/unknown-endpoint-xyz');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        success: false,
        code: 'NOT_FOUND',
        message: 'Route không tồn tại',
      });
    });
  });

  describe('3. Core Public APIs & Security Verification', () => {
    it('GET /api/v1/rooms responds with 200 and valid items payload', async () => {
      vi.spyOn(roomRepository, 'findManyAndCount').mockResolvedValueOnce([
        1,
        [
          {
            id: '11111111-1111-4111-8111-111111111111',
            name: 'Deluxe Meeting Room',
            capacity: 8,
            pricePerHour: new Prisma.Decimal('200.00'),
            status: RoomStatus.AVAILABLE,
            images: [],
            amenities: [],
          },
        ],
      ]);

      const res = await request(app).get('/api/v1/rooms');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(1);
    });

    it('GET /api/v1/amenities responds with 200 and list of amenities', async () => {
      vi.spyOn(amenityRepository, 'findAll').mockResolvedValueOnce([
        {
          id: '22222222-2222-4222-8222-222222222222',
          name: 'High-speed Wi-Fi',
          icon: 'wifi',
          description: 'Gigabit fiber connection',
        },
      ]);

      const res = await request(app).get('/api/v1/amenities');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });

    it('security headers: Helmet is active, no X-Powered-By header', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });
  });
});
