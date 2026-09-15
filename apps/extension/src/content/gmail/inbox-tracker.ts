/**
 * Gmail Inbox Tracker
 *
 * Scans Gmail inbox/sent rows and badges tracked emails with their open status.
 * Uses MutationObserver to handle Gmail's SPA navigation.
 *
 * Matching strategy:
 *  - Thread view:  data-legacy-thread-id on the h2 heading → threadId lookup
 *  - Per-message:  data-legacy-message-id on message containers → messageId lookup
 *  - Inbox rows:   normalized subject (Gmail DOM does not expose API-compatible
 *                  thread IDs on inbox rows, so subject is the only option here)
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
import {
  OVERLAY_ATTR,
  injectOverlayStyles,
  createThreadOverlay,
  isOverlayCurrent,
} from './thread-overlay';

export class InboxTracker {
  /** Best match per normalized subject — used for inbox row badges. */
  private emailMap = new Map<string, TrackedEmailSummary>();
  /** Maps Gmail threadId → all tracked emails in that thread. */
  private threadIdMap = new Map<string, TrackedEmailSummary[]>();
  /** Maps Gmail messageId → tracked email. */
  private messageIdMap = new Map<string, TrackedEmailSummary>();
  private observer: MutationObserver | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  async start(): Promise<void> {
    injectBadgeStyles();
    injectOverlayStyles();
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
    this.threadIdMap.clear();
    this.messageIdMap.clear();

    for (const email of emails) {
      if (email.status !== 'sent' || !email.subject) continue;

      // Subject map for inbox row badges (Gmail DOM limitation)
      const key = normalizeSubject(email.subject);
      const existing = this.emailMap.get(key);
      if (!existing || email.openCount > existing.openCount) {
        this.emailMap.set(key, email);
      }

      // Thread ID map for thread-level matching
      if (email.threadId) {
        const list = this.threadIdMap.get(email.threadId) || [];
        list.push(email);
        this.threadIdMap.set(email.threadId, list);
      }

      // Message ID map for per-message matching
      if (email.messageId) {
        this.messageIdMap.set(email.messageId, email);
      }
    }

    this.scanRows();
    this.scanThread();
  }

  // ── Inbox row badges ──────────────────────────────────────────────

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

  // ── Per-message thread overlays (ID-based) ────────────────────────

  private scanThread(): void {
    const subjectEl = document.querySelector(
      'h2[data-thread-perm-id], h2[data-legacy-thread-id], h2.hP'
    ) as HTMLElement | null;

    if (!subjectEl) {
      document.querySelectorAll(`[${OVERLAY_ATTR}]`).forEach((el) => el.remove());
      return;
    }

    // Primary: match by thread ID from DOM attribute
    const legacyThreadId = subjectEl.getAttribute('data-legacy-thread-id');
    let trackedList = legacyThreadId ? this.threadIdMap.get(legacyThreadId) : undefined;

    // Fallback: match by subject (covers emails whose threadId hasn't been backfilled yet)
    if (!trackedList || trackedList.length === 0) {
      const text = subjectEl.textContent?.trim();
      if (text) {
        const normalized = normalizeSubject(text);
        // Collect all tracked emails matching this subject that have no threadId
        trackedList = [];
        for (const [, email] of this.emailMap) {
          if (email.subject && normalizeSubject(email.subject) === normalized) {
            trackedList.push(email);
          }
        }
      }
    }

    if (!trackedList || trackedList.length === 0) {
      document.querySelectorAll(`[${OVERLAY_ATTR}]`).forEach((el) => el.remove());
      return;
    }

    const messages = this.findThreadMessages();
    const matched = new Set<string>();

    for (const msg of messages) {
      this.processThreadMessage(msg, trackedList, matched);
    }

    // Remove stale overlays
    document.querySelectorAll(`[${OVERLAY_ATTR}]`).forEach((el) => {
      const id = el.getAttribute(OVERLAY_ATTR);
      if (!id || !matched.has(id)) el.remove();
    });
  }

  /**
   * Find individual expanded message containers in the thread view.
   * Walks up from each div.a3s (message body) to find the ancestor that
   * also contains sender (span.gD) and date (span.g3) elements.
   */
  private findThreadMessages(): HTMLElement[] {
    const bodies = document.querySelectorAll('div.a3s');
    const seen = new Set<HTMLElement>();
    const containers: HTMLElement[] = [];

    for (const body of bodies) {
      let el = body.parentElement;
      while (el && el !== document.body) {
        if (el.querySelector('span.gD') && el.querySelector('span.g3') && !seen.has(el)) {
          seen.add(el);
          containers.push(el);
          break;
        }
        el = el.parentElement;
      }
    }

    return containers;
  }

  /**
   * Match a single thread message to a tracked email by ID and insert its overlay.
   *
   * Strategy:
   *  1. Extract data-legacy-message-id or data-message-id from DOM → messageIdMap lookup
   *  2. Fallback: if only one unmatched tracked email remains in the thread, use it
   */
  private processThreadMessage(
    msg: HTMLElement,
    trackedList: TrackedEmailSummary[],
    matched: Set<string>,
  ): void {
    let trackedMatch: TrackedEmailSummary | null = null;

    // Primary: match by message ID from DOM
    const msgId = this.extractMessageId(msg);
    if (msgId) {
      const byId = this.messageIdMap.get(msgId);
      if (byId && !matched.has(byId.id)) {
        trackedMatch = byId;
      }
    }

    // Fallback: if only one unmatched tracked email in the thread, use it
    if (!trackedMatch) {
      const unmatched = trackedList.filter((t) => !matched.has(t.id));
      if (unmatched.length === 1) {
        trackedMatch = unmatched[0];
      }
    }

    const existing = msg.querySelector(`[${OVERLAY_ATTR}]`);

    if (!trackedMatch) {
      existing?.remove();
      return;
    }

    matched.add(trackedMatch.id);

    if (existing && isOverlayCurrent(existing, trackedMatch)) return;
    existing?.remove();

    const overlay = createThreadOverlay(trackedMatch);

    // Insert before the message body content
    const body = msg.querySelector('div.a3s') as HTMLElement;
    if (body) {
      const bodyWrapper = body.closest('div.ii') || body.parentElement;
      if (bodyWrapper) {
        bodyWrapper.insertAdjacentElement('beforebegin', overlay);
      }
    }
  }

  /**
   * Extract a Gmail API-compatible message ID from a message container.
   * Checks for data-legacy-message-id and data-message-id attributes
   * on the container and its descendants.
   */
  private extractMessageId(msg: HTMLElement): string | null {
    // Check the container itself
    const directId = msg.getAttribute('data-legacy-message-id')
      || msg.getAttribute('data-message-id');
    if (directId) return directId;

    // Check descendants for legacy message ID
    const el = msg.querySelector('[data-legacy-message-id], [data-message-id]');
    if (el) {
      return el.getAttribute('data-legacy-message-id')
        || el.getAttribute('data-message-id');
    }

    return null;
  }

  // ── DOM observer ──────────────────────────────────────────────────

  private observeDOM(): void {
    this.observer = new MutationObserver(() => {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.scanRows();
        this.scanThread();
      }, DEBOUNCE_MS);
    });
    this.observer.observe(document.body, { childList: true, subtree: true });
  }
}
