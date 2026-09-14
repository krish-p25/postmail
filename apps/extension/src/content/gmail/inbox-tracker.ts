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
import {
  OVERLAY_ATTR,
  injectOverlayStyles,
  createThreadOverlay,
  isOverlayCurrent,
} from './thread-overlay';
import { getSenderEmail } from './selectors';

/** Max time difference (ms) between sentAt and message date to consider a match. */
const DATE_MATCH_TOLERANCE_MS = 5 * 60 * 1000;

export class InboxTracker {
  /** Best match per subject — used for inbox row badges. */
  private emailMap = new Map<string, TrackedEmailSummary>();
  /** All tracked emails per subject — used for per-message thread overlays. */
  private threadEmails = new Map<string, TrackedEmailSummary[]>();
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
    this.threadEmails.clear();

    for (const email of emails) {
      if (email.status !== 'sent' || !email.subject) continue;
      const key = normalizeSubject(email.subject);

      // Best match for inbox badges
      const existing = this.emailMap.get(key);
      if (!existing || email.openCount > existing.openCount) {
        this.emailMap.set(key, email);
      }

      // All matches for per-message thread overlays
      const list = this.threadEmails.get(key) || [];
      list.push(email);
      this.threadEmails.set(key, list);
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

  // ── Per-message thread overlays ───────────────────────────────────

  private scanThread(): void {
    const subjectEl = document.querySelector(
      'h2[data-thread-perm-id], h2[data-legacy-thread-id], h2.hP'
    ) as HTMLElement | null;

    if (!subjectEl) {
      document.querySelectorAll(`[${OVERLAY_ATTR}]`).forEach((el) => el.remove());
      return;
    }

    const text = subjectEl.textContent?.trim();
    if (!text) return;

    const normalized = normalizeSubject(text);
    const trackedList = this.threadEmails.get(normalized);

    if (!trackedList || trackedList.length === 0) {
      document.querySelectorAll(`[${OVERLAY_ATTR}]`).forEach((el) => el.remove());
      return;
    }

    const messages = this.findThreadMessages();
    const currentEmail = getSenderEmail();
    const matched = new Set<string>();

    for (const msg of messages) {
      this.processThreadMessage(msg, trackedList, matched, currentEmail);
    }

    // Remove stale overlays that no longer correspond to a visible message
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
   * Match a single thread message to a tracked email and insert its overlay.
   * Only overlays messages sent by the current user (tracked emails are always sent).
   * Matches by date proximity (within 5 min of sentAt).
   */
  private processThreadMessage(
    msg: HTMLElement,
    trackedList: TrackedEmailSummary[],
    matched: Set<string>,
    currentEmail: string | null,
  ): void {
    // Only overlay messages sent by the current user
    if (currentEmail) {
      const senderEl = msg.querySelector('span.gD[email], span[email]');
      const sender = senderEl?.getAttribute('email')?.toLowerCase();
      if (sender && sender !== currentEmail.toLowerCase()) {
        msg.querySelector(`[${OVERLAY_ATTR}]`)?.remove();
        return;
      }
    }

    // Extract message date from the header
    const dateEl = msg.querySelector('span.g3 span[title], span.g3[title]');
    const dateStr = dateEl?.getAttribute('title');
    const msgDate = dateStr ? new Date(dateStr) : null;

    let trackedMatch: TrackedEmailSummary | null = null;

    if (msgDate && !isNaN(msgDate.getTime())) {
      // Match by closest sentAt within tolerance
      let bestDiff = Infinity;
      for (const tracked of trackedList) {
        if (matched.has(tracked.id)) continue;
        if (!tracked.sentAt) continue;
        const diff = Math.abs(msgDate.getTime() - new Date(tracked.sentAt).getTime());
        if (diff < DATE_MATCH_TOLERANCE_MS && diff < bestDiff) {
          bestDiff = diff;
          trackedMatch = tracked;
        }
      }
    }

    // Fallback: if only one unmatched tracked email remains, use it
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
