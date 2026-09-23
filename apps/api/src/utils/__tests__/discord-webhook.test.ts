import { isDiscordWebhookUrl, maskDiscordWebhookUrl } from '../discord-webhook';

const ID = '1234567890123456789';
const TOKEN = 'aBcD-eF_gH1234567890aBcD-eF_gH1234567890aBcD-eF_gH1234567890abcdefgh';

it('accepts webhook URLs on discord.com and its ptb/canary subdomains, plus legacy discordapp.com', () => {
  expect(isDiscordWebhookUrl(`https://discord.com/api/webhooks/${ID}/${TOKEN}`)).toBe(true);
  expect(isDiscordWebhookUrl(`https://ptb.discord.com/api/webhooks/${ID}/${TOKEN}`)).toBe(true);
  expect(isDiscordWebhookUrl(`https://canary.discord.com/api/webhooks/${ID}/${TOKEN}`)).toBe(true);
  expect(isDiscordWebhookUrl(`https://discordapp.com/api/webhooks/${ID}/${TOKEN}`)).toBe(true);
  expect(isDiscordWebhookUrl(`https://discord.com/api/v10/webhooks/${ID}/${TOKEN}`)).toBe(true);
});

it('rejects other hosts, including look-alikes and internal addresses', () => {
  expect(isDiscordWebhookUrl(`https://evil.com/api/webhooks/${ID}/${TOKEN}`)).toBe(false);
  expect(isDiscordWebhookUrl(`https://discord.com.evil.com/api/webhooks/${ID}/${TOKEN}`)).toBe(false);
  expect(isDiscordWebhookUrl(`https://evildiscord.com/api/webhooks/${ID}/${TOKEN}`)).toBe(false);
  expect(isDiscordWebhookUrl(`https://discord.com@evil.com/api/webhooks/${ID}/${TOKEN}`)).toBe(false);
  expect(isDiscordWebhookUrl(`http://shared-postgres:5432/api/webhooks/${ID}/${TOKEN}`)).toBe(false);
  expect(isDiscordWebhookUrl(`https://169.254.169.254/api/webhooks/${ID}/${TOKEN}`)).toBe(false);
});

it('rejects non-https, credentials, explicit ports and non-webhook paths', () => {
  expect(isDiscordWebhookUrl(`http://discord.com/api/webhooks/${ID}/${TOKEN}`)).toBe(false);
  expect(isDiscordWebhookUrl(`https://user:pass@discord.com/api/webhooks/${ID}/${TOKEN}`)).toBe(false);
  expect(isDiscordWebhookUrl(`https://discord.com:8443/api/webhooks/${ID}/${TOKEN}`)).toBe(false);
  expect(isDiscordWebhookUrl('https://discord.com/channels/123/456')).toBe(false);
  expect(isDiscordWebhookUrl(`https://discord.com/api/webhooks/${ID}`)).toBe(false);
  expect(isDiscordWebhookUrl(`https://discord.com/api/webhooks/not-a-number/${TOKEN}`)).toBe(false);
});

it("allows only Discord's own query options, and no fragment", () => {
  const base = `https://discord.com/api/webhooks/${ID}/${TOKEN}`;
  expect(isDiscordWebhookUrl(`${base}?thread_id=${ID}`)).toBe(true);
  expect(isDiscordWebhookUrl(`${base}?wait=true`)).toBe(true);
  expect(isDiscordWebhookUrl(`${base}?thread_id=abc`)).toBe(false);
  expect(isDiscordWebhookUrl(`${base}?redirect=https://evil.com`)).toBe(false);
  expect(isDiscordWebhookUrl(`${base}#x`)).toBe(false);
  expect(isDiscordWebhookUrl(`${base}/`)).toBe(false);
});

describe('maskDiscordWebhookUrl', () => {
  it('hides the token except its last 4 characters', () => {
    const masked = maskDiscordWebhookUrl(`https://discord.com/api/webhooks/${ID}/${TOKEN}?thread_id=${ID}`);
    expect(masked).toEqual({ masked: `https://discord.com/api/webhooks/${ID}/••••••••efgh`, valid: true });
    expect(masked!.masked).not.toContain(TOKEN.slice(0, -4));
  });

  it('reveals nothing of a legacy invalid URL, and flags it', () => {
    expect(maskDiscordWebhookUrl('http://internal:8080/secret-path')).toEqual({ masked: '••••••••', valid: false });
  });

  it('returns null when no webhook is saved', () => {
    expect(maskDiscordWebhookUrl(null)).toBeNull();
    expect(maskDiscordWebhookUrl('')).toBeNull();
  });
});

it('rejects non-strings, garbage and oversized input', () => {
  expect(isDiscordWebhookUrl(undefined)).toBe(false);
  expect(isDiscordWebhookUrl({ href: 'https://discord.com' })).toBe(false);
  expect(isDiscordWebhookUrl('not a url')).toBe(false);
  expect(isDiscordWebhookUrl(`https://discord.com/api/webhooks/${ID}/${'a'.repeat(600)}`)).toBe(false);
});
