import { ComposeManager, ComposeManagerConfig } from '../../compose-manager';
import { ComposeDetector } from '../compose-detector';
import { RecipientReader } from '../recipient-reader';
import { findComposeBody } from '../selectors';
import { ComposeTrackingState, TRACKING_PIXEL_ATTR } from '@postmail/shared';

const SENDER = 'me@example.com';

function buildGmailConfig(): ComposeManagerConfig {
  return {
    createDetector: (callbacks) => new ComposeDetector(callbacks),
    createRecipientReader: (element) => new RecipientReader(element),
    findBody: (composeElement) => findComposeBody(composeElement),
    findSubject: (composeElement) => {
      const input = composeElement.querySelector('input[name="subjectbox"]') as HTMLInputElement;
      return input?.value || '';
    },
    getSenderEmail: () => SENDER,
    provider: 'gmail',
  };
}

function createFullComposeDialog(recipients: string[] = []): HTMLElement {
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');

  const subject = document.createElement('input');
  subject.setAttribute('name', 'subjectbox');
  dialog.appendChild(subject);

  const body = document.createElement('div');
  body.setAttribute('role', 'textbox');
  body.setAttribute('g_editable', 'true');
  body.setAttribute('contenteditable', 'true');
  dialog.appendChild(body);

  const toField = document.createElement('div');
  toField.setAttribute('name', 'to');
  for (const email of recipients) {
    const chip = document.createElement('span');
    chip.setAttribute('email', email);
    chip.textContent = email;
    toField.appendChild(chip);
  }
  dialog.appendChild(toField);

  return dialog;
}

function addRecipient(dialog: HTMLElement, email: string): void {
  const toField = dialog.querySelector('div[name="to"]')!;
  const chip = document.createElement('span');
  chip.setAttribute('email', email);
  chip.textContent = email;
  toField.appendChild(chip);
}

