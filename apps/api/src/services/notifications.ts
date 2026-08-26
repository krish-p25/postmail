import TrackedEmail from '../db/models/TrackedEmail';
import EmailOpen from '../db/models/EmailOpen';
import UserSetting from '../db/models/UserSetting';

/**
 * Dispatch notifications for an email open event.
 * Iterates over enabled channels; errors are caught and logged so they never
 * block the pixel response.
 */
export async function notifyEmailOpened(
  trackedEmail: TrackedEmail,
  open: EmailOpen,
): Promise<void> {
  try {
    const settings = await UserSetting.findOne({
      where: { userId: trackedEmail.userId },
    });
    if (!settings) return;

    const channels: Array<() => Promise<void>> = [];

    if (settings.discordWebhookUrl) {
      channels.push(() =>
        sendDiscordNotification(settings.discordWebhookUrl!, trackedEmail, open),
      );
    }

    await Promise.allSettled(channels.map((ch) => ch()));
  } catch (err) {
    console.error('[PostMail Notifications] Failed to dispatch:', err);
  }
}

async function sendDiscordNotification(
  webhookUrl: string,
  trackedEmail: TrackedEmail,
  open: EmailOpen,
): Promise<void> {
  const embed = {
    embeds: [
      {
        title: '📬 Email Opened',
        color: 0x22c55e, // green-500
        fields: [
          { name: 'Subject', value: trackedEmail.subject || '(no subject)', inline: false },
          { name: 'Recipient', value: trackedEmail.recipient || '(unknown)', inline: true },
          { name: 'Opened At', value: new Date(open.openedAt).toLocaleString(), inline: true },
          { name: 'User Agent', value: truncate(open.userAgent || 'Unknown', 100), inline: false },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  };

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(embed),
  });

  if (!res.ok) {
    console.error(`[PostMail Notifications] Discord webhook failed: ${res.status}`);
  }
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}
