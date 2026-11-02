import app from './app.js';
import { ENV } from './config/env.config.js';
import { prisma } from './utils/prisma.util.js';
import { drainBackgroundTasks } from './utils/background-tasks.util.js';
import { createShutdownHandler } from './utils/graceful-shutdown.util.js';

const server = app.listen(ENV.PORT, () => {
  console.log(`🚀 [Server] Backend đang chạy tại http://localhost:${ENV.PORT}`);
  console.log(`📡 [HealthCheck] http://localhost:${ENV.PORT}/api/v1/health`);
});

const shutdown = createShutdownHandler({
  server,
  drainBackgroundTasks,
  disconnect: () => prisma.$disconnect(),
  timeoutMs: ENV.SHUTDOWN_TIMEOUT_MS,
});

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void shutdown(signal).then((code) => process.exit(code));
  });
}
