/**
 * Shared inbox badge utilities for Gmail and Outlook inbox trackers.
 * Provides subject normalization, badge config, email fetching, and CSS styles.
 */

import { ExtensionMessage } from '../../shared/messaging';

export interface TrackedEmailSummary {
  id: string;
  subject: string;
  recipient: string | null;
  status: string;
  openCount: number;
  sentAt: string | null;
  trackingToken: string;
  messageId: string | null;
  threadId: string | null;
  conversationId: string | null;
  opens: { opened_at: string; ip_address: string | null; user_agent: string | null; likely_self: boolean }[];
}

export interface BadgeConfig {
  label: string;
  variant: 'tracked' | 'opened';
}

export const BADGE_ATTR = 'data-postmail-badge';
export const REFRESH_INTERVAL_MS = 60_000;
export const DEBOUNCE_MS = 300;

const GREEN = '#16a34a';

/**
 * Normalize a subject line for matching.
 * Strips Re:/Fwd:/FW: prefixes (including nested), trims, lowercases.
 */
export function normalizeSubject(subject: string): string {
  let s = subject.trim();
  let prev = '';
  while (s !== prev) {
    prev = s;
    s = s.replace(/^(re|fwd?|fw)\s*:\s*/i, '');
  }
  return s.toLowerCase();
}

export function buildBadgeConfig(openCount: number): BadgeConfig {
  if (openCount > 0) {
    return { label: 'Opened', variant: 'opened' };
  }
  return { label: 'Tracked', variant: 'tracked' };
}

export function fetchTrackedEmails(): Promise<TrackedEmailSummary[]> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(
        { type: 'GET_TRACKED_EMAILS' } as ExtensionMessage,
        (response) => {
          if (chrome.runtime.lastError || !response?.emails) {
            resolve([]);
            return;
          }
          const nonDismissed = (opens: any[]) => (opens || []).filter((o: any) => !o.dismissed);
          resolve(
            response.emails.map((e: any) => ({
              id: e.id,
              subject: e.subject || '',
              recipient: e.recipient,
              status: e.status,
              openCount: nonDismissed(e.opens).length,
              sentAt: e.sentAt || null,
              trackingToken: e.trackingToken || '',
              messageId: e.messageId || null,
              threadId: e.threadId || null,
              conversationId: e.conversationId || null,
              opens: nonDismissed(e.opens).map((o: any) => ({
                opened_at: o.opened_at,
                ip_address: o.ip_address || null,
                user_agent: o.user_agent || null,
                likely_self: o.likely_self === true,
              })),
            })),
          );
        },
      );
    } catch {
      resolve([]);
    }
  });
}

export function createBadgeElement(tracked: TrackedEmailSummary): HTMLSpanElement {
  const config = buildBadgeConfig(tracked.openCount);
  const badge = document.createElement('span');
  badge.setAttribute(BADGE_ATTR, tracked.id);
  badge.setAttribute('data-opens', String(tracked.openCount));
  badge.className = `postmail-inbox-badge postmail-${config.variant}`;

  const textSpan = document.createElement('span');
  textSpan.textContent = config.label;
  badge.appendChild(textSpan);

  if (tracked.opens.length > 0) {
    const sorted = [...tracked.opens].sort((a, b) => new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime());
    const times = sorted.map((o) => {
      const d = new Date(o.opened_at);
      const time = d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
      return o.likely_self ? `${time} (likely you)` : time;
    });
    badge.title = `Opened ${times.length}x:\n${times.join('\n')}`;
  }

  return badge;
}

export const READING_BADGE_ATTR = 'data-postmail-reading-badge';

export function parseDevice(ua: string | null): string {
  if (!ua) return 'Unknown device';
  let browser = 'Unknown';
  if (ua.includes('Edg')) browser = 'Edge';
  else if (ua.includes('Chrome')) browser = 'Chrome';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Safari')) browser = 'Safari';

  let os = '';
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Macintosh') || ua.includes('Mac OS')) os = 'Mac';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  else if (ua.includes('Linux')) os = 'Linux';

  return os ? `${browser} on ${os}` : browser;
}

export function isBadgeCurrent(badge: Element, tracked: TrackedEmailSummary): boolean {
  return (
    badge.getAttribute(BADGE_ATTR) === tracked.id &&
    badge.getAttribute('data-opens') === String(tracked.openCount)
  );
}

