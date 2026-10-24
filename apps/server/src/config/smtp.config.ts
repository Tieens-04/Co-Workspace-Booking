import { isIP } from 'node:net';
import { z } from 'zod';

export interface NotificationConfig {
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPass?: string;
  smtpFrom?: string;
}

type SmtpInput = Omit<NotificationConfig, 'smtpPort' | 'smtpSecure'> & {
  smtpPort?: string | number;
  smtpSecure?: string | boolean;
};

export interface SmtpConfiguration {
  status: 'ready' | 'unconfigured' | 'invalid';
  issues: string[];
  config: Required<NotificationConfig>;
}

// Pure validation shared by environment loading and explicitly injected transports.
export function parseSmtpConfig(input: SmtpInput): SmtpConfiguration {
  const config = {
    smtpHost: (input.smtpHost ?? 'smtp.gmail.com').trim(),
    smtpPort: input.smtpPort === undefined ? 587 : Number(input.smtpPort),
    smtpSecure: input.smtpSecure === true || input.smtpSecure === 'true',
    smtpUser: (input.smtpUser ?? '').trim(),
    smtpPass: input.smtpPass ?? '',
    smtpFrom: (input.smtpFrom ?? '"Co-Space Working" <no-reply@co-space.local>').trim(),
  };
  const issues: string[] = [];
  const hostname =
    /^(?=.{1,253}$)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  if (!isIP(config.smtpHost) && !hostname.test(config.smtpHost)) issues.push('SMTP_HOST');
  if (
    (typeof input.smtpPort === 'string' && !/^\d+$/.test(input.smtpPort)) ||
    !Number.isInteger(config.smtpPort) ||
    config.smtpPort < 1 ||
    config.smtpPort > 65535
  )
    issues.push('SMTP_PORT');
  if (
    input.smtpSecure !== undefined &&
    ![true, false, 'true', 'false'].includes(input.smtpSecure)
  ) {
    issues.push('SMTP_SECURE');
  }
  const hasUser = Boolean(config.smtpUser);
  const hasPass = Boolean(config.smtpPass.trim());
  if (hasUser !== hasPass) issues.push(hasUser ? 'SMTP_PASS' : 'SMTP_USER');
  if (/[\r\n\0]/.test(input.smtpUser ?? '')) issues.push('SMTP_USER');
  // Accept a single mailbox, with an optional display name. Never accept header injection.
  const mailbox = /^(?:[^<>\r\n]*<([^<>]+)>|([^<>]+))$/.exec(config.smtpFrom);
  const address = mailbox?.[1] ?? mailbox?.[2] ?? '';
  if (/[\r\n\0]/.test(input.smtpFrom ?? '') || !z.string().email().safeParse(address).success)
    issues.push('SMTP_FROM');
  return {
    status: issues.length ? 'invalid' : hasUser && hasPass ? 'ready' : 'unconfigured',
    issues: [...new Set(issues)],
    config,
  };
}

export function smtpConfigFromEnv(env: Record<string, string | undefined>): SmtpConfiguration {
  return parseSmtpConfig({
    smtpHost: env.SMTP_HOST,
    smtpPort: env.SMTP_PORT,
    smtpSecure: env.SMTP_SECURE,
    smtpUser: env.SMTP_USER || env.GMAIL_USER,
    smtpPass: env.SMTP_PASS || env.GMAIL_APP_PASSWORD,
    smtpFrom: env.SMTP_FROM || env.EMAIL_FROM,
  });
}
