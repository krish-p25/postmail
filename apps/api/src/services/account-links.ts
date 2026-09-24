import { Op } from 'sequelize';
import { sequelize } from '../db/sequelize';
import { PendingAccountLink } from '../db/models';
import type { LinkProvider } from '../db/models/PendingAccountLink';

/**
 * Bridges an OAuth callback (POST /auth/google or /auth/microsoft) to the
 * password-confirmation step (POST /auth/google/link or /auth/microsoft/link)
 * without ever putting the OAuth token(s) in the browser.
 *
 * The browser only ever holds this row's id — a random UUID with no more
 * sensitivity than an EmailChallenge id, since actually completing the link
 * still requires the account's password. See docs/security-review.md #4.
 */

const LINK_TTL_MS = 10 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createPendingLink(input: {
  provider: LinkProvider;
  userId: string;
  payload: Record<string, unknown>;
}): Promise<string> {
  // Opportunistic cleanup, same as createChallenge(): no cron job, just never
  // let expired rows pile up on the write path that already touches this table.
  await PendingAccountLink.destroy({ where: { expiresAt: { [Op.lt]: new Date() } } });

  const link = await PendingAccountLink.create({
    provider: input.provider,
    userId: input.userId,
    payload: input.payload,
    expiresAt: new Date(Date.now() + LINK_TTL_MS),
  });
  return link.id;
}

interface ConsumedLink {
  userId: string;
  payload: Record<string, unknown>;
}

interface PendingLinkRow {
  user_id: string;
  payload: Record<string, unknown>;
}

/**
 * Single-use: deletes the row as it reads it, so a link id can't be replayed
 * and a lost race (two concurrent /link requests) leaves only one winner.
 * Returns null for a missing, expired, or wrong-provider id.
 */
export async function consumePendingLink(id: unknown, provider: LinkProvider): Promise<ConsumedLink | null> {
  if (typeof id !== 'string' || !UUID_RE.test(id)) return null;

  const [rows] = (await sequelize.query(
    `DELETE FROM pending_account_links
      WHERE id = :id AND provider = :provider AND expires_at > now()
      RETURNING user_id, payload`,
    { replacements: { id, provider } },
  )) as [PendingLinkRow[], unknown];

  if (rows.length === 0) return null;
  return { userId: rows[0].user_id, payload: rows[0].payload ?? {} };
}
