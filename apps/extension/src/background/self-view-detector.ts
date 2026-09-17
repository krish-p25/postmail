import { reportSelfView } from '../shared/api';
import { clearLinkedState, getLinkedTab } from './linked-tabs';

/**
 * Report pixel loads from mail tabs signed in to linked mailboxes, so the API can
 * label those opens "Likely you".
 *
 * Verified 2026-09-16:
 * - Gmail loads pixels through https://ciN.googleusercontent.com/meips/…#https://postmail…/api/o/<token>,
 *   and webRequest's details.url includes that #fragment.
 * - Outlook web loads https://postmail.krishrp.xyz/api/o/<token> directly.
 * - onCompleted fires after PostMail has stored the open.
 */

export const SELF_VIEW_URL_PATTERNS = ['https://*.googleusercontent.com/*', 'https://postmail.krishrp.xyz/api/o/*'];

const MAIL_ORIGINS = new Set([
  'https://mail.google.com',
  'https://outlook.office.com',
  'https://outlook.live.com',
  'https://outlook.office365.com',
]);

const PIXEL_TOKEN_RE = /\/api\/o\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

export function extractPixelToken(url: string): string | null {
  return url.match(PIXEL_TOKEN_RE)?.[1]?.toLowerCase() ?? null;
}

/** Returns true if a self view was reported. */
export async function handleCompletedRequest(details: chrome.webRequest.WebResponseCacheDetails): Promise<boolean> {
  if (details.tabId < 0) return false;

  // Linked tabs only: for any other tab, stop before inspecting the request.
  const tab = await getLinkedTab(details.tabId);
  if (!tab) return false;

  const token = extractPixelToken(details.url);
  if (!token) return false;
  if (details.statusCode !== 200 || details.fromCache) return false;
  if (!details.initiator || !MAIL_ORIGINS.has(details.initiator)) return false;

  // No per-token dedupe: Google's proxy creates a new open on every view.
  const result = await reportSelfView(token, tab.accountEmail);
  if (result === 'unauthorized') {
    await clearLinkedState();
  } else if (result === 'failed') {
    console.warn(`[PostMail] Could not report self view for ${token.slice(0, 8)}…`);
  }
  return true;
}

/** Must be called synchronously at service worker startup (MV3 requirement for event listeners). */
export function registerSelfViewDetector(): void {
  if (!chrome.webRequest) {
    console.warn('[PostMail] webRequest permission missing; "Likely you" detection is disabled.');
    return;
  }
  chrome.webRequest.onCompleted.addListener(
    (details) => {
      handleCompletedRequest(details).catch((error) => console.error('[PostMail] Self-view detection failed:', error));
    },
    { urls: SELF_VIEW_URL_PATTERNS, types: ['image'] },
  );
}
