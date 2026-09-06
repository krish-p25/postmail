import { ComposeTracker } from '../compose-tracker';
import { ComposeTrackingState, TRACKING_PIXEL_ATTR } from '@postmail/shared';

function findBody(compose: HTMLElement): HTMLElement | null {
  return compose.querySelector('div[role="textbox"]');
}

function findSubject(_compose: HTMLElement): string {
  return '';
}

function createMockComposeWithBody(): HTMLElement {
  const compose = document.createElement('div');
  const body = document.createElement('div');
  body.setAttribute('role', 'textbox');
  body.setAttribute('g_editable', 'true');
  body.setAttribute('contenteditable', 'true');
  compose.appendChild(body);
  return compose;
}

describe('ComposeTracker', () => {
  it('generates token immediately and injects pixel when tracking enabled', () => {
    const compose = createMockComposeWithBody();
    const tracker = new ComposeTracker('c1', compose, true, findBody, findSubject);
    const info = tracker.getInfo();

    expect(info.state).toBe(ComposeTrackingState.PIXEL_INJECTED);
    expect(info.trackingToken).toBeTruthy();
    expect(info.trackingToken).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(info.injected).toBe(true);
    expect(info.recipients).toEqual([]);
  });

  it('tracks recipient changes', () => {
    const compose = createMockComposeWithBody();
    const tracker = new ComposeTracker('c1', compose, true, findBody, findSubject);

    tracker.handleRecipientChange(['alice@example.com']);

    const info = tracker.getInfo();
    expect(info.recipients).toEqual(['alice@example.com']);
  });

  it('updates recipients when they change', () => {
    const compose = createMockComposeWithBody();
    const tracker = new ComposeTracker('c1', compose, true, findBody, findSubject);

    tracker.handleRecipientChange(['alice@example.com']);
    tracker.handleRecipientChange(['bob@example.com']);

    expect(tracker.getInfo().recipients).toEqual(['bob@example.com']);
  });

  it('does not inject pixel when tracking is disabled', () => {
    const compose = createMockComposeWithBody();
    const tracker = new ComposeTracker('c1', compose, false, findBody, findSubject);

    const info = tracker.getInfo();
    expect(info.state).toBe(ComposeTrackingState.WAITING_FOR_RECIPIENT);
    expect(info.trackingToken).toBeTruthy(); // token is always generated
    expect(info.injected).toBe(false);
  });

  it('cleans up pixel on cleanup()', () => {
    const compose = createMockComposeWithBody();
    const tracker = new ComposeTracker('c1', compose, true, findBody, findSubject);

    expect(tracker.getInfo().injected).toBe(true);

    tracker.cleanup();
    expect(tracker.getInfo().state).toBe(ComposeTrackingState.CLEANED_UP);
    expect(compose.querySelector(`img[${TRACKING_PIXEL_ATTR}]`)).toBeNull();
  });

  it('handles missing compose body gracefully', () => {
    const compose = document.createElement('div'); // No body element
    const tracker = new ComposeTracker('c1', compose, true, findBody, findSubject);

    const info = tracker.getInfo();
    // Token generated but injection failed — stays in WAITING_FOR_RECIPIENT
    expect(info.trackingToken).toBeTruthy();
    expect(info.injected).toBe(false);
  });

  it('includes composeId in info', () => {
    const compose = createMockComposeWithBody();
    const tracker = new ComposeTracker('my-compose-42', compose, true, findBody, findSubject);
    expect(tracker.getInfo().composeId).toBe('my-compose-42');
  });

  it('cancels tracking and removes pixel', () => {
    const compose = createMockComposeWithBody();
    const tracker = new ComposeTracker('c1', compose, true, findBody, findSubject);

    expect(tracker.isPixelInjected()).toBe(true);

    tracker.cancelTracking();
    expect(tracker.isCancelled()).toBe(true);
    expect(compose.querySelector(`img[${TRACKING_PIXEL_ATTR}]`)).toBeNull();
  });

  it('uses findSubject to read subject', () => {
    const compose = createMockComposeWithBody();
    const customFindSubject = (_el: HTMLElement) => 'Test Subject';
    const tracker = new ComposeTracker('c1', compose, true, findBody, customFindSubject);

    expect(tracker.getSubject()).toBe('Test Subject');
  });
});
