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
} as const;

export function isComposeDialog(element: Element): boolean {
  return element.querySelector(SELECTORS.COMPOSE_SUBJECT) !== null;
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
