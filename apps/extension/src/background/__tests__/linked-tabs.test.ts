/* eslint-disable @typescript-eslint/no-explicit-any */
jest.mock('../../shared/api', () => ({ checkAuth: jest.fn() }));

import { checkAuth } from '../../shared/api';
import { createChromeMock, flushPromises } from '../../test-utils/chrome-mock';
import { getLinkedTab, registerTab, unregisterTab, watchLinkedTabLifecycle, clearLinkedState } from '../linked-tabs';

const mockCheckAuth = checkAuth as jest.Mock;
let mock: ReturnType<typeof createChromeMock>;

beforeEach(() => {
  mock = createChromeMock();
  (global as any).chrome = mock.chrome;
  mockCheckAuth.mockReset().mockResolvedValue({ ok: true, linkedEmails: ['Me@Gmail.com', 'me@outlook.com'] });
});

it('registers a tab signed in to a linked mailbox (case-insensitive)', async () => {
  await expect(registerTab(7, 'ME@gmail.com')).resolves.toBe(true);
  await expect(getLinkedTab(7)).resolves.toEqual({ accountEmail: 'me@gmail.com', registeredAt: expect.any(Number) });
});

it('rejects unlinked accounts and drops a previous registration for that tab', async () => {
  await registerTab(7, 'me@gmail.com');
  await expect(registerTab(7, 'stranger@gmail.com')).resolves.toBe(false);
  await expect(getLinkedTab(7)).resolves.toBeNull();
});

it('caches linked mailboxes for 5 minutes', async () => {
  await registerTab(1, 'me@gmail.com');
  await registerTab(2, 'me@outlook.com');
  expect(mockCheckAuth).toHaveBeenCalledTimes(1);

  const session = mock.sessionStore.linkedSession as { fetchedAt: number };
  session.fetchedAt -= 5 * 60 * 1000 + 1;
  await registerTab(3, 'me@gmail.com');
  expect(mockCheckAuth).toHaveBeenCalledTimes(2);
});

it('keeps the last known mailboxes when the server is unreachable', async () => {
  await registerTab(1, 'me@gmail.com');
  (mock.sessionStore.linkedSession as { fetchedAt: number }).fetchedAt = 0;
  mockCheckAuth.mockResolvedValue({ ok: false, reason: 'server_unreachable' });
  await expect(registerTab(2, 'me@gmail.com')).resolves.toBe(true);
});

it('clears everything when the PostMail session is invalid', async () => {
  await registerTab(1, 'me@gmail.com');
  (mock.sessionStore.linkedSession as { fetchedAt: number }).fetchedAt = 0;
  mockCheckAuth.mockResolvedValue({ ok: false, reason: 'token_invalid' });
  await expect(registerTab(2, 'me@gmail.com')).resolves.toBe(false);
  await expect(getLinkedTab(1)).resolves.toBeNull();
});

it('keeps concurrent registrations from different tabs', async () => {
  await Promise.all([registerTab(1, 'me@gmail.com'), registerTab(2, 'me@outlook.com'), registerTab(3, 'me@gmail.com')]);
  await expect(getLinkedTab(1)).resolves.not.toBeNull();
  await expect(getLinkedTab(2)).resolves.not.toBeNull();
  await expect(getLinkedTab(3)).resolves.not.toBeNull();
});

it('forgets closed tabs and clears on PostMail login changes', async () => {
  watchLinkedTabLifecycle();
  await registerTab(1, 'me@gmail.com');
  await registerTab(2, 'me@gmail.com');

  mock.chrome.tabs.onRemoved.emit(1);
  await flushPromises();
  await expect(getLinkedTab(1)).resolves.toBeNull();
  await expect(getLinkedTab(2)).resolves.not.toBeNull();

  mock.chrome.storage.onChanged.emit({ apiToken: { newValue: 'other-token' } }, 'local');
  await flushPromises();
  await expect(getLinkedTab(2)).resolves.toBeNull();
  expect(mock.sessionStore.linkedSession).toBeUndefined();
});

it('unregisterTab and clearLinkedState are safe on empty storage', async () => {
  await expect(unregisterTab(99)).resolves.toBeUndefined();
  await expect(clearLinkedState()).resolves.toBeUndefined();
});
