import { ComposeTracker } from '../compose-tracker';
import { ComposeTrackingState, TRACKING_PIXEL_ATTR } from '@postmail/shared';

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
  it('starts in WAITING_FOR_RECIPIENT state', () => {
    const compose = createMockComposeWithBody();
    const tracker = new ComposeTracker('c1', compose, true);
    const info = tracker.getInfo();

    expect(info.state).toBe(ComposeTrackingState.WAITING_FOR_RECIPIENT);
    expect(info.trackingToken).toBe('');
    expect(info.recipients).toEqual([]);
    expect(info.injected).toBe(false);
  });

  it('generates token and injects pixel when recipients appear', () => {
    const compose = createMockComposeWithBody();
    const tracker = new ComposeTracker('c1', compose, true);

    tracker.handleRecipientChange(['alice@example.com']);

    const info = tracker.getInfo();
    expect(info.state).toBe(ComposeTrackingState.PIXEL_INJECTED);
    expect(info.trackingToken).toBeTruthy();
    expect(info.trackingToken).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(info.recipients).toEqual(['alice@example.com']);
    expect(info.injected).toBe(true);
  });

  it('regenerates token when recipients change', () => {
    const compose = createMockComposeWithBody();
    const tracker = new ComposeTracker('c1', compose, true);

    tracker.handleRecipientChange(['alice@example.com']);
    const firstToken = tracker.getInfo().trackingToken;

    tracker.handleRecipientChange(['bob@example.com']);
    const secondToken = tracker.getInfo().trackingToken;

    expect(secondToken).toBeTruthy();
    expect(secondToken).not.toBe(firstToken);
    expect(tracker.getInfo().recipients).toEqual(['bob@example.com']);
  });

  it('regenerates token when recipients are added', () => {
    const compose = createMockComposeWithBody();
    const tracker = new ComposeTracker('c1', compose, true);

    tracker.handleRecipientChange(['alice@example.com']);
    const firstToken = tracker.getInfo().trackingToken;

    tracker.handleRecipientChange(['alice@example.com', 'bob@example.com']);
    const secondToken = tracker.getInfo().trackingToken;

    expect(secondToken).not.toBe(firstToken);
  });

  it('reverts to WAITING_FOR_RECIPIENT when all recipients removed', () => {
    const compose = createMockComposeWithBody();
    const tracker = new ComposeTracker('c1', compose, true);

    tracker.handleRecipientChange(['alice@example.com']);
    expect(tracker.getInfo().state).toBe(ComposeTrackingState.PIXEL_INJECTED);

    tracker.handleRecipientChange([]);
    const info = tracker.getInfo();
    expect(info.state).toBe(ComposeTrackingState.WAITING_FOR_RECIPIENT);
    expect(info.trackingToken).toBe('');
    expect(info.injected).toBe(false);
  });

  it('removes pixel from DOM when recipients are cleared', () => {
    const compose = createMockComposeWithBody();
    const tracker = new ComposeTracker('c1', compose, true);

    tracker.handleRecipientChange(['alice@example.com']);
    expect(compose.querySelector(`img[${TRACKING_PIXEL_ATTR}]`)).not.toBeNull();

    tracker.handleRecipientChange([]);
    expect(compose.querySelector(`img[${TRACKING_PIXEL_ATTR}]`)).toBeNull();
  });

  it('does not inject pixel when tracking is disabled', () => {
    const compose = createMockComposeWithBody();
    const tracker = new ComposeTracker('c1', compose, false); // disabled

    tracker.handleRecipientChange(['alice@example.com']);

    const info = tracker.getInfo();
    expect(info.state).toBe(ComposeTrackingState.WAITING_FOR_RECIPIENT);
    expect(info.trackingToken).toBe('');
    expect(info.injected).toBe(false);
  });

  it('cleans up pixel on cleanup()', () => {
    const compose = createMockComposeWithBody();
    const tracker = new ComposeTracker('c1', compose, true);

    tracker.handleRecipientChange(['alice@example.com']);
    expect(tracker.getInfo().injected).toBe(true);

    tracker.cleanup();
    expect(tracker.getInfo().state).toBe(ComposeTrackingState.CLEANED_UP);
    expect(compose.querySelector(`img[${TRACKING_PIXEL_ATTR}]`)).toBeNull();
  });

  it('handles missing compose body gracefully', () => {
    const compose = document.createElement('div'); // No body element
    const tracker = new ComposeTracker('c1', compose, true);

    tracker.handleRecipientChange(['alice@example.com']);

    const info = tracker.getInfo();
    // Token generated but injection failed
    expect(info.state).toBe(ComposeTrackingState.TRACKING_INITIALIZED);
    expect(info.trackingToken).toBeTruthy();
    expect(info.injected).toBe(false);
  });

  it('includes composeId in info', () => {
    const compose = createMockComposeWithBody();
    const tracker = new ComposeTracker('my-compose-42', compose, true);
    expect(tracker.getInfo().composeId).toBe('my-compose-42');
  });
});
