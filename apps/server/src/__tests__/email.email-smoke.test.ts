import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProcessRunner } from './support/email-smoke-process.js';

const commands = createProcessRunner();
const root = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
const project = `cospace-email-${randomUUID().replaceAll('-', '')}`;
const roomId = randomUUID();
const recipient = `${project}@example.test`;
const password = 'Smoke-only-password-123!';
// Do not inherit application variables or let Compose discover the real .env.
const dockerEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) =>
    /^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|HOME|USERPROFILE|DOCKER_HOST|DOCKER_CONTEXT|DOCKER_CONFIG)$/i.test(
      key,
    ),
  ),
);
let directory: string | undefined;
let composeArgs: string[] = [];
let resourcesCreated = false;
let apiUrl = '';
let mailUrl = '';
let token = '';

function docker(args: string[], timeout = 30000): Promise<string> {
  return commands.run('docker', args, { cwd: root, env: dockerEnv }, timeout);
}
function compose(args: string[], timeout?: number) {
  return docker([...composeArgs, ...args], timeout);
}

async function poll<T>(
  label: string,
  read: () => Promise<T | undefined>,
  timeout = 30000,
): Promise<T> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await read();
    if (value !== undefined) return value;
    await new Promise((done) => setTimeout(done, 300));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function publishedUrl(service: string, port: string) {
  const mapping = await compose(['port', service, port]);
  const published = mapping.match(/127\.0\.0\.1:(\d+)/)?.[1];
  if (!published) throw new Error(`Missing loopback port for ${service}`);
  return `http://127.0.0.1:${published}`;
}

interface Booking {
  id: string;
  bookingCode: string;
  status: string;
}

