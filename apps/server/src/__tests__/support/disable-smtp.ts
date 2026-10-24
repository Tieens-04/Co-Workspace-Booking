// Explicit empty values prevent dotenv from filling these with a developer's real account.
for (const key of ['SMTP_USER', 'SMTP_PASS', 'GMAIL_USER', 'GMAIL_APP_PASSWORD']) {
  process.env[key] = '';
}
process.env.SMTP_HOST = 'smtp.gmail.com';
process.env.SMTP_PORT = '587';
process.env.SMTP_SECURE = 'false';
process.env.SMTP_FROM = 'test@example.com';
process.env.EMAIL_FROM = '';
