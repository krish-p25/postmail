import { RecipientReader } from '../recipient-reader';

function createComposeWithRecipients(emails: string[]): HTMLElement {
  const dialog = document.createElement('div');
  const toField = document.createElement('div');
  toField.setAttribute('name', 'to');

  for (const email of emails) {
    const chip = document.createElement('span');
    chip.setAttribute('email', email);
    chip.textContent = email;
    toField.appendChild(chip);
  }

  dialog.appendChild(toField);
  return dialog;
}

function addRecipientChip(composeElement: HTMLElement, email: string): void {
  const toField = composeElement.querySelector('div[name="to"]');
  if (!toField) return;
  const chip = document.createElement('span');
  chip.setAttribute('email', email);
  chip.textContent = email;
  toField.appendChild(chip);
}

function removeAllRecipients(composeElement: HTMLElement): void {
  const toField = composeElement.querySelector('div[name="to"]');
  if (!toField) return;
  toField.querySelectorAll('span[email]').forEach((el) => el.remove());
}

describe('RecipientReader', () => {
  let reader: RecipientReader;

  afterEach(() => {
    reader?.stop();
    document.body.innerHTML = '';
  });

  it('reads recipients that are already present', () => {
    const dialog = createComposeWithRecipients(['alice@example.com']);
    document.body.appendChild(dialog);
    reader = new RecipientReader(dialog);
    expect(reader.readRecipients()).toEqual(['alice@example.com']);
  });

  it('returns empty array when no recipients', () => {
    const dialog = createComposeWithRecipients([]);
    document.body.appendChild(dialog);
    reader = new RecipientReader(dialog);
    expect(reader.readRecipients()).toEqual([]);
  });

  it('reads multiple recipients', () => {
    const dialog = createComposeWithRecipients(['alice@example.com', 'bob@example.com']);
    document.body.appendChild(dialog);
    reader = new RecipientReader(dialog);
    expect(reader.readRecipients()).toEqual(['alice@example.com', 'bob@example.com']);
  });

  it('calls onChange when recipients are added after start', async () => {
    const dialog = createComposeWithRecipients([]);
    document.body.appendChild(dialog);
    reader = new RecipientReader(dialog);

    const changes: string[][] = [];
    reader.onChange((recipients) => changes.push([...recipients]));
    reader.start();

    addRecipientChip(dialog, 'alice@example.com');
    await flush();

    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual(['alice@example.com']);
  });

  it('calls onChange when recipients change', async () => {
    const dialog = createComposeWithRecipients(['alice@example.com']);
    document.body.appendChild(dialog);
    reader = new RecipientReader(dialog);

    const changes: string[][] = [];
    reader.onChange((recipients) => changes.push([...recipients]));
    reader.start();

    // Initial notification on start
    expect(changes).toHaveLength(1);

    addRecipientChip(dialog, 'bob@example.com');
    await flush();

    expect(changes).toHaveLength(2);
    expect(changes[1]).toEqual(['alice@example.com', 'bob@example.com']);
  });

  it('calls onChange when all recipients are removed', async () => {
    const dialog = createComposeWithRecipients(['alice@example.com']);
    document.body.appendChild(dialog);
    reader = new RecipientReader(dialog);

    const changes: string[][] = [];
    reader.onChange((recipients) => changes.push([...recipients]));
    reader.start();

    removeAllRecipients(dialog);
    await flush();

    expect(changes[changes.length - 1]).toEqual([]);
  });

  it('does not fire onChange if recipients have not actually changed', async () => {
    const dialog = createComposeWithRecipients(['alice@example.com']);
    document.body.appendChild(dialog);
    reader = new RecipientReader(dialog);

    const changes: string[][] = [];
    reader.onChange((recipients) => changes.push([...recipients]));
    reader.start();

    const initialCount = changes.length;

    // Add a non-email element
    const toField = dialog.querySelector('div[name="to"]')!;
    const span = document.createElement('span');
    span.textContent = 'typing...';
    toField.appendChild(span);
    await flush();

    expect(changes.length).toBe(initialCount);
  });

  it('stops observing after stop()', async () => {
    const dialog = createComposeWithRecipients([]);
    document.body.appendChild(dialog);
    reader = new RecipientReader(dialog);

    const changes: string[][] = [];
    reader.onChange((recipients) => changes.push([...recipients]));
    reader.start();

    const countAfterStart = changes.length;
    reader.stop();

    addRecipientChip(dialog, 'alice@example.com');
    await flush();

    expect(changes.length).toBe(countAfterStart);
  });
});

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
