import { ComposeManager } from '../compose-manager';
import { ComposeTrackingState, TRACKING_PIXEL_ATTR } from '@postmail/shared';

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

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('ComposeManager', () => {
  let manager: ComposeManager;

  beforeEach(() => {
    document.body.innerHTML = '';
    manager = new ComposeManager();
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
});
