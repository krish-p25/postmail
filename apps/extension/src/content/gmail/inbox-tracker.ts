/**
 * Gmail Inbox Tracker
 *
 * Scans Gmail inbox/sent rows and badges tracked emails with their open status.
 * Matches by normalized subject against the PostMail tracked emails API.
 * Uses MutationObserver to handle Gmail's SPA navigation.
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

export class InboxTracker {
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
    const rows = document.querySelectorAll('tr.zA');
    for (const row of rows) {
      this.processRow(row as HTMLElement);
    }
  }

  private processRow(row: HTMLElement): void {
    const existingBadge = row.querySelector(`[${BADGE_ATTR}]`);

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

    if (existingBadge) {
      if (isBadgeCurrent(existingBadge, tracked)) return;
      existingBadge.remove();
    }

    const badge = createBadgeElement(tracked);
    subjectEl.before(badge);
  }

  private observeDOM(): void {
    this.observer = new MutationObserver(() => {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => this.scanRows(), DEBOUNCE_MS);
    });
    this.observer.observe(document.body, { childList: true, subtree: true });
  }
}
