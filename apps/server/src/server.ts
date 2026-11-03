import app from './app.js';
import { ENV } from './config/env.config.js';
import { prisma } from './utils/prisma.util.js';
import { drainBackgroundTasks } from './utils/background-tasks.util.js';
import { createShutdownHandler } from './utils/graceful-shutdown.util.js';
import { emailOutboxService } from './services/email-outbox.service.js';

/** How often the email outbox worker looks for due messages (CWB-68). */
const EMAIL_OUTBOX_POLL_MS = 15_000;

const server = app.listen(ENV.PORT, () => {
  console.log(`🚀 [Server] Backend đang chạy tại http://localhost:${ENV.PORT}`);
  console.log(`📡 [HealthCheck] http://localhost:${ENV.PORT}/api/v1/health`);
  emailOutboxService.start(EMAIL_OUTBOX_POLL_MS);
});

const shutdown = createShutdownHandler({
  server,
  // Stop polling first; an in-flight pass is a tracked background task and is awaited.
  drainBackgroundTasks: (timeoutMs) => {
    emailOutboxService.stop();
    return drainBackgroundTasks(timeoutMs);
  },
  disconnect: () => prisma.$disconnect(),
  timeoutMs: ENV.SHUTDOWN_TIMEOUT_MS,
});

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void shutdown(signal).then((code) => process.exit(code));
  });
}
