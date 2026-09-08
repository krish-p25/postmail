import { ComposeManager, ComposeManagerConfig } from '../../compose-manager';
import { OutlookComposeDetector } from '../compose-detector';
import { OutlookRecipientReader } from '../recipient-reader';
import { findComposeBody, findComposeSubject, findReplySubject } from '../selectors';
import { ComposeTrackingState } from '@postmail/shared';

function buildOutlookConfig(): ComposeManagerConfig {
  return {
    createDetector: (callbacks) => new OutlookComposeDetector(callbacks),
    createRecipientReader: (element) => new OutlookRecipientReader(element),
    findBody: (composeElement) => findComposeBody(composeElement),
    findSubject: (composeElement) => {
      const subject = findComposeSubject(composeElement);
      if (subject) return subject;
      return findReplySubject(composeElement);
    },
    getSenderEmail: () => null,
    provider: 'outlook',
  };
}

/** Create a full Outlook compose window with subject input, body, and To field. */
function createFullCompose(recipients: string[] = []): HTMLElement {
  const container = document.createElement('div');

  const subject = document.createElement('input');
  subject.setAttribute('aria-label', 'Add a subject');
  container.appendChild(subject);

  const body = document.createElement('div');
  body.setAttribute('role', 'textbox');
  body.setAttribute('aria-label', 'Message body');
  body.setAttribute('contenteditable', 'true');
  container.appendChild(body);

  const toField = document.createElement('div');
  toField.setAttribute('aria-label', 'To');
  for (const email of recipients) {
    const pill = document.createElement('span');
    pill.setAttribute('title', email);
    pill.textContent = email;
    toField.appendChild(pill);
  }
  container.appendChild(toField);

  return container;
}

/** Create an Outlook inline reply area: body + To field, no subject input. */
function createReplyCompose(recipients: string[] = []): HTMLElement {
  const container = document.createElement('div');

  const body = document.createElement('div');
  body.setAttribute('role', 'textbox');
  body.setAttribute('aria-label', 'Message body');
  body.setAttribute('contenteditable', 'true');
  container.appendChild(body);

  const toField = document.createElement('div');
  toField.setAttribute('aria-label', 'To');
  for (const email of recipients) {
    const pill = document.createElement('span');
    pill.setAttribute('title', email);
    pill.textContent = email;
    toField.appendChild(pill);
  }
  container.appendChild(toField);

  return container;
}

function addRecipient(container: HTMLElement, email: string): void {
  const toField = container.querySelector('div[aria-label="To"]')!;
  const pill = document.createElement('span');
  pill.setAttribute('title', email);
  pill.textContent = email;
  toField.appendChild(pill);
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('Outlook ComposeManager', () => {
  let manager: ComposeManager;

  beforeEach(() => {
    document.body.innerHTML = '';
    manager = new ComposeManager(buildOutlookConfig());
  });

  afterEach(() => {
    manager.stop();
  });

  it('starts with zero composes', () => {
    manager.start();
    expect(manager.getComposeCount()).toBe(0);
  });

  it('detects a full compose window added to the DOM', async () => {
    manager.start();

    const compose = createFullCompose();
    document.body.appendChild(compose);
    await flush();

    expect(manager.getComposeCount()).toBe(1);
  });

  it('detects an inline reply compose added to the DOM', async () => {
    manager.start();

    const reply = createReplyCompose(['alice@example.com']);
    document.body.appendChild(reply);
    await flush();

    expect(manager.getComposeCount()).toBe(1);
  });

  it('tracks multiple compose windows independently', async () => {
    manager.start();

    document.body.appendChild(createFullCompose());
    await flush();

    document.body.appendChild(createFullCompose());
    await flush();

    expect(manager.getComposeCount()).toBe(2);
  });

  it('tracks reply and compose independently', async () => {
    manager.start();

    document.body.appendChild(createFullCompose(['alice@example.com']));
    await flush();

    document.body.appendChild(createReplyCompose(['bob@example.com']));
    await flush();

    expect(manager.getComposeCount()).toBe(2);
    const infos = manager.getAllTrackingInfo();
    expect(infos[0].trackingToken).not.toBe(infos[1].trackingToken);
  });

  it('injects pixel when recipients appear', async () => {
    manager.start();

    const compose = createFullCompose();
    document.body.appendChild(compose);
    await flush();

    addRecipient(compose, 'alice@example.com');
    await flush();

    const infos = manager.getAllTrackingInfo();
    expect(infos).toHaveLength(1);
    expect(infos[0].injected).toBe(true);
    expect(infos[0].state).toBe(ComposeTrackingState.PIXEL_INJECTED);
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

  it('cleans up state when compose is removed', async () => {
    manager.start();

    const compose = createFullCompose();
    document.body.appendChild(compose);
    await flush();
    expect(manager.getComposeCount()).toBe(1);

    compose.remove();
    await flush();

    expect(manager.getComposeCount()).toBe(0);
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

  it('stops all tracking when stop() is called', async () => {
    manager.start();

    document.body.appendChild(createFullCompose(['alice@example.com']));
    await flush();

    manager.stop();
    expect(manager.getComposeCount()).toBe(0);
  });

  it('generates different tokens for different composes', async () => {
    manager.start();

    document.body.appendChild(createFullCompose(['alice@example.com']));
    await flush();

    document.body.appendChild(createReplyCompose(['bob@example.com']));
    await flush();

    const infos = manager.getAllTrackingInfo();
    expect(infos).toHaveLength(2);
    expect(infos[0].trackingToken).toBeTruthy();
    expect(infos[1].trackingToken).toBeTruthy();
    expect(infos[0].trackingToken).not.toBe(infos[1].trackingToken);
  });
});
