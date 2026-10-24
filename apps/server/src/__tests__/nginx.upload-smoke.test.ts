import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { resolve } from 'node:path';
import express from 'express';
import request from 'supertest';
import { Prisma, Role, RoomStatus } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../app.js';
import { generateToken } from '../utils/jwt.util.js';
import { roomRepository, type RoomDetailRecord } from '../repositories/room.repository.js';
import { cloudinaryMediaService } from '../services/cloudinary-media.service.js';

vi.mock('../utils/prisma.util.js', () => ({
  default: { $transaction: vi.fn() },
  prisma: { $transaction: vi.fn() },
}));

const MiB = 1024 * 1024;
const roomId = '33333333-3333-4333-8333-333333333333';
const uploadPath = `/api/v1/admin/rooms/${roomId}/images`;
const containerName = `cospace-upload-smoke-${randomUUID()}`;
const fixture: RoomDetailRecord = {
  id: roomId,
  name: 'Upload smoke room',
  description: 'Isolated test fixture',
  capacity: 4,
  pricePerHour: new Prisma.Decimal('100.00'),
  status: RoomStatus.AVAILABLE,
  images: [],
  amenities: [],
};

let backend: Server | undefined;
let containerStarted = false;
let proxyUrl = '';
let upstreamRequests = 0;

