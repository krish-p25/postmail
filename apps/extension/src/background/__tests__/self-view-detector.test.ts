/* eslint-disable @typescript-eslint/no-explicit-any */
jest.mock('../../shared/api', () => ({ reportSelfView: jest.fn() }));
jest.mock('../linked-tabs', () => ({ getLinkedTab: jest.fn(), clearLinkedState: jest.fn() }));

import { reportSelfView } from '../../shared/api';
import { clearLinkedState, getLinkedTab } from '../linked-tabs';
import { createChromeMock, flushPromises } from '../../test-utils/chrome-mock';
import { extractPixelToken, handleCompletedRequest, registerSelfViewDetector, SELF_VIEW_URL_PATTERNS } from '../self-view-detector';

const TOKEN = 'cb65489a-59c0-467f-8494-e84356d8f472';
const GMAIL_URL = `https://ci3.googleusercontent.com/meips/ADKq_Napu7=s0-d-e1-ft#https://postmail.krishrp.xyz/api/o/${TOKEN}`;
const OUTLOOK_URL = `https://postmail.krishrp.xyz/api/o/${TOKEN}`;

const mockReport = reportSelfView as jest.Mock;
const mockGetLinkedTab = getLinkedTab as jest.Mock;
const mockClear = clearLinkedState as jest.Mock;

function details(overrides: Partial<chrome.webRequest.WebResponseCacheDetails> = {}): chrome.webRequest.WebResponseCacheDetails {
  return {
    requestId: '1',
    url: GMAIL_URL,
    method: 'GET',
    frameId: 0,
    parentFrameId: -1,
    tabId: 42,
    type: 'image',
    timeStamp: Date.now(),
    initiator: 'https://mail.google.com',
    statusCode: 200,
    statusLine: 'HTTP/1.1 200',
    fromCache: false,
    ...overrides,
  } as chrome.webRequest.WebResponseCacheDetails;
}

beforeEach(() => {
  (global as any).chrome = createChromeMock().chrome;
  mockReport.mockReset().mockResolvedValue('labelled');
  mockGetLinkedTab.mockReset().mockResolvedValue({ accountEmail: 'me@gmail.com', registeredAt: 1 });
  mockClear.mockReset().mockResolvedValue(undefined);
});

describe('extractPixelToken', () => {
  it('reads the token from a Gmail proxy URL fragment and an Outlook direct URL', () => {
    expect(extractPixelToken(GMAIL_URL)).toBe(TOKEN);
    expect(extractPixelToken(OUTLOOK_URL)).toBe(TOKEN);
    expect(extractPixelToken('https://lh3.googleusercontent.com/a/avatar=s32')).toBeNull();
  });
});

describe('handleCompletedRequest', () => {
  it('reports a Gmail proxied pixel from a linked tab', async () => {
    await expect(handleCompletedRequest(details())).resolves.toBe(true);
    expect(mockReport).toHaveBeenCalledWith(TOKEN, 'me@gmail.com');
  });

  it('reports an Outlook direct pixel from a linked tab', async () => {
    mockGetLinkedTab.mockResolvedValue({ accountEmail: 'me@outlook.com', registeredAt: 1 });
    await handleCompletedRequest(details({ url: OUTLOOK_URL, initiator: 'https://outlook.live.com' }));
    expect(mockReport).toHaveBeenCalledWith(TOKEN, 'me@outlook.com');
  });

  it('does nothing for tabs that are not registered as linked', async () => {
    mockGetLinkedTab.mockResolvedValue(null);
    await expect(handleCompletedRequest(details())).resolves.toBe(false);
    expect(mockReport).not.toHaveBeenCalled();
  });

  it('does not even look up background requests (tabId -1)', async () => {
    await handleCompletedRequest(details({ tabId: -1 }));
    expect(mockGetLinkedTab).not.toHaveBeenCalled();
  });

  it.each([
    ['served from cache', { fromCache: true }],
    ['non-200', { statusCode: 404 }],
    ['non-mail initiator', { initiator: 'https://evil.example' }],
    ['no token in URL', { url: 'https://lh3.googleusercontent.com/a/avatar=s32' }],
  ])('ignores requests %s', async (_label, overrides) => {
    await expect(handleCompletedRequest(details(overrides))).resolves.toBe(false);
    expect(mockReport).not.toHaveBeenCalled();
  });

  it('reports every completed request, even for the same token (no dedupe)', async () => {
    await handleCompletedRequest(details());
    await handleCompletedRequest(details({ requestId: '2' }));
    expect(mockReport).toHaveBeenCalledTimes(2);
  });

  it('clears linked state when the API says the session is invalid', async () => {
    mockReport.mockResolvedValue('unauthorized');
    await handleCompletedRequest(details());
    expect(mockClear).toHaveBeenCalled();
  });
});

describe('registerSelfViewDetector', () => {
  it('listens to completed image requests on the pixel URL patterns', async () => {
    const { chrome } = createChromeMock();
    (global as any).chrome = chrome;
    registerSelfViewDetector();
    expect(chrome.webRequest.onCompleted.addListener).toHaveBeenCalledWith(expect.any(Function), {
      urls: SELF_VIEW_URL_PATTERNS,
      types: ['image'],
    });
    chrome.webRequest.onCompleted.emit(details());
    await flushPromises();
    expect(mockReport).toHaveBeenCalledWith(TOKEN, 'me@gmail.com');
  });

  it('does not throw when the webRequest permission is missing', () => {
    (global as any).chrome = { ...createChromeMock().chrome, webRequest: undefined };
    expect(() => registerSelfViewDetector()).not.toThrow();
  });
});
