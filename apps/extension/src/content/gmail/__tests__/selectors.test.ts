import { SELECTORS, isComposeDialog, findComposeBody, findRecipientChips } from '../selectors';

/**
 * Helper: build a minimal Gmail compose dialog DOM structure.
 */
function createMockComposeDialog(options?: {
  withSubject?: boolean;
  withBody?: boolean;
  recipients?: string[];
}): HTMLElement {
  const { withSubject = true, withBody = true, recipients = [] } = options ?? {};

  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');

  if (withSubject) {
    const subject = document.createElement('input');
    subject.setAttribute('name', 'subjectbox');
    dialog.appendChild(subject);
  }

  if (withBody) {
    const body = document.createElement('div');
    body.setAttribute('role', 'textbox');
    body.setAttribute('g_editable', 'true');
    body.setAttribute('contenteditable', 'true');
    dialog.appendChild(body);
  }

  if (recipients.length > 0) {
    const toContainer = document.createElement('div');
    toContainer.setAttribute('name', 'to');
    for (const email of recipients) {
      const chip = document.createElement('span');
      chip.setAttribute('email', email);
      chip.textContent = email;
      toContainer.appendChild(chip);
    }
    dialog.appendChild(toContainer);
  }

  return dialog;
}

describe('SELECTORS', () => {
  it('defines all required selectors as non-empty strings', () => {
    expect(SELECTORS.COMPOSE_DIALOG).toBeTruthy();
    expect(SELECTORS.COMPOSE_SUBJECT).toBeTruthy();
    expect(SELECTORS.COMPOSE_BODY).toBeTruthy();
    expect(SELECTORS.RECIPIENT_CHIP).toBeTruthy();
    expect(SELECTORS.TO_FIELD).toBeTruthy();
  });
});

describe('isComposeDialog', () => {
  it('returns true for a dialog with a subjectbox', () => {
    const dialog = createMockComposeDialog();
    expect(isComposeDialog(dialog)).toBe(true);
  });

  it('returns false for a dialog without a subjectbox', () => {
    const dialog = createMockComposeDialog({ withSubject: false });
    expect(isComposeDialog(dialog)).toBe(false);
  });

  it('returns false for a plain div', () => {
    const div = document.createElement('div');
    expect(isComposeDialog(div)).toBe(false);
  });
});

describe('findComposeBody', () => {
  it('finds the compose body by g_editable attribute', () => {
    const dialog = createMockComposeDialog();
    const body = findComposeBody(dialog);
    expect(body).not.toBeNull();
    expect(body?.getAttribute('g_editable')).toBe('true');
  });

  it('falls back to aria-label selector', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const subject = document.createElement('input');
    subject.setAttribute('name', 'subjectbox');
    dialog.appendChild(subject);
    const body = document.createElement('div');
    body.setAttribute('role', 'textbox');
    body.setAttribute('aria-label', 'Message Body');
    body.setAttribute('contenteditable', 'true');
    dialog.appendChild(body);

    const found = findComposeBody(dialog);
    expect(found).toBe(body);
  });

  it('returns null when no body element exists', () => {
    const dialog = createMockComposeDialog({ withBody: false });
    expect(findComposeBody(dialog)).toBeNull();
  });
});

describe('findRecipientChips', () => {
  it('returns emails from span[email] elements', () => {
    const dialog = createMockComposeDialog({ recipients: ['alice@example.com', 'bob@example.com'] });
    const chips = findRecipientChips(dialog);
    expect(chips).toEqual(['alice@example.com', 'bob@example.com']);
  });

  it('returns empty array when no recipients', () => {
    const dialog = createMockComposeDialog();
    expect(findRecipientChips(dialog)).toEqual([]);
  });
});
