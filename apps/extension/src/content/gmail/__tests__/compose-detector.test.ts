import { ComposeDetector, ComposeDetectorCallbacks } from '../compose-detector';

function createMockComposeDialog(): HTMLElement {
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  const subject = document.createElement('input');
  subject.setAttribute('name', 'subjectbox');
  dialog.appendChild(subject);
  return dialog;
}

function createNonComposeDialog(): HTMLElement {
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  dialog.textContent = 'Some other dialog';
  return dialog;
}

function createCallbacks(): ComposeDetectorCallbacks & {
  detected: HTMLElement[];
  removed: HTMLElement[];
} {
  const detected: HTMLElement[] = [];
  const removed: HTMLElement[] = [];
  return {
    detected,
    removed,
    onComposeDetected: (el: HTMLElement) => detected.push(el),
    onComposeRemoved: (el: HTMLElement) => removed.push(el),
  };
}

describe('ComposeDetector', () => {
  let detector: ComposeDetector;
  let callbacks: ReturnType<typeof createCallbacks>;

  beforeEach(() => {
    document.body.innerHTML = '';
    callbacks = createCallbacks();
    detector = new ComposeDetector(callbacks);
  });

  afterEach(() => {
    detector.stop();
  });

  it('detects a compose dialog already present in the DOM', () => {
    const dialog = createMockComposeDialog();
    document.body.appendChild(dialog);

    detector.start();

    expect(callbacks.detected).toHaveLength(1);
    expect(callbacks.detected[0]).toBe(dialog);
  });

  it('does not detect non-compose dialogs', () => {
    document.body.appendChild(createNonComposeDialog());

    detector.start();

    expect(callbacks.detected).toHaveLength(0);
  });

  it('detects a compose dialog added after start', async () => {
    detector.start();
    expect(callbacks.detected).toHaveLength(0);

    const dialog = createMockComposeDialog();
    document.body.appendChild(dialog);

    await flushMutationObserver();

    expect(callbacks.detected).toHaveLength(1);
    expect(callbacks.detected[0]).toBe(dialog);
  });

  it('does not double-detect the same compose dialog', async () => {
    const dialog = createMockComposeDialog();
    document.body.appendChild(dialog);
    detector.start();

    document.body.appendChild(document.createElement('span'));
    await flushMutationObserver();

    expect(callbacks.detected).toHaveLength(1);
  });

  it('detects removal when dialog is removed from DOM', async () => {
    const dialog = createMockComposeDialog();
    document.body.appendChild(dialog);
    detector.start();
    expect(callbacks.detected).toHaveLength(1);

    dialog.remove();
    await flushMutationObserver();

    expect(callbacks.removed).toHaveLength(1);
    expect(callbacks.removed[0]).toBe(dialog);
  });

  it('tracks multiple compose windows independently', async () => {
    detector.start();

    const dialog1 = createMockComposeDialog();
    document.body.appendChild(dialog1);
    await flushMutationObserver();

    const dialog2 = createMockComposeDialog();
    document.body.appendChild(dialog2);
    await flushMutationObserver();

    expect(callbacks.detected).toHaveLength(2);

    dialog1.remove();
    await flushMutationObserver();

    expect(callbacks.removed).toHaveLength(1);
    expect(callbacks.removed[0]).toBe(dialog1);
  });

  it('stops detecting after stop() is called', async () => {
    detector.start();
    detector.stop();

    document.body.appendChild(createMockComposeDialog());
    await flushMutationObserver();

    expect(callbacks.detected).toHaveLength(0);
  });
});

function flushMutationObserver(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
