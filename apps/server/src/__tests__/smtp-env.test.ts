import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';

it('loads .env from the server working directory without overriding injected environment', () => {
  const directory = mkdtempSync(join(tmpdir(), 'cospace-smtp-env-'));
  try {
    writeFileSync(
      join(directory, '.env'),
      [
        'JWT_SECRET=fake-test-secret-at-least-32-characters',
        'CLOUDINARY_CLOUD_NAME=fake',
        'CLOUDINARY_API_KEY=fake',
        'CLOUDINARY_API_SECRET=fake',
        'SMTP_HOST=mailpit',
        'SMTP_PORT=1025',
        'SMTP_SECURE=false',
        'SMTP_USER=file-user',
        'SMTP_PASS=fake-password',
        'SMTP_FROM=sender@example.com',
      ].join('\n'),
    );
    writeFileSync(join(directory, '.env.production'), 'SMTP_HOST=wrong-file\nSMTP_SECURE=invalid');
    const env = { ...process.env };
    for (const key of Object.keys(env)) {
      if (/^(SMTP_|GMAIL_|EMAIL_FROM$|JWT_|CLOUDINARY_|BCRYPT_|TRUST_PROXY$)/.test(key))
        delete env[key];
    }
    env.SMTP_USER = 'container-user';
    env.NODE_ENV = 'production';
    // Resolve tsx before changing cwd: the temporary directory has no node_modules.
    const tsx = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
    const moduleUrl = new URL('../config/env.config.ts', import.meta.url).href;
    const output = execFileSync(
      process.execPath,
      [
        '--import',
        tsx,
        '--input-type=module',
        '-e',
        `const { ENV } = await import(${JSON.stringify(moduleUrl)}); console.log(JSON.stringify({ status: ENV.SMTP.status, host: ENV.SMTP.config.smtpHost, user: ENV.SMTP.config.smtpUser }));`,
      ],
      { cwd: directory, env, encoding: 'utf8', timeout: 20000 },
    );
    expect(JSON.parse(output.trim())).toEqual({
      status: 'ready',
      host: 'mailpit',
      user: 'container-user',
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 25000);
