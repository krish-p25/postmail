import { SELECTORS, isComposeDialog, findComposeBody, findRecipientChips, getSenderEmail } from '../selectors';

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

describe('getSenderEmail', () => {
  afterEach(() => {
    document.title = '';
    document.body.innerHTML = '';
  });

  function addAccountButton(label: string): void {
    const a = document.createElement('a');
    a.setAttribute('href', 'https://accounts.google.com/SignOutOptions?hl=en&continue=https://mail.google.com');
    a.setAttribute('aria-label', label);
    document.body.appendChild(a);
  }

  it('reads the account from the trailing part of the Gmail title', () => {
    document.title = 'Inbox (3) - me@gmail.com - Gmail';
    expect(getSenderEmail()).toBe('me@gmail.com');
  });

  it('ignores addresses in the subject part of the title', () => {
    document.title = 'Re: invoice for bob@acme.com - me@gmail.com - Gmail';
    expect(getSenderEmail()).toBe('me@gmail.com');
  });

  it('falls back to the Google account button label', () => {
    document.title = 'Gmail';
    addAccountButton('Google Account: Krish P  \n(me@gmail.com)');
    expect(getSenderEmail()).toBe('me@gmail.com');
  });

  it('ignores contact chips and title attributes', () => {
    document.title = 'Gmail';
    const chip = document.createElement('span');
    chip.setAttribute('data-email', 'contact@example.com');
    chip.setAttribute('title', 'contact@gmail.com');
    document.body.appendChild(chip);
    expect(getSenderEmail()).toBeNull();
  });
});
