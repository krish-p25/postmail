/* eslint-disable @typescript-eslint/no-explicit-any */
import { MailTabRegistration } from '../mail-tab-registration';

let sendMessage: jest.Mock;
let account: string | null;
let registration: MailTabRegistration | null = null;

beforeEach(() => {
  jest.useFakeTimers();
  sendMessage = jest.fn();
  (global as any).chrome.runtime.sendMessage = sendMessage;
  account = 'Me@Gmail.com';
});

afterEach(() => {
  registration?.stop();
  registration = null;
  jest.useRealTimers();
});

function start(linkedEmails: string[]): MailTabRegistration {
  registration = new MailTabRegistration({ getAccountEmail: () => account, linkedEmails, checkIntervalMs: 30_000 });
  registration.start();
  return registration;
}

it('registers when the tab account is linked', () => {
  start(['me@gmail.com']);
  expect(sendMessage).toHaveBeenCalledWith({ type: 'REGISTER_MAIL_TAB', accountEmail: 'me@gmail.com' }, expect.any(Function));
});

it('never sends anything for an unlinked or undetected account', () => {
  account = 'someone-else@gmail.com';
  start(['me@gmail.com']);
  account = null;
  jest.advanceTimersByTime(60_000);
  expect(sendMessage).not.toHaveBeenCalled();
});

it('re-registers on every check so a restarted service worker recovers', () => {
  start(['me@gmail.com']);
  jest.advanceTimersByTime(60_000);
  expect(sendMessage).toHaveBeenCalledTimes(3);
});

it('unregisters once when the account stops being linked, without sending the new address', () => {
  start(['me@gmail.com']);
  sendMessage.mockClear();
  account = 'someone-else@gmail.com';
  jest.advanceTimersByTime(30_000);
  jest.advanceTimersByTime(30_000);
  expect(sendMessage).toHaveBeenCalledTimes(1);
  expect(sendMessage).toHaveBeenCalledWith({ type: 'UNREGISTER_MAIL_TAB' }, expect.any(Function));
});

it('checks again when the page title changes', async () => {
  // Real timers: fake timers can also hold back the microtasks MutationObserver callbacks use.
  jest.useRealTimers();
  document.head.innerHTML = '<title>Gmail</title>';
  account = null;
  start(['me@gmail.com']);
  expect(sendMessage).not.toHaveBeenCalled();

  account = 'me@gmail.com';
  document.title = 'Inbox - me@gmail.com - Gmail';
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(sendMessage).toHaveBeenCalledWith({ type: 'REGISTER_MAIL_TAB', accountEmail: 'me@gmail.com' }, expect.any(Function));
  document.head.innerHTML = '';
});
