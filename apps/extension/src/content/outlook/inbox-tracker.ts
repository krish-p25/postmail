/**
 * Outlook Inbox Tracker
 *
 * Scans Outlook Web message list rows and badges tracked emails with their
 * open status. Uses role/aria selectors since Outlook uses obfuscated class
 * names. Matches by normalized subject against the PostMail tracked emails API.
 * Uses MutationObserver to handle Outlook's SPA navigation and virtualized list.
 *
 * Handles two views:
 *  1. Inbox rows (role="option") — shows badge for latest tracked email in thread
 *  2. Expanded thread items (role="listitem" inside expansion wrapper) — matches
 *     individual messages by timestamp proximity to sentAt
 */

import {
  TrackedEmailSummary,
  BADGE_ATTR,
  READING_BADGE_ATTR,
  REFRESH_INTERVAL_MS,
  DEBOUNCE_MS,
  normalizeSubject,
  fetchTrackedEmails,
  createBadgeElement,
  isBadgeCurrent,
  injectBadgeStyles,
  buildBadgeConfig,
  parseDevice,
} from '../shared/inbox-badge';

/** Selectors for top-level message list rows. */
const ROW_SELECTORS = [
  'div[role="option"]',
  'div[role="listitem"]',
];

/** Max time difference (ms) between sentAt and displayed date to consider a match. */
const DATE_MATCH_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Parse Outlook's date title format: "Day M/D/YYYY H:MM AM/PM"
 * e.g. "Tue 9/8/2026 10:48 PM"
 */
function parseOutlookDate(dateStr: string): Date | null {
  const match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;
  const [, month, day, year, hours, minutes, ampm] = match;
  let h = parseInt(hours);
  if (ampm.toUpperCase() === 'PM' && h !== 12) h += 12;
  if (ampm.toUpperCase() === 'AM' && h === 12) h = 0;
  return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), h, parseInt(minutes));
}

