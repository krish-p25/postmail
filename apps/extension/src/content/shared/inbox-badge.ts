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
          resolve(
            response.emails.map((e: any) => ({
              id: e.id,
              subject: e.subject || '',
              recipient: e.recipient,
              status: e.status,
              openCount: (e.opens || []).filter((o: any) => !o.dismissed).length,
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

  return badge;
}

export function isBadgeCurrent(badge: Element, tracked: TrackedEmailSummary): boolean {
  return (
    badge.getAttribute(BADGE_ATTR) === tracked.id &&
    badge.getAttribute('data-opens') === String(tracked.openCount)
  );
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
  `;
  document.head.appendChild(style);
}
