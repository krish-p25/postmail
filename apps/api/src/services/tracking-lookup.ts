import { Op } from 'sequelize';
import { TrackedEmail, EmailOpen } from '../db/models';

const OPEN_ATTRIBUTES = ['id', 'opened_at', 'user_agent', 'ip_address', 'dismissed'] as const;

interface TrackingData {
  id: string;
  trackingToken: string;
  status: string;
  sentAt: string | null;
  opens: Array<{
    id: string;
    opened_at: string;
    user_agent: string | null;
    ip_address: string | null;
    dismissed: boolean;
  }>;
}

/**
 * Look up tracking data for a list of provider message IDs.
 * Returns a Map of messageId → tracking data (status + opens).
 */
export async function lookupTrackingByMessageIds(
  messageIds: string[],
  userId: string,
): Promise<Map<string, TrackingData>> {
  const map = new Map<string, TrackingData>();
  if (messageIds.length === 0) return map;

  const trackedEmails = await TrackedEmail.findAll({
    where: {
      messageId: { [Op.in]: messageIds },
      userId,
    },
    include: [
      {
        model: EmailOpen,
        as: 'opens',
        attributes: [...OPEN_ATTRIBUTES],
      },
    ],
  });

  for (const te of trackedEmails) {
    if (!te.messageId) continue;
    const data = te.toJSON() as any;
    map.set(te.messageId, {
      id: data.id,
      trackingToken: data.trackingToken,
      status: data.status,
      sentAt: data.sentAt,
      opens: data.opens || [],
    });
  }

  return map;
}
