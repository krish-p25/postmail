/**
 * Centralized Gmail DOM selectors.
 *
 * Gmail uses obfuscated class names that change frequently.
 * These selectors prefer role/aria/name attributes which are more stable.
 * Keep all Gmail-specific DOM knowledge isolated here.
 */
export const SELECTORS = {
  COMPOSE_DIALOG: 'div[role="dialog"]',
  COMPOSE_SUBJECT: 'input[name="subjectbox"]',
  COMPOSE_BODY: 'div[role="textbox"][g_editable="true"]',
  COMPOSE_BODY_FALLBACK: 'div[role="textbox"][aria-label="Message Body"]',
  RECIPIENT_CHIP: 'span[email], div[data-hovercard-id][data-name]',
  TO_FIELD: 'div[name="to"], tr.bzf',
  CC_FIELD: 'div[name="cc"]',
  BCC_FIELD: 'div[name="bcc"]',
  // Thread subject heading (used for reply subject extraction)
  THREAD_SUBJECT: 'h2[data-thread-perm-id], h2[data-legacy-thread-id]',
} as const;

export function isComposeDialog(element: Element): boolean {
  return element.querySelector(SELECTORS.COMPOSE_SUBJECT) !== null;
}

/**
 * Check if an element is an inline reply/forward compose area.
 * Reply composes have a g_editable textbox but no subjectbox input,
 * and are NOT inside a dialog (fullscreen compose windows).
 */
export function isReplyCompose(element: Element): boolean {
  const body = element.querySelector(SELECTORS.COMPOSE_BODY)
    || element.querySelector(SELECTORS.COMPOSE_BODY_FALLBACK);
  if (!body) return false;
  // Must not be a fullscreen compose dialog (those have a subjectbox)
  if (element.querySelector(SELECTORS.COMPOSE_SUBJECT)) return false;
  // Must not be inside a dialog
  if (element.closest('div[role="dialog"]')) return false;
  return true;
}

/**
 * Find the nearest reply compose container for a given g_editable body element.
 * Walks up the DOM to find the enclosing compose-like container that holds
 * the body, recipient fields, and action buttons.
 */
export function findReplyComposeContainer(body: HTMLElement): HTMLElement | null {
  // Walk up from the editable body to find the container that holds
  // recipient chips and the compose toolbar. In Gmail, the reply compose
  // area is typically wrapped in a container with a "to" field.
  let el: HTMLElement | null = body;
  while (el && el !== document.body) {
    // A reply container will have a TO field or recipient chips inside it
    if (el.querySelector(SELECTORS.TO_FIELD) || el.querySelector(SELECTORS.RECIPIENT_CHIP)) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

/**
 * Extract the subject from a reply compose by reading the thread heading.
 * Gmail reply areas don't have a subjectbox — the subject comes from the thread header.
 */
export function findReplySubject(composeElement: Element): string {
  // Strategy 1: Find thread subject heading in the same view
  const threadSubject = document.querySelector(SELECTORS.THREAD_SUBJECT);
  if (threadSubject) {
    const text = threadSubject.textContent?.trim();
    if (text) return text;
  }

  // Strategy 2: Look for the subject in a parent table row structure
  // (Gmail sometimes renders the thread subject in a different element)
  const subjectEl = document.querySelector('div[data-thread-perm-id] span, h2.hP');
  if (subjectEl) {
    const text = subjectEl.textContent?.trim();
    if (text) return text;
  }

  return '';
}

export function findComposeBody(composeElement: Element): HTMLElement | null {
  const primary = composeElement.querySelector(SELECTORS.COMPOSE_BODY) as HTMLElement | null;
  if (primary) return primary;
  return composeElement.querySelector(SELECTORS.COMPOSE_BODY_FALLBACK) as HTMLElement | null;
}

export function findRecipientChips(composeElement: Element): string[] {
  const chips = composeElement.querySelectorAll(SELECTORS.RECIPIENT_CHIP);
  const emails: string[] = [];
  chips.forEach((chip) => {
    const email = chip.getAttribute('email')
      || chip.getAttribute('data-hovercard-id')
      || chip.getAttribute('data-name');
    if (email && email.includes('@')) emails.push(email);
  });

  // Fallback: scan for any element with an email-like data attribute
  if (emails.length === 0) {
    composeElement.querySelectorAll('[data-hovercard-id]').forEach((el) => {
      const val = el.getAttribute('data-hovercard-id');
      if (val && val.includes('@')) emails.push(val);
    });
  }

  return [...new Set(emails)];
}

/**
 * Attempt to read the logged-in Gmail address from the page DOM.
 * Returns null if not found.
 */
export function getSenderEmail(): string | null {
  // Strategy 1: [data-email] on the account/profile element
  const emailAttr = document.querySelector('[data-email]');
  if (emailAttr) {
    const email = emailAttr.getAttribute('data-email');
    if (email && email.includes('@')) return email;
  }

  // Strategy 2: aria-label on the account button (e.g. "Google Account: user@gmail.com")
  const accountBtn = document.querySelector('a[aria-label*="@"][href*="accounts.google.com"]');
  if (accountBtn) {
    const label = accountBtn.getAttribute('aria-label') || '';
    const match = label.match(/[\w.+-]+@[\w.-]+\.\w+/);
    if (match) return match[0];
  }

  // Strategy 3: title attribute with email pattern
  const titled = document.querySelector('[title*="@gmail.com"], [title*="@googlemail.com"]');
  if (titled) {
    const title = titled.getAttribute('title') || '';
    const match = title.match(/[\w.+-]+@[\w.-]+\.\w+/);
    if (match) return match[0];
  }

  return null;
}