async function api<T>(path: string, method = 'GET', body?: unknown, status = 200): Promise<T> {
  const response = await fetch(`${apiUrl}/api/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  expect(response.status, `${method} ${path}`).toBe(status);
  const result = (await response.json()) as { data: T };
  return result.data;
}

async function createBooking(offsetHours: number): Promise<Booking> {
  const day = new Date(Date.now() + offsetHours * 60 * 60 * 1000);
  day.setUTCHours(2, 0, 0, 0); // 09:00 Vietnam, within opening hours.
  const start = day.getTime();
  return api(
    '/bookings',
    'POST',
    {
      roomId,
      startTime: new Date(start).toISOString(),
      endTime: new Date(start + 60 * 60 * 1000).toISOString(),
    },
    201,
  );
}

async function waitForMail(bookingCode: string, subject: string) {
  return poll(`${subject} email for ${bookingCode}`, async () => {
    const response = await fetch(`${mailUrl}/api/v1/messages`, {
      signal: AbortSignal.timeout(3000),
    });
    expect(response.ok).toBe(true);
    const mailbox = (await response.json()) as {
      messages: Array<{ ID: string; Subject: string; To: Array<{ Address: string }> }>;
    };
    const message = mailbox.messages.find(
      (mail) =>
        mail.Subject.includes(subject) &&
        mail.Subject.includes(bookingCode) &&
        mail.To.some((address) => address.Address === recipient),
    );
    if (!message) return undefined;
    const detailResponse = await fetch(`${mailUrl}/api/v1/message/${message.ID}`, {
      signal: AbortSignal.timeout(3000),
    });
    expect(detailResponse.ok).toBe(true);
    const detail = (await detailResponse.json()) as { Text: string; HTML: string };
    expect(detail.Text).toContain(bookingCode);
    expect(detail.HTML).toContain('Email smoke room');
    return message;
  });
}

describe('deployed booking email through production Compose', () => {
  beforeAll(async () => {
    try {
      await docker(['version', '--format', '{{.Server.Version}}']);
      await docker(['compose', 'version']);
    } catch {
      throw new Error(
        'Email smoke requires Docker CLI, Compose v2 and a running daemon. Verify docker version responds within 30 seconds, then run npm run test:smoke:email --workspace=apps/server.',
      );
    }
    directory = await mkdtemp(join(tmpdir(), 'cospace-email-smoke-'));
    const envPath = join(directory, 'smoke.env');
    const overridePath = join(directory, 'compose.override.yml');
    await writeFile(
      envPath,
      [
        'DB_ROOT_PASSWORD=smoke-root-password',
        'DB_PASSWORD=smoke-db-password',
        'DB_USER=smoke_user',
        `DB_NAME=${project.replaceAll('-', '_')}_test`,
        'DB_PORT=127.0.0.1:0',
        'JWT_SECRET=smoke-only-jwt-secret-at-least-32-characters',
        'BCRYPT_SALT_ROUNDS=10',
        'CLIENT_URL=http://localhost',
        'CLOUDINARY_CLOUD_NAME=smoke',
        'CLOUDINARY_API_KEY=smoke',
        'CLOUDINARY_API_SECRET=smoke',
        'SMTP_HOST=mailpit',
        'SMTP_PORT=1025',
        'SMTP_SECURE=false',
        'SMTP_USER=smoke@example.test',
        'SMTP_PASS=smoke-smtp-password',
        'SMTP_FROM=smoke@example.test',
      ].join('\n'),
    );
    await writeFile(
      overridePath,
      `services:
  db:
    container_name: ${project}-db
    restart: "no"
  server:
    container_name: ${project}-server
    restart: "no"
    ports:
      - "127.0.0.1::5000"
  mailpit:
    image: axllent/mailpit:v1.20
    restart: "no"
    environment:
      MP_SMTP_AUTH_ACCEPT_ANY: "true"
      MP_SMTP_AUTH_ALLOW_INSECURE: "true"
    ports:
      - "127.0.0.1::8025"
    networks:
      - cospace-network
`,
    );
    composeArgs = [
      'compose',
      '--project-name',
      project,
      '--env-file',
      envPath,
      '-f',
      join(root, 'docker-compose.yml'),
      '-f',
      overridePath,
    ];
    // Mark before up so a partial startup failure still removes only this project.
    resourcesCreated = true;
    try {
      await compose(
        ['up', '--detach', '--build', '--wait', '--wait-timeout', '180', 'db', 'mailpit', 'server'],
        540000,
      );
    } catch (error) {
      const logs = await compose(['logs', '--no-color', '--tail', '80', 'server'], 10000).catch(
        () => 'Server startup logs unavailable.',
      );
      throw new Error(
        `${error instanceof Error ? error.message : 'Compose startup failed.'}\nServer startup logs:\n${logs}`,
      );
    }
    apiUrl = await publishedUrl('server', '5000');
    mailUrl = await publishedUrl('mailpit', '8025');
    await compose([
      'exec',
      '-T',
      'server',
      'node',
      '--input-type=module',
      '-e',
      `
      import { PrismaClient } from '@prisma/client';
      const prisma = new PrismaClient();
      try {
        await prisma.room.create({ data: {
          id: '${roomId}', name: 'Email smoke room', capacity: 4, pricePerHour: '100000.00'
        }});
      } finally { await prisma.$disconnect(); }
    `,
    ]);
    await api(
      '/auth/register',
      'POST',
      { email: recipient, password, fullName: 'Email Smoke Customer' },
      201,
    );
    const login = await api<{ accessToken: string }>('/auth/login', 'POST', {
      email: recipient,
      password,
    });
    token = login.accessToken;
    expect(token).toBeTruthy();
  });

  afterAll(async () => {
    try {
      await commands.stopAll();
    } catch {
      await commands.stopAll();
    } // One bounded retry; a live child keeps cleanup failed.
    if (resourcesCreated) {
      await compose(['down', '--volumes', '--remove-orphans', '--rmi', 'local'], 60000);
      const label = `label=com.docker.compose.project=${project}`;
      const remaining = await Promise.all([
        docker(['ps', '-a', '--filter', label, '--format', '{{.ID}}']),
        docker(['volume', 'ls', '--filter', label, '--format', '{{.Name}}']),
        docker(['network', 'ls', '--filter', label, '--format', '{{.ID}}']),
      ]);
      expect(remaining, `Cleanup must remove only project ${project}`).toEqual(['', '', '']);
    }
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it('delivers confirmation and cancellation and preserves both operations when SMTP fails', async () => {
    const booking = await createBooking(48);
    expect(booking.status).toBe('CONFIRMED');
    expect(booking.bookingCode).toMatch(/^CS-\d{8}-[A-Z0-9]{4}$/);
    await waitForMail(booking.bookingCode, 'Xác nhận');
    const cancelled = await api<Booking>(`/bookings/${booking.id}/cancel`, 'PATCH', {});
    expect(cancelled.status).toBe('CANCELLED');
    await waitForMail(booking.bookingCode, 'hủy');

    await compose(['stop', 'mailpit']);
    const failedDelivery = await createBooking(72);
    expect(failedDelivery.status).toBe('CONFIRMED');
    await poll('confirmation delivery failure', async () => {
      const logs = await compose(['logs', '--no-color', 'server']);
      return logs.includes(`confirmation delivery failed for ${failedDelivery.bookingCode}`)
        ? true
        : undefined;
    });
    expect((await api<Booking>(`/bookings/${failedDelivery.id}`)).status).toBe('CONFIRMED');
    expect((await api<Booking>(`/bookings/${failedDelivery.id}/cancel`, 'PATCH', {})).status).toBe(
      'CANCELLED',
    );
    await poll('cancellation delivery failure', async () => {
      const logs = await compose(['logs', '--no-color', 'server']);
      return logs.includes(`cancellation delivery failed for ${failedDelivery.bookingCode}`)
        ? true
        : undefined;
    });
    expect((await api<Booking>(`/bookings/${failedDelivery.id}`)).status).toBe('CANCELLED');
  });
});
