import { ExtensionMessage } from '../shared/messaging';

export interface MailTabRegistrationOptions {
  /** Signed-in account of this mail tab, or null if it can't be detected. */
  getAccountEmail: () => string | null;
  /** Mailboxes linked to the PostMail account (from the auth preflight). */
  linkedEmails: string[];
  checkIntervalMs?: number;
}

/**
 * Tells the service worker this tab is signed in to a linked mailbox, so completed
 * pixel requests from it can be reported as self views.
 *
 * Unlinked or undetected accounts are never sent anywhere; the extension does not
 * intervene with those tabs.
 */
export class MailTabRegistration {
  private readonly linked: Set<string>;
  private registered = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private titleObserver: MutationObserver | null = null;

  constructor(private readonly options: MailTabRegistrationOptions) {
    this.linked = new Set(options.linkedEmails.map((e) => e.toLowerCase()));
  }

  start(): void {
    this.check();
    this.timer = setInterval(() => this.check(), this.options.checkIntervalMs ?? 30_000);

    // Gmail puts the account in the title and updates it on navigation.
    const title = document.querySelector('title');
    if (title) {
      this.titleObserver = new MutationObserver(() => this.check());
      this.titleObserver.observe(title, { childList: true, characterData: true, subtree: true });
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.titleObserver?.disconnect();
    this.timer = null;
    this.titleObserver = null;
  }

  private check(): void {
    const email = this.options.getAccountEmail()?.trim().toLowerCase() ?? null;

    if (email && this.linked.has(email)) {
      // Sent on every check: registration is idempotent and restores the map after a service worker restart.
      this.send({ type: 'REGISTER_MAIL_TAB', accountEmail: email });
      this.registered = true;
    } else if (this.registered) {
      this.send({ type: 'UNREGISTER_MAIL_TAB' });
      this.registered = false;
    }
  }

  private send(message: ExtensionMessage): void {
    try {
      chrome.runtime.sendMessage(message, () => {
        void chrome.runtime.lastError; // service worker may be restarting; the next check retries
      });
    } catch {
      // Extension context invalidated (e.g. extension reloaded); nothing to do.
    }
  }
}
