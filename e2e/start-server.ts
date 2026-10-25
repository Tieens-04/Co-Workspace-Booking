import { prepareDatabase } from './prepare.js';
import { serverEnvironment } from './env.js';

async function main(): Promise<void> {
  // Validate and migrate before importing Prisma or application environment modules.
  const environment = serverEnvironment();
  prepareDatabase();
  Object.assign(process.env, environment);
  const { default: app } = await import('../apps/server/src/app.js');
  const { default: prisma } = await import('../apps/server/src/utils/prisma.util.js');
  const server = app.listen(5001, '127.0.0.1');
  server.on('error', () => {
    console.error('E2E backend cannot bind 127.0.0.1:5001; stop the process using that port.');
    process.exitCode = 1;
  });
  const stop = () => {
    server.close(() => {
      void prisma.$disconnect().finally(() => process.exit(0));
    });
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'E2E backend startup failed.');
  process.exitCode = 1;
});
