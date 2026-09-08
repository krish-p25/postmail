/**
 * Centralized Outlook Web DOM selectors.
 *
 * Outlook Web (outlook.office.com, outlook.live.com, outlook.office365.com)
 * uses React with obfuscated class names. These selectors prefer role/aria
 * attributes which are more stable across UI updates.
 *
 * Multiple selector candidates are tried in order of specificity.
 */

/** Subject input candidates — tried in order, first match wins. */
export const SUBJECT_SELECTORS = [
  'input[aria-label*="subject" i]',
  'input[placeholder*="subject" i]',
  'input[aria-label*="Subject"]',
  'input[placeholder*="Subject"]',
] as const;

/** Body textbox candidates — tried in order, first match wins. */
export const BODY_SELECTORS = [
  'div[role="textbox"][aria-label*="Message body" i]',
  'div[role="textbox"][aria-label*="body" i]',
  'div[role="textbox"][aria-multiline="true"]',
  'div[contenteditable="true"][role="textbox"]',
] as const;

/** To-field candidates — tried in order. */
export const TO_FIELD_SELECTORS = [
  'div[aria-label="To"]',
  'div[aria-label*="To" i][role="list"]',
  'div[aria-label*="To" i]',
  'input[aria-label*="To" i][role="combobox"]',
] as const;

/** Find the first element matching any of the given selectors within root. */
function queryFirst(root: Element, selectors: readonly string[]): HTMLElement | null {
  for (const sel of selectors) {
    const el = root.querySelector(sel) as HTMLElement | null;
    if (el) return el;
  }
  return null;
}

/** Find all elements matching any of the given selectors within root. */
function queryAllFirst(root: Element | Document, selectors: readonly string[]): NodeListOf<Element> | null {
  for (const sel of selectors) {
    const els = root.querySelectorAll(sel);
    if (els.length > 0) return els;
  }
  return null;
}

/** Find subject inputs in the document. */
export function findSubjectInputs(): NodeListOf<Element> | null {
  return queryAllFirst(document, SUBJECT_SELECTORS);
}

/**
 * Find the compose container by walking up from a subject input
 * to the nearest ancestor that also contains the message body.
 */
