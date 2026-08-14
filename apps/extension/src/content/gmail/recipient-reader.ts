import { SELECTORS } from './selectors';

type RecipientChangeCallback = (recipients: string[]) => void;

/**
 * Reads and observes recipient email addresses from a Gmail compose dialog.
 *
 * Uses MutationObserver on the "to" field container to detect when
 * recipients are added, removed, or changed. Deduplicates change events
 * by comparing sorted recipient lists.
 */
export class RecipientReader {
  private composeElement: HTMLElement;
  private observer: MutationObserver | null = null;
  private callbacks: RecipientChangeCallback[] = [];
  private lastRecipients: string[] = [];

  constructor(composeElement: HTMLElement) {
    this.composeElement = composeElement;
  }

  /** Read current recipients from the DOM. */
  readRecipients(): string[] {
    const chips = this.composeElement.querySelectorAll(SELECTORS.RECIPIENT_CHIP);
    const emails: string[] = [];
    chips.forEach((chip) => {
      const email = chip.getAttribute('email');
      if (email) emails.push(email);
    });
    return emails;
  }

  /** Register a callback for recipient changes. */
  onChange(callback: RecipientChangeCallback): void {
    this.callbacks.push(callback);
  }

  /** Start observing for recipient changes. Fires initial notification if recipients exist. */
  start(): void {
    this.readAndNotify();

    const toField = this.composeElement.querySelector(SELECTORS.TO_FIELD);
    const observeTarget = toField ?? this.composeElement;

    this.observer = new MutationObserver(() => this.readAndNotify());
    this.observer.observe(observeTarget, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['email'],
    });
  }

  /** Stop observing. */
  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  private readAndNotify(): void {
    const recipients = this.readRecipients();
    if (!this.recipientsEqual(recipients, this.lastRecipients)) {
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
