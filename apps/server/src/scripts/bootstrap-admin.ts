import 'dotenv/config';
import { prisma } from '../utils/prisma.util.js';
import { hashPassword } from '../utils/password.util.js';
import { AdminBootstrapError, bootstrapAdmin } from '../services/admin-bootstrap.service.js';

// Usage (after `prisma migrate deploy`): provide ADMIN_BOOTSTRAP_* through the environment
// or a secret store, run `npm run admin:bootstrap --workspace=apps/server`, then unset them.
try {
  const result = await bootstrapAdmin(process.env, prisma.user, hashPassword);
  console.log(
    result.status === 'created'
      ? `Admin account created for ${result.email}.`
      : `Admin account ${result.email} already exists; nothing changed.`,
  );
} catch (err) {
  console.error(
    err instanceof AdminBootstrapError ? err.message : 'Admin bootstrap failed unexpectedly.',
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