export class OutlookInboxTracker {
  /** Maps normalized subject → all tracked emails with that subject. */
  private emailMap = new Map<string, TrackedEmailSummary[]>();
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
      const list = this.emailMap.get(key) || [];
      list.push(email);
      this.emailMap.set(key, list);
    }

    this.scan();
  }

  private scan(): void {
    this.scanInboxRows();
    this.scanThreadItems();
    this.scanReadingPane();
  }

  // ── Inbox rows (top-level) ──────────────────────────────────────────

  private scanInboxRows(): void {
    for (const selector of ROW_SELECTORS) {
      const rows = document.querySelectorAll(selector);
      if (rows.length > 0) {
        for (const row of rows) {
          this.processInboxRow(row as HTMLElement);
        }
        return;
      }
    }
  }

  private processInboxRow(row: HTMLElement): void {
    // Only process direct badge on this row, not badges in nested thread items
    const existingBadge = this.directBadge(row);

    const subject = this.findSubjectInRow(row);
    if (!subject) {
      existingBadge?.remove();
      return;
    }

    const normalized = normalizeSubject(subject.text);
    const tracked = this.getLatestTracked(normalized);

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

  /** Get the most recently sent tracked email for a given normalized subject. */
  private getLatestTracked(key: string): TrackedEmailSummary | null {
    const list = this.emailMap.get(key);
    if (!list || list.length === 0) return null;
    return list.reduce((latest, e) => {
      const latestTime = latest.sentAt ? new Date(latest.sentAt).getTime() : 0;
      const eTime = e.sentAt ? new Date(e.sentAt).getTime() : 0;
      return eTime > latestTime ? e : latest;
    });
  }

  /**
   * Find the subject text element within an Outlook inbox row.
   * Tries multiple strategies since Outlook uses obfuscated class names.
   */
  private findSubjectInRow(row: HTMLElement): { element: HTMLElement; text: string } | null {
    // Strategy 1: span with title attribute matching a tracked subject
    const titledSpans = row.querySelectorAll('span[title]');
    for (const span of titledSpans) {
      const title = span.getAttribute('title') || '';
      if (!title || title.includes('@') || title.includes('/')) continue;
      const normalized = normalizeSubject(title);
      if (this.emailMap.has(normalized)) {
        return { element: span as HTMLElement, text: title };
      }
    }

    // Strategy 2: scan all leaf spans for text matching a tracked subject
    const allSpans = row.querySelectorAll('span');
    for (const span of allSpans) {
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

  // ── Expanded thread items ───────────────────────────────────────────

  private scanThreadItems(): void {
    // Find all expanded thread containers (wrapper around thread item list)
    const wrappers = document.querySelectorAll('[id$="_itemPartWrapper"]');
    for (const wrapper of wrappers) {
      // Walk up to find the parent option row to get the thread subject
      const optionRow = wrapper.closest('div[role="option"]');
      if (!optionRow) continue;

      const threadSubject = this.findSubjectInRow(optionRow as HTMLElement);
      if (!threadSubject) continue;

      const normalizedSubject = normalizeSubject(threadSubject.text);
      const trackedList = this.emailMap.get(normalizedSubject);
      if (!trackedList || trackedList.length === 0) continue;

      const items = wrapper.querySelectorAll('div[role="listitem"]');
      for (const item of items) {
        this.processThreadItem(item as HTMLElement, trackedList);
      }
    }
  }

  private processThreadItem(item: HTMLElement, trackedList: TrackedEmailSummary[]): void {
    const existingBadge = item.querySelector(`[${BADGE_ATTR}]`);

    // Extract date from the item's date span (span[title] with date pattern)
    const itemDate = this.extractDateFromItem(item);
    if (!itemDate) {
      existingBadge?.remove();
      return;
    }

    // Match to a tracked email by timestamp proximity
    const matched = this.matchByDate(itemDate, trackedList);
    if (!matched) {
      existingBadge?.remove();
      return;
    }

    if (existingBadge) {
      if (isBadgeCurrent(existingBadge, matched)) return;
      existingBadge.remove();
    }

    const badge = createBadgeElement(matched);

    // Insert badge before the preview text — find the date span's parent
    // and insert before its first child (the preview text div)
    const dateSpan = this.findDateSpan(item);
    if (dateSpan?.parentElement) {
      const container = dateSpan.parentElement;
      const firstChild = container.firstElementChild;
      if (firstChild && firstChild !== dateSpan) {
        firstChild.before(badge);
      } else {
        container.prepend(badge);
      }
    }
  }

  /** Find a span whose title contains an Outlook date pattern. */
  private findDateSpan(item: HTMLElement): HTMLElement | null {
    const spans = item.querySelectorAll('span[title]');
    for (const span of spans) {
      const title = span.getAttribute('title') || '';
      if (/\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s*(AM|PM)/i.test(title)) {
        return span as HTMLElement;
      }
    }
    return null;
  }

  /** Extract a Date from the thread item's date span title attribute. */
  private extractDateFromItem(item: HTMLElement): Date | null {
    const span = this.findDateSpan(item);
    if (!span) return null;
    return parseOutlookDate(span.getAttribute('title') || '');
  }

  /** Find the tracked email whose sentAt is closest to the item's date. */
  private matchByDate(itemDate: Date, trackedList: TrackedEmailSummary[]): TrackedEmailSummary | null {
    let bestMatch: TrackedEmailSummary | null = null;
    let bestDiff = Infinity;

    for (const email of trackedList) {
      if (!email.sentAt) continue;
      const sentDate = new Date(email.sentAt);
      const diff = Math.abs(sentDate.getTime() - itemDate.getTime());
      if (diff < DATE_MATCH_TOLERANCE_MS && diff < bestDiff) {
        bestMatch = email;
        bestDiff = diff;
      }
    }

    return bestMatch;
  }

  // ── Reading pane (conversation view) ─────────────────────────────────

  private scanReadingPane(): void {
    const convContainer = document.getElementById('ConversationReadingPaneContainer');
    if (!convContainer) return;

    // Get conversation subject from CONV_*_SUBJECT
    const convSubject = convContainer.querySelector('[id*="CONV_"][id$="_SUBJECT"]')
      || convContainer.querySelector('[id$="_SUBJECT"]');
    const subjectText = convSubject?.textContent?.trim();
    if (!subjectText) return;

    const normalized = normalizeSubject(subjectText);
    const trackedList = this.emailMap.get(normalized);
    if (!trackedList || trackedList.length === 0) return;

    // Find all expanded messages in the reading pane
    const messages = convContainer.querySelectorAll('[aria-label="Email message"]');
    for (const msg of messages) {
      this.processReadingPaneMessage(msg as HTMLElement, trackedList);
    }
  }

  private processReadingPaneMessage(msg: HTMLElement, trackedList: TrackedEmailSummary[]): void {
    const existingBadge = msg.querySelector(`[${READING_BADGE_ATTR}]`);

    // Get date from MSG_*_DATETIME element
    const dateEl = msg.querySelector('[id$="_DATETIME"]');
    if (!dateEl) {
      existingBadge?.remove();
      return;
    }
    const msgDate = parseOutlookDate(dateEl.textContent?.trim() || '');
    if (!msgDate) {
      existingBadge?.remove();
      return;
    }

    const matched = this.matchByDate(msgDate, trackedList);
    if (!matched) {
      existingBadge?.remove();
      return;
    }

    if (existingBadge) {
      if (isBadgeCurrent(existingBadge, matched)) return;
      existingBadge.remove();
    }

    // Build the reading pane badge with open details
    const container = this.createReadingPaneBadge(matched);

    // Insert after the TO line or after the DATETIME element
    const toEl = msg.querySelector('[id$="_TO"]');
    const insertAfter = toEl || dateEl;
    if (insertAfter?.parentElement) {
      insertAfter.parentElement.insertBefore(container, insertAfter.nextSibling);
    }
  }

  private createReadingPaneBadge(tracked: TrackedEmailSummary): HTMLDivElement {
    const config = buildBadgeConfig(tracked.openCount);
    const container = document.createElement('div');
    container.className = 'postmail-reading-badge';
    container.setAttribute(READING_BADGE_ATTR, tracked.id);
    container.setAttribute('data-opens', String(tracked.openCount));

    // Badge pill
    const pill = document.createElement('span');
    pill.className = `postmail-inbox-badge postmail-${config.variant}`;
    pill.style.animation = 'none';
    const pillText = document.createElement('span');
    pillText.textContent = config.label;
    pill.appendChild(pillText);
    container.appendChild(pill);

    // Open details list
    if (tracked.opens.length > 0) {
      const list = document.createElement('div');
      list.className = 'postmail-open-list';

      for (const open of tracked.opens) {
        const row = document.createElement('div');
        row.className = 'postmail-open-row';

        const time = document.createElement('span');
        time.className = 'postmail-open-time';
        const d = new Date(open.opened_at);
        time.textContent = d.toLocaleString(undefined, {
          month: 'short', day: 'numeric',
          hour: 'numeric', minute: '2-digit',
        });
        row.appendChild(time);

        if (open.ip_address) {
          const dot1 = document.createElement('span');
          dot1.className = 'postmail-open-dot';
          dot1.textContent = '·';
          row.appendChild(dot1);
          const ip = document.createElement('span');
          ip.textContent = open.ip_address;
          row.appendChild(ip);
        }

        if (open.user_agent) {
          const dot2 = document.createElement('span');
          dot2.className = 'postmail-open-dot';
          dot2.textContent = '·';
          row.appendChild(dot2);
          const device = document.createElement('span');
          device.textContent = parseDevice(open.user_agent);
          row.appendChild(device);
        }

        list.appendChild(row);
      }
      container.appendChild(list);
    }

    return container;
  }

  // ── Helpers ─────────────────────────────────────────────────────────

  /** Get the direct badge on a row (not inside nested thread items). */
  private directBadge(row: HTMLElement): Element | null {
    const badges = row.querySelectorAll(`[${BADGE_ATTR}]`);
    for (const badge of badges) {
      // Skip badges inside expansion wrappers (those belong to thread items)
      if (badge.closest('[id$="_itemPartWrapper"]')) continue;
      return badge;
    }
    return null;
  }

  private observeDOM(): void {
    this.observer = new MutationObserver(() => {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => this.scan(), DEBOUNCE_MS);
    });
    this.observer.observe(document.body, { childList: true, subtree: true });
  }
}
