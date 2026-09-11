/**
 * Outlook Inbox Tracker
 *
 * Scans Outlook Web message list rows and badges tracked emails with their
 * open status. Uses role/aria selectors since Outlook uses obfuscated class
 * names. Matches by normalized subject against the PostMail tracked emails API.
 * Uses MutationObserver to handle Outlook's SPA navigation and virtualized list.
 */

import {
  TrackedEmailSummary,
  BADGE_ATTR,
  REFRESH_INTERVAL_MS,
  DEBOUNCE_MS,
  normalizeSubject,
  fetchTrackedEmails,
  createBadgeElement,
  isBadgeCurrent,
  injectBadgeStyles,
} from '../shared/inbox-badge';

/** Selectors for message list rows — tried in order. */
const ROW_SELECTORS = [
  'div[role="option"]',
  'div[role="listitem"]',
];

export class OutlookInboxTracker {
  private emailMap = new Map<string, TrackedEmailSummary>();
  private observer: MutationObserver | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  async start(): Promise<void> {
    injectBadgeStyles();
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
    const emails = await fetchTrackedEmails();
    this.emailMap.clear();

    for (const email of emails) {
      if (email.status !== 'sent' || !email.subject) continue;
      const key = normalizeSubject(email.subject);
      const existing = this.emailMap.get(key);
      if (!existing || email.openCount > existing.openCount) {
        this.emailMap.set(key, email);
      }
    }

    this.scanRows();
  }

  private scanRows(): void {
    for (const selector of ROW_SELECTORS) {
      const rows = document.querySelectorAll(selector);
      if (rows.length > 0) {
        for (const row of rows) {
          this.processRow(row as HTMLElement);
        }
        return;
      }
    }
  }

  private processRow(row: HTMLElement): void {
    const existingBadge = row.querySelector(`[${BADGE_ATTR}]`);

    const subject = this.findSubjectInRow(row);
    if (!subject) {
      existingBadge?.remove();
      return;
    }

    const normalized = normalizeSubject(subject.text);
    const tracked = this.emailMap.get(normalized);

    if (!tracked) {
      existingBadge?.remove();
      return;
    }

    if (existingBadge) {
      if (isBadgeCurrent(existingBadge, tracked)) return;
      existingBadge.remove();
    }

    const badge = createBadgeElement(tracked);
    subject.element.before(badge);
  }

  /**
   * Find the subject text element within an Outlook message row.
   * Tries multiple strategies since Outlook uses obfuscated class names.
   */
  private findSubjectInRow(row: HTMLElement): { element: HTMLElement; text: string } | null {
    // Strategy 1: span with title attribute matching a tracked subject
    const titledSpans = row.querySelectorAll('span[title]');
    for (const span of titledSpans) {
      const title = span.getAttribute('title') || '';
      if (!title || title.includes('@')) continue; // skip email addresses
      const normalized = normalizeSubject(title);
      if (this.emailMap.has(normalized)) {
        return { element: span as HTMLElement, text: title };
      }
    }

    // Strategy 2: scan all spans for text matching a tracked subject
    const allSpans = row.querySelectorAll('span');
    for (const span of allSpans) {
      // Skip if this span has child elements (we want leaf text nodes)
      if (span.children.length > 0) continue;
      const text = span.textContent?.trim();
      if (!text || text.length < 3) continue;
      const normalized = normalizeSubject(text);
      if (this.emailMap.has(normalized)) {
        return { element: span as HTMLElement, text };
      }
    }

    return null;
  }

  private observeDOM(): void {
    this.observer = new MutationObserver(() => {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => this.scanRows(), DEBOUNCE_MS);
    });
    this.observer.observe(document.body, { childList: true, subtree: true });
  }
}
