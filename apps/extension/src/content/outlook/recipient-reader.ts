import { TO_FIELD_SELECTORS, findRecipientEmails } from './selectors';

type RecipientChangeCallback = (recipients: string[]) => void;

/**
 * Reads and observes recipient email addresses from an Outlook compose window.
 *
 * Uses MutationObserver on the "To" field container to detect when
 * recipients are added, removed, or changed. Deduplicates change events
 * by comparing sorted recipient lists.
 */
export class OutlookRecipientReader {
  private composeElement: HTMLElement;
  private observer: MutationObserver | null = null;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private callbacks: RecipientChangeCallback[] = [];
  private lastRecipients: string[] = [];

  constructor(composeElement: HTMLElement) {
    this.composeElement = composeElement;
  }

  /** Read current recipients from the DOM. */
  readRecipients(): string[] {
    const emails = findRecipientEmails(this.composeElement);
    console.log(`[PostMail][Outlook:RecipientReader] readRecipients found ${emails.length}: [${emails.join(', ')}]`);
    return emails;
  }

  /** Register a callback for recipient changes. */
  onChange(callback: RecipientChangeCallback): void {
    this.callbacks.push(callback);
  }

  /** Start observing for recipient changes. Fires initial notification if recipients exist. */
  start(): void {
    console.log('[PostMail][Outlook:RecipientReader] Starting observer');
    this.readAndNotify();

    // Find the To field to observe — try each selector
    let toField: Element | null = null;
    for (const sel of TO_FIELD_SELECTORS) {
      toField = this.composeElement.querySelector(sel);
      if (toField) break;
    }

    const observeTarget = toField ?? this.composeElement;
    console.log(`[PostMail][Outlook:RecipientReader] Observing ${toField ? 'To field' : 'compose element (fallback)'}`);

    this.observer = new MutationObserver(() => this.readAndNotify());
    this.observer.observe(observeTarget, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['title', 'aria-label', 'data-lpc-hover-target-id'],
    });

    // Periodic polling as backup
    this.pollInterval = setInterval(() => this.readAndNotify(), 3000);
  }

  /** Stop observing. */
  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  private readAndNotify(): void {
    const recipients = this.readRecipients();
    if (!this.recipientsEqual(recipients, this.lastRecipients)) {
      console.log(`[PostMail][Outlook:RecipientReader] Recipients changed: [${this.lastRecipients.join(', ')}] → [${recipients.join(', ')}]`);
      this.lastRecipients = recipients;
      this.callbacks.forEach((cb) => cb(recipients));
    }
  }

  private recipientsEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((val, idx) => val === sortedB[idx]);
  }
}
