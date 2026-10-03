import { OAuth2Client } from 'google-auth-library';
import { config } from '../config/env';
import type { LinkedMailbox } from '../db/models';

/** Bare Gmail OAuth client, for building consent URLs and exchanging codes. */
export function createGmailOAuthClient(): OAuth2Client {
  return new OAuth2Client(config.gmailClientId, config.gmailClientSecret, config.gmailRedirectUri);
}

/** OAuth client authorised as a linked Gmail mailbox; refreshed access tokens are persisted back to it. */
export function createAuthenticatedGmailClient(mailbox: LinkedMailbox): OAuth2Client {
  const client = createGmailOAuthClient();
  client.setCredentials({
    access_token: mailbox.accessToken,
    refresh_token: mailbox.refreshToken,
    expiry_date: mailbox.tokenExpiry?.getTime(),
  });

  // EventEmitter ignores the returned promise, so a throw here would be an
  // unhandled rejection — which terminates the process on Node 15+.
  client.on('tokens', async (tokens) => {
    try {
      const updates: Partial<{ accessToken: string; tokenExpiry: Date }> = {};
      if (tokens.access_token) updates.accessToken = tokens.access_token;
      if (tokens.expiry_date) updates.tokenExpiry = new Date(tokens.expiry_date);
      if (Object.keys(updates).length > 0) {
        await mailbox.update(updates);
      }
    } catch (error) {
      console.error('[PostMail API] Failed to persist refreshed Gmail token:', error);
    }
  });

  return client;
}
