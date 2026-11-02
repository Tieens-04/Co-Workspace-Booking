import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import app from '../app.js';
import { HealthService } from '../services/health.service.js';
import {
  drainBackgroundTasks,
  pendingBackgroundTaskCount,
  trackBackgroundTask,
} from '../utils/background-tasks.util.js';
import {
  createShutdownHandler,
  isShuttingDown,
  resetShutdownStateForTests,
} from '../utils/graceful-shutdown.util.js';

// Prevent real DB access during unit tests
vi.mock('../utils/prisma.util.js', () => ({ default: {}, prisma: {} }));

const quietLog = { log: vi.fn(), error: vi.fn() };

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

/** Starts a real HTTP server whose /slow route waits for the returned release(). */
const startSlowServer = async () => {
  const gate = deferred();
  const started = deferred();
  const slowApp = express();
  slowApp.get('/slow', async (_req, res) => {
    started.resolve();
    await gate.promise;
    res.json({ done: true });
  });
  const server = http.createServer(slowApp);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { server, port, release: gate.resolve, started: started.promise };
};

const get = (port: number, path: string) =>
  new Promise<{ status?: number; body: string }>((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path, agent: false }, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body }));
      })
      .on('error', reject);
  });

describe('Graceful shutdown & readiness (CWB-61)', () => {
  afterEach(() => {
    resetShutdownStateForTests();
    vi.restoreAllMocks();
  });

  describe('background tasks', () => {
    it('waits for tracked side effects, including ones added while draining', async () => {
      const first = deferred();
      const second = deferred();
      trackBackgroundTask(first.promise);
      expect(pendingBackgroundTaskCount()).toBe(1);

      const drained = drainBackgroundTasks(1000);
      trackBackgroundTask(second.promise);
      first.resolve();
      await Promise.resolve();
      second.resolve();

      await expect(drained).resolves.toBe(true);
      expect(pendingBackgroundTaskCount()).toBe(0);
    });

    it('reports false when tasks outlive the timeout and swallows rejections', async () => {
      const hanging = deferred();
      trackBackgroundTask(Promise.reject(new Error('smtp down')));
      trackBackgroundTask(hanging.promise);

      await expect(drainBackgroundTasks(20)).resolves.toBe(false);
      hanging.resolve();
      await expect(drainBackgroundTasks(1000)).resolves.toBe(true);
    });
  });

  describe('shutdown handler', () => {
    it('finishes in-flight requests, refuses new ones, drains tasks, then disconnects', async () => {
      const { server, port, release, started } = await startSlowServer();
      const order: string[] = [];
      const drain = vi.fn(async () => {
        order.push('drain');
        return true;
      });
      const disconnect = vi.fn(async () => {
        order.push('disconnect');
      });
      const shutdown = createShutdownHandler({
        server,
        drainBackgroundTasks: drain,
        disconnect,
        timeoutMs: 2000,
        log: quietLog,
      });

      const inFlight = get(port, '/slow');
      await started;
      const exitCode = shutdown('SIGTERM');
      expect(shutdown('SIGINT')).toBe(exitCode);
      expect(isShuttingDown()).toBe(true);

      await expect(get(port, '/slow')).rejects.toThrow();
      expect(disconnect).not.toHaveBeenCalled();

      release();
      await expect(inFlight).resolves.toMatchObject({ status: 200, body: '{"done":true}' });
      await expect(exitCode).resolves.toBe(0);
      expect(order).toEqual(['drain', 'disconnect']);
    });

    it('force-closes stuck connections at the deadline and still disconnects', async () => {
      const { server, port, release, started } = await startSlowServer();
      const disconnect = vi.fn(async () => {});
      const drain = vi.fn(async () => true);
      const shutdown = createShutdownHandler({
        server,
        drainBackgroundTasks: drain,
        disconnect,
        timeoutMs: 50,
        log: quietLog,
      });

      const stuck = get(port, '/slow').catch((err: Error) => err);
      await started;

      await expect(shutdown('SIGTERM')).resolves.toBe(1);
      expect(await stuck).toBeInstanceOf(Error);
      expect(drain).toHaveBeenCalledWith(expect.any(Number));
      expect(disconnect).toHaveBeenCalledTimes(1);
      release();
    });
  });

  describe('readiness probe', () => {
    it('reports 503 while shutting down even with a healthy database', async () => {
      vi.spyOn(HealthService, 'checkDatabase').mockResolvedValue(true);
      const idle = http.createServer();
      await new Promise<void>((resolve) => idle.listen(0, '127.0.0.1', resolve));
      const shutdown = createShutdownHandler({
        server: idle,
        drainBackgroundTasks: async () => true,
        disconnect: async () => {},
        timeoutMs: 1000,
        log: quietLog,
      });

      expect((await request(app).get('/api/v1/health')).status).toBe(200);
      await shutdown('SIGTERM');

      const res = await request(app).get('/api/v1/health');
      expect(res.status).toBe(503);
      expect(res.body.code).toBe('SERVICE_UNAVAILABLE');
      expect(res.body.details).toMatchObject({
        status: 'DEGRADED',
        database: 'connected',
        shuttingDown: true,
      });
      // Liveness stays OK so the orchestrator does not kill a draining process early.
      expect((await request(app).get('/health')).status).toBe(200);
    });
  });
});
