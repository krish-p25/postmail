/**
 * Gmail Inbox Tracker
 *
 * Scans Gmail inbox/sent rows and badges tracked emails with their open status.
 * Matches by normalized subject against the PostMail tracked emails API.
 * Uses MutationObserver to handle Gmail's SPA navigation.
 */

import { ExtensionMessage } from '../../shared/messaging';

interface TrackedEmailSummary {
  id: string;
  subject: string;
  recipient: string | null;
  status: string;
  openCount: number;
}

interface BadgeConfig {
  label: string;
  variant: 'tracked' | 'opened';
}

const BADGE_ATTR = 'data-postmail-badge';
const REFRESH_INTERVAL_MS = 60_000;
const DEBOUNCE_MS = 300;
const BRAND_COLOR = '#4f46e5';
const GREEN = '#16a34a';

/**
 * Normalize a subject line for matching.
 * Strips Re:/Fwd:/FW: prefixes (including nested), trims, lowercases.
 */
function normalizeSubject(subject: string): string {
  let s = subject.trim();
  let prev = '';
  while (s !== prev) {
    prev = s;
    s = s.replace(/^(re|fwd?|fw)\s*:\s*/i, '');
  }
  return s.toLowerCase();
}

function buildBadgeConfig(openCount: number): BadgeConfig {
  if (openCount > 0) {
    return { label: 'Opened', variant: 'opened' };
  }
  return { label: 'Tracked', variant: 'tracked' };
}

export class InboxTracker {
  private emailMap = new Map<string, TrackedEmailSummary>();
  private observer: MutationObserver | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  async start(): Promise<void> {
    this.injectStyles();
    await this.refresh();
    this.observeDOM();
    this.refreshTimer = setInterval(() => this.refresh(), REFRESH_INTERVAL_MS);
  }

  stop(): void {
    this.observer?.disconnect();
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
  }

  private async refresh(): Promise<void> {
    const emails = await this.fetchTrackedEmails();
    this.emailMap.clear();

    for (const email of emails) {
      if (email.status !== 'sent' || !email.subject) continue;
      const key = normalizeSubject(email.subject);
      const existing = this.emailMap.get(key);
      // Keep the entry with the most opens per normalized subject
      if (!existing || email.openCount > existing.openCount) {
        this.emailMap.set(key, email);
      }
    }

    this.scanRows();
  }

  private fetchTrackedEmails(): Promise<TrackedEmailSummary[]> {
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

  private scanRows(): void {
    const rows = document.querySelectorAll('tr.zA');
    for (const row of rows) {
      this.processRow(row as HTMLElement);
    }
  }

  private processRow(row: HTMLElement): void {
    const existingBadge = row.querySelector(`[${BADGE_ATTR}]`);

    // Extract subject text from the row
    const subjectEl = row.querySelector('span.bqe, span.bog, span.bof') as HTMLElement;
    if (!subjectEl) return;

    const subjectText = subjectEl.textContent?.trim();
    if (!subjectText) return;

    const normalized = normalizeSubject(subjectText);
    const tracked = this.emailMap.get(normalized);

    if (!tracked) {
      existingBadge?.remove();
      return;
    }

    // Skip if badge is already up-to-date
    if (existingBadge) {
      if (
        existingBadge.getAttribute(BADGE_ATTR) === tracked.id &&
        existingBadge.getAttribute('data-opens') === String(tracked.openCount)
      ) {
        return;
      }
      existingBadge.remove();
    }

    const config = buildBadgeConfig(tracked.openCount);
    if (!config.label) return;

    const badge = document.createElement('span');
    badge.setAttribute(BADGE_ATTR, tracked.id);
    badge.setAttribute('data-opens', String(tracked.openCount));
    badge.className = `postmail-inbox-badge postmail-${config.variant}`;

    const textSpan = document.createElement('span');
    textSpan.textContent = config.label;
    badge.appendChild(textSpan);

    subjectEl.before(badge);
  }

  private observeDOM(): void {
    this.observer = new MutationObserver(() => {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => this.scanRows(), DEBOUNCE_MS);
    });
    this.observer.observe(document.body, { childList: true, subtree: true });
  }

  private injectStyles(): void {
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
}
