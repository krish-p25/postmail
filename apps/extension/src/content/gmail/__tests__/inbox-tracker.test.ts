/* eslint-disable @typescript-eslint/no-explicit-any */
import { InboxTracker } from '../inbox-tracker';
import { OVERLAY_ATTR } from '../thread-overlay';

const THREAD_ID = '1a07d75f70f85579';

interface FakeEmail {
  id: string;
  messageId: string;
  opens: number;
}

/**
 * Gmail thread DOM, as observed on 2026-09-17:
 *   div.adn.ads[data-legacy-message-id]   ← the id lives here
 *     └─ div.gs                           ← first ancestor of the body with sender + date
 *          └─ div.ii > div.a3s            ← message body
 */
function renderThread(messageIds: Array<string | null>): void {
  const heading = document.createElement('h2');
  heading.className = 'hP';
  heading.setAttribute('data-legacy-thread-id', THREAD_ID);
  heading.setAttribute('data-thread-perm-id', 'thread-f:1875704574740288889');
  heading.textContent = "Nando's - Add Chilli";
  document.body.appendChild(heading);

  for (const messageId of messageIds) {
    const adn = document.createElement('div');
    adn.className = 'adn ads';
    if (messageId) adn.setAttribute('data-legacy-message-id', messageId);

    const gs = document.createElement('div');
    gs.className = 'gs';

    const sender = document.createElement('span');
    sender.className = 'gD';
    sender.textContent = 'Krish';
    const date = document.createElement('span');
    date.className = 'g3';
    date.textContent = '21:05';

    const ii = document.createElement('div');
    ii.className = 'ii gt';
    const body = document.createElement('div');
    body.className = 'a3s aiL';
    body.textContent = 'Message body';

    ii.appendChild(body);
    gs.append(sender, date, ii);
    adn.appendChild(gs);
    document.body.appendChild(adn);
  }
}

function mockTrackedEmails(emails: FakeEmail[]): void {
  (global as any).chrome.runtime.sendMessage = jest.fn((message: any, cb: (r: unknown) => void) => {
    if (message.type !== 'GET_TRACKED_EMAILS') return cb({});
    cb({
      emails: emails.map((e) => ({
        id: e.id,
        subject: "Re: Nando's - Add Chilli",
        recipient: 'someone@example.com',
        status: 'sent',
        sentAt: '2026-09-15T12:00:00.000Z',
        trackingToken: `token-${e.id}`,
        messageId: e.messageId,
        threadId: THREAD_ID,
        conversationId: null,
        opens: Array.from({ length: e.opens }, (_, i) => ({
          id: `${e.id}-open-${i}`,
          opened_at: '2026-09-16T10:00:00.000Z',
          ip_address: '1.2.3.4',
          user_agent: null,
          dismissed: false,
          likely_self: false,
        })),
      })),
    });
  });
}

let tracker: InboxTracker | null = null;

afterEach(() => {
  tracker?.stop();
  tracker = null;
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

it('shows an overlay on the message whose id is on an ancestor element', async () => {
  renderThread(['1a0a6f827b29c74e']);
  mockTrackedEmails([{ id: 'email-1', messageId: '1a0a6f827b29c74e', opens: 4 }]);

  tracker = new InboxTracker();
  await tracker.start();

  const overlays = document.querySelectorAll(`[${OVERLAY_ATTR}]`);
  expect(overlays).toHaveLength(1);
  expect(overlays[0].getAttribute(OVERLAY_ATTR)).toBe('email-1');
  expect(overlays[0].textContent).toContain('Opened 4 times');
});

it('shows nothing on a message whose id is not a tracked email', async () => {
  // Thread has 3 sent messages but only one was tracked: expanding an untracked
  // message must not borrow the tracked email's opens.
  renderThread(['1a0a000000000001']);
  mockTrackedEmails([{ id: 'email-1', messageId: '1a0a6f8b4fe50d4f', opens: 8 }]);

  tracker = new InboxTracker();
  await tracker.start();

  expect(document.querySelectorAll(`[${OVERLAY_ATTR}]`)).toHaveLength(0);
});

it('falls back to the thread\'s single tracked email only when a message exposes no id', async () => {
  renderThread([null]);
  mockTrackedEmails([{ id: 'email-1', messageId: '1a0a6f8b4fe50d4f', opens: 8 }]);

  tracker = new InboxTracker();
  await tracker.start();

  const overlays = document.querySelectorAll(`[${OVERLAY_ATTR}]`);
  expect(overlays).toHaveLength(1);
  expect(overlays[0].getAttribute(OVERLAY_ATTR)).toBe('email-1');
});

it('does not let an id-less message steal an overlay from the message it belongs to', async () => {
  renderThread([null, '1a0a6f827b29c74e']);
  mockTrackedEmails([{ id: 'email-1', messageId: '1a0a6f827b29c74e', opens: 4 }]);

  tracker = new InboxTracker();
  await tracker.start();

  const overlays = Array.from(document.querySelectorAll(`[${OVERLAY_ATTR}]`));
  expect(overlays).toHaveLength(1);
  // The overlay belongs to the second message (the one carrying the matching id).
  const owner = overlays[0].closest('[data-legacy-message-id]');
  expect(owner?.getAttribute('data-legacy-message-id')).toBe('1a0a6f827b29c74e');
});

it('matches each expanded message to its own tracked email when a thread has several', async () => {
  renderThread(['1a0a52cd36e0e750', '1a0a6f827b29c74e']);
  mockTrackedEmails([
    { id: 'email-older', messageId: '1a0a52cd36e0e750', opens: 5 },
    { id: 'email-newer', messageId: '1a0a6f827b29c74e', opens: 4 },
  ]);

  tracker = new InboxTracker();
  await tracker.start();

  const overlays = Array.from(document.querySelectorAll(`[${OVERLAY_ATTR}]`));
  expect(overlays.map((o) => o.getAttribute(OVERLAY_ATTR))).toEqual(['email-older', 'email-newer']);
  expect(overlays[0].textContent).toContain('Opened 5 times');
  expect(overlays[1].textContent).toContain('Opened 4 times');
});