export function findComposeContainer(subjectInput: HTMLElement): HTMLElement | null {
  let el: HTMLElement | null = subjectInput.parentElement;
  while (el && el !== document.body) {
    if (queryFirst(el, BODY_SELECTORS)) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

/**
 * Find the reply compose container by walking up from a body textbox
 * to the nearest ancestor that also contains a To field.
 * Used for Outlook quick-reply areas that lack a subject input.
 */
export function findReplyComposeContainer(body: HTMLElement): HTMLElement | null {
  let el: HTMLElement | null = body.parentElement;
  while (el && el !== document.body) {
    if (queryFirst(el, TO_FIELD_SELECTORS)) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

/**
 * Extract the subject from a reply compose by reading the conversation
 * heading in Outlook's reading pane. Quick-reply areas don't have a
 * subject input — the subject comes from the thread header.
 */
export function findReplySubject(_composeElement: Element): string {
  // Strategy 1: Conversation subject heading
  const subjectEl = document.querySelector(
    '[role="heading"][aria-label*="Conversation"], [role="heading"][aria-level="2"]',
  );
  if (subjectEl) {
    const text = subjectEl.textContent?.trim();
    if (text) return text;
  }

  // Strategy 2: Subject shown in the reading pane title area
  const titleEl = document.querySelector(
    'span[title][role="heading"], div[data-app-section="ConversationContainer"] h2',
  );
  if (titleEl) {
    const text = titleEl.textContent?.trim();
    if (text) return text;
  }

  return '';
}

/** Find the editable message body inside a compose container. */
export function findComposeBody(composeElement: Element): HTMLElement | null {
  return queryFirst(composeElement, BODY_SELECTORS);
}

/** Find all body textboxes in the document. */
export function findAllBodies(): NodeListOf<Element> | null {
  return queryAllFirst(document, BODY_SELECTORS);
}

/** Read the subject value from a compose container. */
export function findComposeSubject(composeElement: Element): string {
  const input = queryFirst(composeElement, SUBJECT_SELECTORS) as HTMLInputElement | null;
  return input?.value || '';
}

/**
 * Extract recipient email addresses from an Outlook compose container.
 */
export function findRecipientEmails(composeElement: Element): string[] {
  const emails: string[] = [];
  const EMAIL_RE = /[\w.+-]+@[\w.-]+\.\w+/;

  const toField = queryFirst(composeElement, TO_FIELD_SELECTORS);
  const searchRoot = toField ?? composeElement;

  // Strategy 1: persona pills with title="user@example.com"
  searchRoot.querySelectorAll('[title]').forEach((el) => {
    const title = el.getAttribute('title') || '';
    const match = title.match(EMAIL_RE);
    if (match) emails.push(match[0].toLowerCase());
  });

  // Strategy 2: aria-label containing an email
  if (emails.length === 0) {
    searchRoot.querySelectorAll('[aria-label*="@"]').forEach((el) => {
      const label = el.getAttribute('aria-label') || '';
      const match = label.match(EMAIL_RE);
      if (match) emails.push(match[0].toLowerCase());
    });
  }

  // Strategy 3: data-lpc-hover-target-id
  if (emails.length === 0) {
    searchRoot.querySelectorAll('[data-lpc-hover-target-id]').forEach((el) => {
      const id = el.getAttribute('data-lpc-hover-target-id') || '';
      if (id.includes('@')) emails.push(id.toLowerCase());
    });
  }

  // Strategy 4: text scan for email-like strings
  if (emails.length === 0 && toField) {
    toField.querySelectorAll('span, div').forEach((el) => {
      const text = (el as HTMLElement).innerText?.trim() || '';
      const match = text.match(EMAIL_RE);
      if (match) emails.push(match[0].toLowerCase());
    });
  }

  return [...new Set(emails)];
}

/**
 * Attempt to read the logged-in Outlook email address from the page DOM.
 * Returns null if not found.
 */
export function getSenderEmail(): string | null {
  const EMAIL_RE = /[\w.+-]+@[\w.-]+\.\w+/;

  // Strategy 1: aria-label on profile/account elements
  const profileLabels = document.querySelectorAll('[aria-label*="@"]');
  for (const el of profileLabels) {
    const label = el.getAttribute('aria-label') || '';
    const match = label.match(EMAIL_RE);
    if (match) return match[0];
  }

  // Strategy 2: title on profile elements
  const profileTitles = document.querySelectorAll('button[title*="@"], div[title*="@"]');
  for (const el of profileTitles) {
    const title = el.getAttribute('title') || '';
    const match = title.match(EMAIL_RE);
    if (match) return match[0];
  }

  // Strategy 3: data-lpc-hover-target-id containing @
  const lpcElements = document.querySelectorAll('[data-lpc-hover-target-id*="@"]');
  for (const el of lpcElements) {
    const id = el.getAttribute('data-lpc-hover-target-id') || '';
    if (id.includes('@')) return id;
  }

  return null;
}

/**
 * Debug: log all inputs and textboxes on the page to help identify
 * the right selectors. Call this once from the compose detector.
 */
export function debugLogDomElements(): void {
  console.log('[PostMail][Outlook:Debug] === DOM Scan ===');

  const inputs = document.querySelectorAll('input');
  console.log(`[PostMail][Outlook:Debug] Found ${inputs.length} <input> elements`);
  inputs.forEach((input, i) => {
    const label = input.getAttribute('aria-label');
    const placeholder = input.getAttribute('placeholder');
    const role = input.getAttribute('role');
    const type = input.getAttribute('type');
    if (label || placeholder) {
      console.log(`[PostMail][Outlook:Debug]   input[${i}]: aria-label="${label}", placeholder="${placeholder}", role="${role}", type="${type}"`);
    }
  });

  const textboxes = document.querySelectorAll('[role="textbox"]');
  console.log(`[PostMail][Outlook:Debug] Found ${textboxes.length} [role="textbox"] elements`);
  textboxes.forEach((tb, i) => {
    const label = tb.getAttribute('aria-label');
    const editable = tb.getAttribute('contenteditable');
    const multiline = tb.getAttribute('aria-multiline');
    const tag = tb.tagName.toLowerCase();
    console.log(`[PostMail][Outlook:Debug]   textbox[${i}]: <${tag}> aria-label="${label}", contenteditable="${editable}", aria-multiline="${multiline}"`);
  });

  const editables = document.querySelectorAll('[contenteditable="true"]');
  console.log(`[PostMail][Outlook:Debug] Found ${editables.length} [contenteditable="true"] elements`);
  editables.forEach((el, i) => {
    const label = el.getAttribute('aria-label');
    const role = el.getAttribute('role');
    const tag = el.tagName.toLowerCase();
    console.log(`[PostMail][Outlook:Debug]   editable[${i}]: <${tag}> aria-label="${label}", role="${role}"`);
  });

  console.log('[PostMail][Outlook:Debug] === End DOM Scan ===');
}
