import nodemailer from 'nodemailer';
import { config } from '../config/env';
import type { ChallengePurpose } from './challenge-purposes';

const transporter = nodemailer.createTransport({
  host: config.smtpHost,
  port: config.smtpPort,
  secure: config.smtpPort === 465,
  auth: {
    user: config.smtpUser,
    pass: config.smtpPass,
  },
});

const COPY: Record<ChallengePurpose, { subject: string; heading: string; intro: string }> = {
  register: {
    subject: 'Your PostMail sign-up code',
    heading: 'Verify your email',
    intro: 'Enter this code to finish creating your PostMail account.',
  },
  'set-password': {
    subject: 'Confirm your PostMail password change',
    heading: 'Confirm your password change',
    intro: 'Enter this code to confirm the change to your PostMail password.',
  },
  'password-reset': {
    subject: 'Reset your PostMail password',
    heading: 'Reset your password',
    intro: 'Enter this code to choose a new PostMail password.',
  },
  login: {
    subject: 'Your PostMail sign-in code',
    heading: "Confirm it's you",
    intro: 'Someone is signing in to your PostMail account from a new browser. If this is you, enter this code.',
  },
  'google-link': {
    subject: 'Confirm linking your account',
    heading: 'Link your Google account',
    intro: 'Enter this code to link Google sign-in to your PostMail account.',
  },
  'microsoft-link': {
    subject: 'Confirm linking your account',
    heading: 'Link your Microsoft account',
    intro: 'Enter this code to link Microsoft sign-in to your PostMail account.',
  },
};

function layout(body: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:40px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="440" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;box-shadow:0 1px 3px rgba(0,0,0,0.08);overflow:hidden;">
          <tr>
            <td style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">PostMail</h1>
              <p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.85);">Email Open Tracking</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">${body}</td>
          </tr>
          <tr>
            <td style="padding:20px 40px;background-color:#f9fafb;border-top:1px solid #f3f4f6;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">&copy; ${new Date().getFullYear()} PostMail &mdash; Email open tracking made simple.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function codeTemplate(purpose: ChallengePurpose, code: string): string {
  const copy = COPY[purpose];
  return layout(`
              <h2 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;">${copy.heading}</h2>
              <p style="margin:0 0 28px;font-size:14px;line-height:1.6;color:#6b7280;">
                ${copy.intro} This code is valid for <strong style="color:#374151;">10 minutes</strong>.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:20px 0;">
                    <div style="display:inline-block;background-color:#f9fafb;border:2px dashed #d1d5db;border-radius:12px;padding:20px 40px;">
                      <span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#111827;font-family:'Courier New',monospace;">${code}</span>
                    </div>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#9ca3af;">
                If you didn't request this, you can ignore this email. Nothing changes without the code.
              </p>`);
}

function passwordChangedTemplate(): string {
  const now = new Date();
  const date = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
  const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' });
  return layout(`
              <h2 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;text-align:center;">Password changed</h2>
              <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#6b7280;text-align:center;">
                Your PostMail account password was changed on ${date} at ${time}. You have been signed out everywhere else.
              </p>
              <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#9ca3af;">
                If you did not make this change, reset your password immediately from the PostMail sign-in page.
              </p>`);
}

export async function sendChallengeEmail(purpose: ChallengePurpose, to: string, code: string): Promise<void> {
  await transporter.sendMail({
    from: config.smtpFrom,
    to,
    subject: COPY[purpose].subject,
    html: codeTemplate(purpose, code),
  });
}

export async function sendPasswordChangedEmail(to: string): Promise<void> {
  await transporter.sendMail({
    from: config.smtpFrom,
    to,
    subject: 'Your PostMail password has been changed',
    html: passwordChangedTemplate(),
  });
}

/** Check the Gmail login at startup so a bad config shows up in the logs, not as a failed signup. */
export async function verifySmtp(): Promise<boolean> {
  if (!config.smtpUser || !config.smtpPass) {
    console.error('[PostMail API] SMTP not configured or unreachable:', 'SMTP_USER and SMTP_PASS must be set');
    return false;
  }
  try {
    await transporter.verify();
    console.log(`[PostMail API] SMTP ready (${config.smtpUser} via ${config.smtpHost}:${config.smtpPort})`);
    return true;
  } catch (error) {
    console.error('[PostMail API] SMTP not configured or unreachable:', (error as Error).message);
    return false;
  }
}
