import { ExtensionMessage, TrackingStateResponse, RegisterResponse, VerifyResponse } from '../shared/messaging';
import { getTrackingEnabled, setTrackingEnabled } from '../shared/storage';
import { registerTrackedEmail, updateTrackedEmail, verifyEmailSent, discardTrackedEmail, checkAuth, PreflightResult } from '../shared/api';

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, sender, sendResponse: (response: TrackingStateResponse | RegisterResponse | VerifyResponse | { success: boolean } | PreflightResult) => void) => {
    const from = sender.tab ? `tab:${sender.tab.id}` : 'popup';
    console.log(`[PostMail][SW] Message received from ${from}:`, message.type);

    if (message.type === 'GET_TRACKING_STATE') {
      getTrackingEnabled().then((enabled) => {
        console.log(`[PostMail][SW] Tracking state: ${enabled}`);
        sendResponse({ trackingEnabled: enabled });
      });
      return true;
    }

    if (message.type === 'SET_TRACKING_STATE') {
      setTrackingEnabled(message.enabled).then(() => {
        console.log(`[PostMail][SW] Tracking state set to: ${message.enabled}`);
        sendResponse({ trackingEnabled: message.enabled });
      });
      return true;
    }

    if (message.type === 'CHECK_AUTH') {
      console.log(`[PostMail][SW] Checking auth...`);
      checkAuth()
        .then((res) => {
          console.log(`[PostMail][SW] Auth check result:`, res);
          sendResponse(res);
        })
        .catch((err) => {
          console.error(`[PostMail][SW] Auth check FAILED:`, err);
          sendResponse({ ok: false, reason: 'server_unreachable', detail: String(err) });
        });
      return true;
    }

    if (message.type === 'REGISTER_TRACKED_EMAIL') {
      console.log(`[PostMail][SW] Registering tracked email...`, {
        token: message.trackingToken.substring(0, 8) + '...',
        recipients: message.recipients,
        subject: message.subject,
      });
      registerTrackedEmail(message.trackingToken, message.recipients, message.subject)
        .then((res) => {
          console.log(`[PostMail][SW] Registration SUCCESS:`, res);
          sendResponse(res);
        })
        .catch((err) => {
          console.error(`[PostMail][SW] Registration FAILED:`, err);
          sendResponse({ id: '', trackingToken: message.trackingToken, status: 'failed' });
        });
      return true;
    }

    if (message.type === 'UPDATE_TRACKED_EMAIL') {
      console.log(`[PostMail][SW] Updating tracked email: ${message.trackingToken.substring(0, 8)}...`);
      updateTrackedEmail(message.trackingToken, message.recipients, message.subject)
        .then((res) => {
          console.log(`[PostMail][SW] Update SUCCESS:`, res);
          sendResponse(res);
        })
        .catch((err) => {
          console.error(`[PostMail][SW] Update FAILED:`, err);
          sendResponse({ success: false });
        });
      return true;
    }

    if (message.type === 'VERIFY_EMAIL_SENT') {
      console.log(`[PostMail][SW] Verifying email sent for token: ${message.trackingToken.substring(0, 8)}...`);
      verifyEmailSent(message.trackingToken)
        .then((res) => {
          console.log(`[PostMail][SW] Verify result:`, res);
          sendResponse(res);
        })
        .catch((err) => {
          console.error(`[PostMail][SW] Verify FAILED:`, err);
          sendResponse({ found: false, authError: false });
        });
      return true;
    }

    if (message.type === 'DISCARD_TRACKED_EMAIL') {
      console.log(`[PostMail][SW] Discarding tracked email: ${message.trackingToken.substring(0, 8)}...`);
      discardTrackedEmail(message.trackingToken)
        .then(() => {
          console.log(`[PostMail][SW] Discard SUCCESS`);
          sendResponse({ success: true });
        })
        .catch((err) => {
          console.error(`[PostMail][SW] Discard FAILED:`, err);
          sendResponse({ success: false });
        });
      return true;
    }

    console.warn(`[PostMail][SW] Unknown message type:`, message);
    return false;
  },
);

// Initialize default state on install
chrome.runtime.onInstalled.addListener(() => {
  setTrackingEnabled(true);
  console.log('[PostMail][SW] Extension installed, tracking enabled by default');
});

console.log('[PostMail][SW] Service worker loaded');
