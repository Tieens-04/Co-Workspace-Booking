import type { Server } from 'node:http';

let shuttingDown = false;

/** Readiness reports 503 once shutdown starts so the proxy stops routing new traffic here. */
export function isShuttingDown(): boolean {
  return shuttingDown;
}

/** Test helper: restore the process-wide flag between cases. */
export function resetShutdownStateForTests(): void {
  shuttingDown = false;
}

export interface ShutdownDeps {
  server: Pick<Server, 'close' | 'closeIdleConnections' | 'closeAllConnections'>;
  drainBackgroundTasks: (timeoutMs: number) => Promise<boolean>;
  disconnect: () => Promise<void>;
  timeoutMs: number;
  log?: Pick<typeof console, 'log' | 'error'>;
}

/**
 * Builds an idempotent shutdown routine: stop accepting connections, let in-flight requests
 * finish, wait for background side effects, then disconnect Prisma. Everything shares one
 * deadline; on expiry remaining sockets are destroyed. Resolves with the process exit code.
 */
export function createShutdownHandler(deps: ShutdownDeps): (signal: string) => Promise<number> {
  const log = deps.log ?? console;
  let running: Promise<number> | null = null;

  const run = async (signal: string): Promise<number> => {
    shuttingDown = true;
    const deadline = Date.now() + deps.timeoutMs;
    log.log(`[Server] ${signal} received; draining (timeout ${deps.timeoutMs}ms)`);

    const closed = new Promise<boolean>((resolve) => {
      deps.server.close((err) => resolve(!err));
      // Keep-alive sockets with no request in flight would otherwise hold close() open.
      deps.server.closeIdleConnections();
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), deps.timeoutMs);
    });
    const httpResult = await Promise.race([closed, expired]);
    clearTimeout(timer);
    const httpDrained = httpResult === true;
    if (!httpDrained) {
      log.error('[Server] HTTP drain incomplete; closing remaining connections');
      deps.server.closeAllConnections();
    }

    const tasksDrained = await deps.drainBackgroundTasks(Math.max(0, deadline - Date.now()));
    if (!tasksDrained) log.error('[Server] Background tasks still pending at shutdown deadline');

    try {
      await deps.disconnect();
    } catch {
      log.error('[Server] Database disconnect failed during shutdown');
      return 1;
    }
    log.log('[Server] Shutdown complete');
    return httpDrained && tasksDrained ? 0 : 1;
  };

  return (signal: string) => (running ??= run(signal));
}
