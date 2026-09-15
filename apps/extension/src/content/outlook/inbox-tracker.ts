/**
 * Outlook Inbox Tracker
 *
 * Scans Outlook Web message list rows and badges tracked emails with their
 * open status. Uses role/aria selectors since Outlook uses obfuscated class
 * names. Uses MutationObserver to handle Outlook's SPA navigation and
 * virtualized list.
 *
 * Matching strategy:
 *  1. Inbox rows (role="option") — data-convid → conversationId lookup
 *  2. Reading pane messages — tracking pixel token → tokenMap lookup
 *  3. Expanded thread items — tracking pixel token or conversationId fallback
 */

import {
  TrackedEmailSummary,
  BADGE_ATTR,
  READING_BADGE_ATTR,
  REFRESH_INTERVAL_MS,
  DEBOUNCE_MS,
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

/**
 * Normalize Outlook conversation IDs to a canonical form.
 * The MS Graph API returns URL-safe base64 (_ and -) while
 * Outlook's DOM uses standard base64 (+ and /). Convert to
 * URL-safe so both sides match.
 */
function normalizeConvId(id: string): string {
  return id.replace(/\+/g, '_').replace(/\//g, '-');
}

export class OutlookInboxTracker {
  /** Maps tracking token → tracked email for pixel-based matching. */
  private tokenMap = new Map<string, TrackedEmailSummary>();
  /** Maps Outlook conversation ID → all tracked emails in that conversation. */
  private convIdMap = new Map<string, TrackedEmailSummary[]>();
  private observer: MutationObserver | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  private onEmailSent = () => { this.refresh(); };
  private onVisibilityChange = () => {
    if (document.visibilityState === 'visible') this.refresh();
  };

  async start(): Promise<void> {
    injectBadgeStyles();
    await this.refresh();
    this.observeDOM();
    this.refreshTimer = setInterval(() => this.refresh(), REFRESH_INTERVAL_MS);
    document.addEventListener('postmail:email-sent', this.onEmailSent);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  stop(): void {
    this.observer?.disconnect();
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    document.removeEventListener('postmail:email-sent', this.onEmailSent);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  private async refresh(): Promise<void> {
    const emails = await fetchTrackedEmails();
    this.tokenMap.clear();
    this.convIdMap.clear();

    for (const email of emails) {
      if (email.status !== 'sent') continue;

      if (email.trackingToken) {
        this.tokenMap.set(email.trackingToken, email);
      }

      if (email.conversationId) {
        const normConvId = normalizeConvId(email.conversationId);
        const convList = this.convIdMap.get(normConvId) || [];
        convList.push(email);
        this.convIdMap.set(normConvId, convList);
      }
    }
    this.scan();
  }

  private scan(): void {
    this.scanReadingPane();
    this.scanInboxRows();
    this.scanThreadItems();
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
    const existingBadge = this.directBadge(row);

    // Match by conversation ID from DOM attribute
    let tracked: TrackedEmailSummary | null = null;
    const domConvId = row.getAttribute('data-convid');
    if (domConvId) {
      tracked = this.getLatestFromList(this.convIdMap.get(normalizeConvId(domConvId)));
    }

    if (!tracked) {
      existingBadge?.remove();
      return;
    }

    if (existingBadge) {
      if (isBadgeCurrent(existingBadge, tracked)) return;
      existingBadge.remove();
    }

    // Place badge before subject span
    const badge = createBadgeElement(tracked);
    const anchor = this.findSubjectSpan(row);
    if (anchor) {
      anchor.before(badge);
    }
  }

  /** Find the subject span in an Outlook row. */
  private findSubjectSpan(row: HTMLElement): HTMLElement | null {
    const spans = row.querySelectorAll('span');
    return (spans[4] as HTMLElement) || null;
  }

  /** Get the most recently sent email from a list. */
  private getLatestFromList(list: TrackedEmailSummary[] | undefined): TrackedEmailSummary | null {
    if (!list || list.length === 0) return null;
    return list.reduce((latest, e) => {
      const latestTime = latest.sentAt ? new Date(latest.sentAt).getTime() : 0;
      const eTime = e.sentAt ? new Date(e.sentAt).getTime() : 0;
      return eTime > latestTime ? e : latest;
    });
  }

  // ── Expanded thread items ───────────────────────────────────────────

  private scanThreadItems(): void {
    // Find all expanded thread containers
    const wrappers = document.querySelectorAll('[id$="_itemPartWrapper"]');
    for (const wrapper of wrappers) {
      // Walk up to find the parent option row to get conversation ID
      const optionRow = wrapper.closest('div[role="option"]');
      if (!optionRow) continue;

      const domConvId = optionRow.getAttribute('data-convid');
      if (!domConvId) continue;

      const trackedList = this.convIdMap.get(normalizeConvId(domConvId));
      if (!trackedList || trackedList.length === 0) continue;

      const items = wrapper.querySelectorAll('div[role="listitem"]');
      for (const item of items) {
        this.processThreadItem(item as HTMLElement, trackedList);
      }
    }
  }

  private processThreadItem(item: HTMLElement, trackedList: TrackedEmailSummary[]): void {
    const existingBadge = item.querySelector(`[${BADGE_ATTR}]`);

    // Match by tracking pixel in the item body (if visible)
    let matched = this.findByTrackingPixel(item);

    // Fallback: if only one tracked email in the conversation, use it
    if (!matched && trackedList.length === 1) {
      matched = trackedList[0];
    }

    if (!matched) {
      existingBadge?.remove();
      return;
    }

    if (existingBadge) {
      if (isBadgeCurrent(existingBadge, matched)) return;
      existingBadge.remove();
    }

    const badge = createBadgeElement(matched);

    // Insert badge before the preview text
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

  // ── Reading pane (conversation view) ─────────────────────────────────

  private scanReadingPane(): void {
    const convContainer = document.getElementById('ConversationReadingPaneContainer');
    if (!convContainer) return;

    const messages = convContainer.querySelectorAll('[aria-label="Email message"]');
    for (const msg of messages) {
      this.processReadingPaneMessage(msg as HTMLElement);
    }
  }

  /** Find a tracked email by its tracking pixel embedded in the message body. */
  private findByTrackingPixel(msg: HTMLElement): TrackedEmailSummary | null {
    const imgs = msg.querySelectorAll('img[data-postmail-tracking="true"]');
    for (const img of imgs) {
      const src = img.getAttribute('src') || '';
      const match = src.match(/\/o\/([0-9a-f-]{36})/);
      if (match) {
        const token = match[1];
        const tracked = this.tokenMap.get(token);
        if (tracked) return tracked;
      }
    }
    return null;
  }

  private processReadingPaneMessage(msg: HTMLElement): void {
    const existingBadge = msg.querySelector(`[${READING_BADGE_ATTR}]`);

    // Match by tracking pixel only (ID-based)
    const matched = this.findByTrackingPixel(msg);

    if (!matched) {
      existingBadge?.remove();
      return;
    }

    if (existingBadge) {
      if (
        existingBadge.getAttribute(READING_BADGE_ATTR) === matched.id &&
        existingBadge.getAttribute('data-opens') === String(matched.openCount)
      ) return;
      existingBadge.remove();
    }

    // Build the reading pane badge with open details
    const container = this.createReadingPaneBadge(matched);

    // Insert as second child of message card
    msg.insertBefore(container, msg.children[1] as HTMLElement);
  }

  private createReadingPaneBadge(tracked: TrackedEmailSummary): HTMLDivElement {
    const variant = tracked.openCount > 0 ? 'opened' : 'tracked';
    const container = document.createElement('div');
    container.className = `postmail-reading-badge postmail-reading-${variant}`;
    container.setAttribute(READING_BADGE_ATTR, tracked.id);
    container.setAttribute('data-opens', String(tracked.openCount));

    // Header with status text
    const header = document.createElement('div');
    header.className = 'postmail-reading-header';
    const statusText = document.createElement('span');
    statusText.className = 'postmail-reading-status-text';

    if (tracked.opens.length === 0) {
      statusText.textContent = 'Tracked \u2013 No Opens yet';
    } else {
      statusText.textContent = `Opened ${tracked.openCount} time${tracked.openCount > 1 ? 's' : ''}`;
    }
    header.appendChild(statusText);
    container.appendChild(header);

    // Open details list
    if (tracked.opens.length > 0) {
      const list = document.createElement('div');
      list.className = 'postmail-open-list';

      const sortedOpens = [...tracked.opens].sort((a, b) => new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime());
      for (const open of sortedOpens) {
        const row = document.createElement('div');
        row.className = 'postmail-open-row';

        const time = document.createElement('span');
        time.className = 'postmail-open-time';
        time.textContent = new Date(open.opened_at).toLocaleString();
        row.appendChild(time);

        const device = document.createElement('span');
        device.className = 'postmail-open-device';
        device.textContent = `${parseDevice(open.user_agent)}${open.ip_address ? ' \u2013 ' + open.ip_address : ''}`;
        row.appendChild(device);

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