function docker(args: string[], timeout = 30000): string {
  return execFileSync('docker', args, {
    encoding: 'utf8',
    timeout,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function jpeg(size: number): Buffer {
  const buffer = Buffer.alloc(size);
  buffer.set([0xff, 0xd8, 0xff, 0xe0]);
  return buffer;
}

function upload() {
  return request(proxyUrl)
    .post(uploadPath)
    .set('Authorization', `Bearer ${generateToken({ sub: 'smoke-admin', role: Role.ADMIN })}`)
    .timeout({ response: 30000, deadline: 60000 });
}

async function cleanup() {
  try {
    if (containerStarted) {
      try {
        docker(['rm', '-f', containerName]);
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('No such container')) throw error;
      }
      containerStarted = false;
    }
  } finally {
    if (backend) {
      const server = backend;
      backend = undefined;
      await new Promise<void>((done, reject) => {
        server.close((error) => (error ? reject(error) : done()));
        server.closeAllConnections();
      });
    }
    vi.restoreAllMocks();
  }
}

describe('room image upload through production Nginx', () => {
  beforeAll(async () => {
    try {
      try {
        docker(['info', '--format', '{{.ServerVersion}}']);
      } catch {
        throw new Error(
          'Upload smoke requires Docker CLI and a running Docker daemon. Start Docker Desktop and verify docker info succeeds, then retry npm run test:smoke:upload --workspace=apps/server.',
        );
      }

      vi.spyOn(roomRepository, 'findById').mockResolvedValue(fixture);
      vi.spyOn(roomRepository, 'appendImages').mockResolvedValue(fixture);
      vi.spyOn(cloudinaryMediaService, 'uploadImage').mockResolvedValue({
        imageUrl: 'https://example.com/smoke.jpg',
        publicId: 'smoke-image',
      });
      vi.spyOn(cloudinaryMediaService, 'destroyManyImages').mockResolvedValue();

      const countedApp = express();
      countedApp.use((_req, _res, next) => {
        upstreamRequests += 1;
        next();
      });
      countedApp.use(app);
      await new Promise<void>((done, reject) => {
        backend = countedApp.listen(5000, '0.0.0.0', done);
        backend.once('error', () => {
          backend = undefined;
          reject(
            new Error('Upload smoke cannot bind port 5000. Stop the local backend and retry.'),
          );
        });
      });

      const configPath = resolve(process.env.SMOKE_NGINX_CONFIG || '../client/nginx.conf');
      // Mark before run so cleanup also covers a timeout after Docker creates the container.
      containerStarted = true;
      docker(
        [
          'run',
          '--detach',
          '--name',
          containerName,
          '--add-host',
          'server:host-gateway',
          '--publish',
          '127.0.0.1::80',
          '--mount',
          `type=bind,source=${configPath},target=/etc/nginx/conf.d/default.conf,readonly`,
          'nginx:1.27-alpine',
        ],
        60000,
      );
      docker(['exec', containerName, 'nginx', '-t']);
      const port = docker(['port', containerName, '80/tcp']).match(/:(\d+)$/)?.[1];
      if (!port) throw new Error('Docker did not expose the Nginx smoke port.');
      proxyUrl = `http://127.0.0.1:${port}`;

      let ready = false;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        try {
          const response = await fetch(`${proxyUrl}/health`, { signal: AbortSignal.timeout(1000) });
          if (response.ok) {
            ready = true;
            break;
          }
        } catch {
          // Nginx may still be starting; retry within the bounded readiness window.
        }
        await new Promise((done) => setTimeout(done, 250));
      }
      if (!ready) throw new Error('Nginx cannot reach the test backend on host port 5000.');
    } catch (error) {
      await cleanup();
      throw error;
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
    upstreamRequests = 0;
  });

  afterAll(cleanup);

  it.each([1, 3, 5])('accepts a %i MiB image', async (size) => {
    const response = await upload().attach('images', jpeg(size * MiB), 'photo.jpg');
    expect(response.status).toBe(201);
    expect(cloudinaryMediaService.uploadImage).toHaveBeenCalledTimes(1);
    expect(roomRepository.appendImages).toHaveBeenCalledTimes(1);
  });

  it('accepts ten 5 MiB images including multipart overhead', async () => {
    const image = jpeg(5 * MiB);
    const pending = upload();
    for (let index = 0; index < 10; index += 1) {
      pending.attach('images', image, `photo-${index}.jpg`);
    }
    const response = await pending;
    expect(response.status).toBe(201);
    expect(cloudinaryMediaService.uploadImage).toHaveBeenCalledTimes(10);
    expect(roomRepository.appendImages).toHaveBeenCalledTimes(1);
  });

  it('keeps the backend per-file size limit', async () => {
    const response = await upload().attach('images', jpeg(5 * MiB + 1), 'large.jpg');
    expect(response.status).toBe(413);
    expect(response.body.code).toBe('FILE_TOO_LARGE');
    expect(upstreamRequests).toBe(1);
    expect(cloudinaryMediaService.uploadImage).not.toHaveBeenCalled();
    expect(roomRepository.appendImages).not.toHaveBeenCalled();
  });

  it('keeps the ten-file limit', async () => {
    const pending = upload();
    for (let index = 0; index < 11; index += 1) {
      pending.attach('images', jpeg(32), `photo-${index}.jpg`);
    }
    const response = await pending;
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(cloudinaryMediaService.uploadImage).not.toHaveBeenCalled();
    expect(roomRepository.appendImages).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'MIME type', contentType: 'text/plain', buffer: jpeg(32) },
    { name: 'image signature', contentType: 'image/jpeg', buffer: Buffer.from('not an image') },
  ])('rejects an invalid $name without side effects', async ({ contentType, buffer }) => {
    const response = await upload().attach('images', buffer, { filename: 'fake.jpg', contentType });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(cloudinaryMediaService.uploadImage).not.toHaveBeenCalled();
    expect(roomRepository.appendImages).not.toHaveBeenCalled();
  });

  it('rejects a request above 55 MiB at Nginx before it reaches Express', async () => {
    const response = await upload().attach('images', jpeg(55 * MiB + 1), 'too-large.jpg');
    expect(response.status).toBe(413);
    expect(response.headers['content-type']).toContain('text/html');
    expect(upstreamRequests).toBe(0);
    expect(cloudinaryMediaService.uploadImage).not.toHaveBeenCalled();
    expect(roomRepository.appendImages).not.toHaveBeenCalled();
  });

  it.each([
    { token: '', status: 401 },
    { token: generateToken({ sub: 'smoke-customer', role: Role.CUSTOMER }), status: 403 },
  ])('preserves access control ($status)', async ({ token, status }) => {
    const pending = request(proxyUrl)
      .post(uploadPath)
      .timeout({ response: 30000, deadline: 60000 });
    if (token) pending.set('Authorization', `Bearer ${token}`);
    const response = await pending.attach('images', jpeg(32), 'photo.jpg');
    expect(response.status).toBe(status);
    expect(cloudinaryMediaService.uploadImage).not.toHaveBeenCalled();
    expect(roomRepository.appendImages).not.toHaveBeenCalled();
  });
});
