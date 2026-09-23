/**
 * Live feedback for the Discord webhook field. The API is authoritative
 * (apps/api/src/utils/discord-webhook.ts) — keep these rules identical to it.
 */

const DISCORD_HOSTS = new Set(['discord.com', 'ptb.discord.com', 'canary.discord.com', 'discordapp.com']);
const WEBHOOK_PATH = /^\/api(?:\/v\d{1,2})?\/webhooks\/\d{17,20}\/[\w-]{60,100}$/;
const WHERE_TO_FIND = 'Copy it from Channel settings → Integrations → Webhooks.';

/** Returns what's wrong with the URL, or null if it's a valid webhook (or empty, which clears it). */
export function discordWebhookProblem(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  if (value.length > 512) return 'That URL is too long to be a Discord webhook.';

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'Paste the full webhook URL, starting with https://';
  }

  if (url.protocol !== 'https:') return 'Webhook URLs must start with https://';
  if (!DISCORD_HOSTS.has(url.hostname) || url.port !== '' || url.username !== '' || url.password !== '') {
    return `This isn't a Discord webhook URL. ${WHERE_TO_FIND}`;
  }
  if (!WEBHOOK_PATH.test(url.pathname)) {
    return url.pathname.startsWith('/channels/')
      ? `That's a link to a channel, not a webhook. ${WHERE_TO_FIND}`
      : `This Discord link isn't a complete webhook URL. ${WHERE_TO_FIND}`;
  }

  const badOption = [...url.searchParams].some(([key, val]) =>
    key === 'thread_id' ? !/^\d{17,20}$/.test(val) : key !== 'wait' || !/^(true|false)$/.test(val),
  );
  if (badOption || url.hash !== '') return 'Remove anything after the webhook token.';

  return null;
}