/** Number of opens labelled "Likely you"; part of the overlay/badge freshness check. */
export function likelySelfCount(tracked: TrackedEmailSummary): number {
  return tracked.opens.filter((o) => o.likely_self).length;
}

/** Small "Likely you" pill used in thread overlays and reading-pane badges. */
export function createLikelyYouTag(): HTMLSpanElement {
  const tag = document.createElement('span');
  tag.className = 'postmail-likely-you';
  tag.textContent = 'Likely you';
  tag.title = 'Opened in a browser signed in to one of your linked mailboxes';
  return tag;
}

export function injectBadgeStyles(): void {
  if (document.getElementById('postmail-inbox-styles')) return;
  const style = document.createElement('style');
  style.id = 'postmail-inbox-styles';
  style.textContent = `
    @keyframes postmail-enter-tracked {
      0% { transform: scaleX(0) scaleY(0.4); background: #7c3aed; }
      40% { transform: scaleX(1) scaleY(0.4); background: #7c3aed; }
      60% { transform: scaleX(1) scaleY(1); background: #7c3aed; }
      100% { transform: scaleX(1) scaleY(1); background: #ede9fe; }
    }
    @keyframes postmail-enter-opened {
      0% { transform: scaleX(0) scaleY(0.4); background: ${GREEN}; }
      40% { transform: scaleX(1) scaleY(0.4); background: ${GREEN}; }
      60% { transform: scaleX(1) scaleY(1); background: ${GREEN}; }
      100% { transform: scaleX(1) scaleY(1); background: #dcfce7; }
    }
    .postmail-inbox-badge {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      margin-right: 8px;
      padding: 1px 8px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 500;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      white-space: nowrap;
      line-height: 18px;
      transform-origin: center center;
    }
    .postmail-inbox-badge.postmail-tracked {
      background: #ede9fe;
      color: #7c3aed;
      animation: postmail-enter-tracked 0.5s ease-out both;
    }
    .postmail-inbox-badge.postmail-opened {
      background: #dcfce7;
      color: ${GREEN};
      animation: postmail-enter-opened 0.5s ease-out both;
    }
    @keyframes postmail-reading-in {
      from { opacity: 0; transform: translateY(-8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .postmail-reading-badge {
      padding: 14px 18px;
      border-radius: 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      animation: postmail-reading-in 0.3s ease-out both;
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.03);
      width: 100%;
      box-sizing: border-box;
      margin: 8px 0 12px;
    }
    .postmail-reading-badge.postmail-reading-tracked {
      background: rgba(237, 233, 254, 0.72);
      border: 1px solid rgba(167, 139, 250, 0.3);
    }
    .postmail-reading-badge.postmail-reading-opened {
      background: rgba(220, 252, 231, 0.72);
      border: 1px solid rgba(74, 222, 128, 0.3);
    }
    .postmail-reading-badge .postmail-reading-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .postmail-reading-badge .postmail-reading-status-text {
      font-size: 13px;
      font-weight: 600;
      line-height: 1.3;
    }
    .postmail-reading-tracked .postmail-reading-status-text { color: #6d28d9; }
    .postmail-reading-opened .postmail-reading-status-text { color: #15803d; }
    .postmail-reading-badge .postmail-open-list {
      margin-top: 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .postmail-reading-badge .postmail-open-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      line-height: 16px;
    }
    .postmail-reading-tracked .postmail-open-row { color: #6d28d9; }
    .postmail-reading-opened .postmail-open-row { 
      color: #15803d;
      justify-content: space-between;
      border-bottom: 1px dotted #15803d;
    }
    .postmail-reading-badge .postmail-open-row .postmail-open-time {
      font-weight: 500;
    }
    .postmail-reading-badge .postmail-open-row .postmail-open-sep {
      opacity: 0.4;
    }
    .postmail-reading-badge .postmail-open-row .postmail-open-device {
      opacity: 0.7;
    }
    .postmail-likely-you {
      display: inline-block;
      margin-left: 6px;
      padding: 0 6px;
      border-radius: 9999px;
      background: #fef3c7;
      color: #b45309;
      font-size: 10px;
      font-weight: 600;
      line-height: 16px;
      vertical-align: middle;
    }
  `;
  document.head.appendChild(style);
}
