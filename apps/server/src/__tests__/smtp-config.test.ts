import { describe, expect, it } from 'vitest';
import { parseSmtpConfig, smtpConfigFromEnv } from '../config/smtp.config.js';

const credentials = { smtpUser: 'sender@example.com', smtpPass: 'fake-password' };

describe('SMTP configuration', () => {
  it('uses safe defaults and distinguishes unconfigured from ready', () => {
    expect(parseSmtpConfig({}).status).toBe('unconfigured');
    expect(parseSmtpConfig(credentials)).toMatchObject({
      status: 'ready',
      config: { smtpHost: 'smtp.gmail.com', smtpPort: 587, smtpSecure: false },
    });
  });

  it.each(['0', '65536', '1.5', 'NaN', 'Infinity', '', ' 587 ', '0x24b', '-1'])(
    'disables email for invalid port %s',
    (smtpPort) => {
      expect(parseSmtpConfig({ ...credentials, smtpPort })).toMatchObject({
        status: 'invalid',
        issues: ['SMTP_PORT'],
      });
    },
  );
  it.each(['TRUE', 'yes', '1', '', ' false '])('rejects invalid boolean %s', (smtpSecure) => {
    expect(parseSmtpConfig({ ...credentials, smtpSecure }).issues).toContain('SMTP_SECURE');
  });
  it.each([true, false, 'true', 'false'])('accepts strict boolean %s', (smtpSecure) => {
    expect(parseSmtpConfig({ ...credentials, smtpSecure })).toMatchObject({
      status: 'ready',
      config: { smtpSecure: smtpSecure === true || smtpSecure === 'true' },
    });
  });
  it.each([
    'smtp://user:pass@host',
    'smtp.example.com/path',
    'bad host',
    '',
    '-host',
    'host\r\ninjected',
  ])('rejects invalid host %s', (smtpHost) => {
    expect(parseSmtpConfig({ ...credentials, smtpHost }).issues).toContain('SMTP_HOST');
  });
  it.each(['localhost', 'mailpit', '127.0.0.1', '::1', 'smtp.gmail.com'])(
    'accepts host %s',
    (smtpHost) => {
      expect(parseSmtpConfig({ ...credentials, smtpHost }).status).toBe('ready');
    },
  );
  it.each([
    'invalid',
    'a@bad..example.com',
    'a@example.com, b@example.com',
    'A <a@example.com>\r\nBcc: b@example.com',
    'a@example.com\n',
  ])('rejects invalid sender %s', (smtpFrom) => {
    expect(parseSmtpConfig({ ...credentials, smtpFrom }).issues).toContain('SMTP_FROM');
  });
  it.each(['a@example.com', '"Co-Space Working" <a@example.com>'])(
    'accepts sender %s',
    (smtpFrom) => {
      expect(parseSmtpConfig({ ...credentials, smtpFrom }).status).toBe('ready');
    },
  );
  it('rejects partial credentials and preserves password bytes', () => {
    expect(parseSmtpConfig({ smtpUser: 'user' }).issues).toContain('SMTP_PASS');
    expect(parseSmtpConfig({ smtpPass: 'password' }).issues).toContain('SMTP_USER');
    expect(parseSmtpConfig({ smtpUser: 'user', smtpPass: ' ' }).status).toBe('invalid');
    expect(parseSmtpConfig({ ...credentials, smtpPass: ' password ' }).config.smtpPass).toBe(
      ' password ',
    );
    expect(parseSmtpConfig({ ...credentials, smtpUser: 'user\r\nheader' }).status).toBe('invalid');
  });
  it('retains legacy aliases and gives SMTP values precedence', () => {
    const env = {
      GMAIL_USER: 'legacy',
      GMAIL_APP_PASSWORD: 'old-password',
      EMAIL_FROM: 'old@example.com',
    };
    expect(smtpConfigFromEnv(env)).toMatchObject({
      status: 'ready',
      config: { smtpUser: 'legacy', smtpPass: 'old-password', smtpFrom: 'old@example.com' },
    });
    expect(
      smtpConfigFromEnv({
        ...env,
        SMTP_USER: 'primary',
        SMTP_PASS: 'new-password',
        SMTP_FROM: 'new@example.com',
      }),
    ).toMatchObject({
      status: 'ready',
      config: { smtpUser: 'primary', smtpPass: 'new-password', smtpFrom: 'new@example.com' },
    });
  });
});