function createReplyCompose(recipients: string[] = []): HTMLElement {
  // Reply compose: a container with a g_editable textbox, TO field,
  // but NO subjectbox and NOT inside a dialog
  const container = document.createElement('div');

  const body = document.createElement('div');
  body.setAttribute('role', 'textbox');
  body.setAttribute('g_editable', 'true');
  body.setAttribute('contenteditable', 'true');
  container.appendChild(body);

  const toField = document.createElement('div');
  toField.setAttribute('name', 'to');
  for (const email of recipients) {
    const chip = document.createElement('span');
    chip.setAttribute('email', email);
    chip.textContent = email;
    toField.appendChild(chip);
  }
  container.appendChild(toField);

  return container;
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('ComposeManager', () => {
  let manager: ComposeManager;

  beforeEach(() => {
    document.body.innerHTML = '';
    manager = new ComposeManager(buildGmailConfig());
    manager.setLinkedEmails([SENDER]);
  });

  afterEach(() => {
    manager.stop();
  });

  it('starts with zero composes', () => {
    manager.start();
    expect(manager.getComposeCount()).toBe(0);
  });

  it('detects a compose window added to the DOM', async () => {
    manager.start();

    const dialog = createFullComposeDialog();
    document.body.appendChild(dialog);
    await flush();

    expect(manager.getComposeCount()).toBe(1);
  });

  it('tracks multiple compose windows independently', async () => {
    manager.start();

    document.body.appendChild(createFullComposeDialog());
    await flush();

    document.body.appendChild(createFullComposeDialog());
    await flush();

    expect(manager.getComposeCount()).toBe(2);
  });

  it('generates different tokens for different composes', async () => {
    manager.start();

    const dialog1 = createFullComposeDialog(['alice@example.com']);
    document.body.appendChild(dialog1);
    await flush();

    const dialog2 = createFullComposeDialog(['bob@example.com']);
    document.body.appendChild(dialog2);
    await flush();

    const infos = manager.getAllTrackingInfo();
    expect(infos).toHaveLength(2);
    expect(infos[0].trackingToken).toBeTruthy();
    expect(infos[1].trackingToken).toBeTruthy();
    expect(infos[0].trackingToken).not.toBe(infos[1].trackingToken);
  });

  it('cleans up state when compose is removed', async () => {
    manager.start();

    const dialog = createFullComposeDialog();
    document.body.appendChild(dialog);
    await flush();
    expect(manager.getComposeCount()).toBe(1);

    dialog.remove();
    await flush();

    expect(manager.getComposeCount()).toBe(0);
  });

  it('injects pixel when recipients appear', async () => {
    manager.start();

    const dialog = createFullComposeDialog();
    document.body.appendChild(dialog);
    await flush();

    addRecipient(dialog, 'alice@example.com');
    await flush();

    const infos = manager.getAllTrackingInfo();
    expect(infos).toHaveLength(1);
    expect(infos[0].injected).toBe(true);
    expect(infos[0].state).toBe(ComposeTrackingState.PIXEL_INJECTED);
  });

  it('stops all tracking when stop() is called', async () => {
    manager.start();

    const dialog = createFullComposeDialog(['alice@example.com']);
    document.body.appendChild(dialog);
    await flush();

    manager.stop();
    expect(manager.getComposeCount()).toBe(0);
  });

  it('detects an inline reply compose added to the DOM', async () => {
    manager.start();

    const reply = createReplyCompose(['alice@example.com']);
    document.body.appendChild(reply);
    await flush();

    expect(manager.getComposeCount()).toBe(1);
  });

  it('injects pixel into reply compose', async () => {
    manager.start();

    const reply = createReplyCompose(['alice@example.com']);
    document.body.appendChild(reply);
    await flush();

    const infos = manager.getAllTrackingInfo();
    expect(infos).toHaveLength(1);
    expect(infos[0].injected).toBe(true);
    expect(infos[0].state).toBe(ComposeTrackingState.PIXEL_INJECTED);
  });

  it('tracks reply and compose independently', async () => {
    manager.start();

    const dialog = createFullComposeDialog(['alice@example.com']);
    document.body.appendChild(dialog);
    await flush();

    const reply = createReplyCompose(['bob@example.com']);
    document.body.appendChild(reply);
    await flush();

    expect(manager.getComposeCount()).toBe(2);
    const infos = manager.getAllTrackingInfo();
    expect(infos[0].trackingToken).not.toBe(infos[1].trackingToken);
  });

  it('cleans up reply compose when removed', async () => {
    manager.start();

    const reply = createReplyCompose(['alice@example.com']);
    document.body.appendChild(reply);
    await flush();
    expect(manager.getComposeCount()).toBe(1);

    reply.remove();
    await flush();

    expect(manager.getComposeCount()).toBe(0);
  });
});

describe('ComposeManager linked-mailbox gate', () => {
  function managerFor(sender: string | null): ComposeManager {
    return new ComposeManager({ ...buildGmailConfig(), getSenderEmail: () => sender });
  }

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('does not track or inject a pixel when the sender is not a linked mailbox', async () => {
    const manager = managerFor('someone-else@example.com');
    const onUnlinked = jest.fn();
    manager.onUnlinkedCompose = onUnlinked;
    manager.setLinkedEmails([SENDER]);
    manager.start();

    const dialog = createFullComposeDialog(['alice@example.com']);
    document.body.appendChild(dialog);
    await flush();

    expect(manager.getComposeCount()).toBe(0);
    expect(dialog.querySelector(`img[${TRACKING_PIXEL_ATTR}]`)).toBeNull();
    expect(onUnlinked).toHaveBeenCalledTimes(1);
    manager.stop();
  });

  it('matches linked mailboxes case-insensitively', async () => {
    const manager = managerFor('Me@Example.com');
    manager.setLinkedEmails(['ME@example.COM']);
    manager.start();

    document.body.appendChild(createFullComposeDialog(['alice@example.com']));
    await flush();

    expect(manager.getComposeCount()).toBe(1);
    manager.stop();
  });

  it('does not track before linked mailboxes are known, and does not prompt setup', async () => {
    const manager = managerFor(SENDER);
    const onUnlinked = jest.fn();
    manager.onUnlinkedCompose = onUnlinked;
    manager.start();

    document.body.appendChild(createFullComposeDialog(['alice@example.com']));
    await flush();

    expect(manager.getComposeCount()).toBe(0);
    expect(onUnlinked).not.toHaveBeenCalled();
    manager.stop();
  });

  it('does not track when the sender address cannot be detected', async () => {
    const manager = managerFor(null);
    manager.setLinkedEmails([SENDER]);
    manager.start();

    document.body.appendChild(createFullComposeDialog(['alice@example.com']));
    await flush();

    expect(manager.getComposeCount()).toBe(0);
    manager.stop();
  });
});
