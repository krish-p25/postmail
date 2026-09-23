/**
 * The server POSTs to the stored webhook URL on every email open, so it must only
 * ever reach Discord's webhook API — never an arbitrary or internal address (SSRF).
 *
 * Checked on save (routes/settings.ts) and again before sending (services/notifications.ts),
 * so rows saved before this check existed are never used either.
 */
export function isDiscordWebhookUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 512) return false;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== 'https:' || url.port !== '' || url.username !== '' || url.password !== '') return false;
  // Exact hostname match: suffix/substring checks let look-alikes like discord.com.evil.com through.
  if (!DISCORD_HOSTS.has(url.hostname)) return false;
  if (!WEBHOOK_PATH.test(url.pathname) || url.hash !== '') return false;

  // Discord's own webhook options only (thread_id posts into a forum/thread channel).
  for (const [key, val] of url.searchParams) {
    if (key === 'thread_id' ? !/^\d{17,20}$/.test(val) : key !== 'wait' || !/^(true|false)$/.test(val)) return false;
  }
  return true;
}

export interface MaskedWebhook {
  /** Safe to display: the token is hidden except for its last 4 characters. */
  masked: string;
  /** False for URLs saved before validation existed; notifications skip these. */
  valid: boolean;
}

/**
 * The only form of a stored webhook the API ever returns. The token is a secret
 * (anyone holding it can post to the channel), so it never leaves the server.
 */
export function maskDiscordWebhookUrl(stored: string | null): MaskedWebhook | null {
  if (!stored) return null;
  if (!isDiscordWebhookUrl(stored)) return { masked: '••••••••', valid: false };

  const url = new URL(stored);
  const segments = url.pathname.split('/');
  const token = segments.pop()!;
  return { masked: `${url.origin}${segments.join('/')}/••••••••${token.slice(-4)}`, valid: true };
}

const DISCORD_HOSTS = new Set(['discord.com', 'ptb.discord.com', 'canary.discord.com', 'discordapp.com']);

/** /api[/vN]/webhooks/<snowflake id>/<token> — the form Discord's "Copy Webhook URL" produces. */
const WEBHOOK_PATH = /^\/api(?:\/v\d{1,2})?\/webhooks\/\d{17,20}\/[\w-]{60,100}$/;
