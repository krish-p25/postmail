import { ExtensionMessage, TrackingStateResponse, RegisterResponse, VerifyResponse } from '../shared/messaging';
import { getTrackingEnabled, setTrackingEnabled } from '../shared/storage';
import { registerTrackedEmail, updateTrackedEmail, verifyEmailSent, discardTrackedEmail, checkAuth, getTrackedEmails, PreflightResult, TrackedEmailInfo } from '../shared/api';

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse: (response: TrackingStateResponse | RegisterResponse | VerifyResponse | { success: boolean } | PreflightResult | { emails: TrackedEmailInfo[] }) => void) => {

    if (message.type === 'GET_TRACKING_STATE') {
      getTrackingEnabled().then((enabled) => sendResponse({ trackingEnabled: enabled }));
      return true;
    }

    if (message.type === 'SET_TRACKING_STATE') {
      setTrackingEnabled(message.enabled).then(() => sendResponse({ trackingEnabled: message.enabled }));
      return true;
    }

    if (message.type === 'CHECK_AUTH') {
      checkAuth()
        .then((res) => sendResponse(res))
        .catch((err) => {
          console.error('[PostMail] Auth check failed:', err);
          sendResponse({ ok: false, reason: 'server_unreachable', detail: String(err) });
        });
      return true;
    }

    if (message.type === 'REGISTER_TRACKED_EMAIL') {
      registerTrackedEmail(message.trackingToken, message.recipients, message.subject, message.senderEmail, message.provider)
        .then((res) => sendResponse(res))
        .catch((err) => {
          console.error('[PostMail] Registration failed:', err);
          sendResponse({ id: '', trackingToken: message.trackingToken, status: 'failed' });
        });
      return true;
    }

    if (message.type === 'UPDATE_TRACKED_EMAIL') {
      updateTrackedEmail(message.trackingToken, message.recipients, message.subject, message.senderEmail, message.provider)
        .then((res) => sendResponse(res))
        .catch(() => sendResponse({ success: false }));
      return true;
    }

    if (message.type === 'VERIFY_EMAIL_SENT') {
      verifyEmailSent(message.trackingToken, message.senderEmail, message.provider)
        .then((res) => sendResponse(res))
        .catch(() => sendResponse({ found: false, authError: false }));
      return true;
    }

    if (message.type === 'GET_TRACKED_EMAILS') {
      getTrackedEmails()
        .then((emails) => sendResponse({ emails }))
        .catch(() => sendResponse({ emails: [] }));
      return true;
    }

    if (message.type === 'DISCARD_TRACKED_EMAIL') {
      discardTrackedEmail(message.trackingToken)
        .then(() => sendResponse({ success: true }))
        .catch(() => sendResponse({ success: false }));
      return true;
    }

    return false;
  },
);

// Initialize default state on install
chrome.runtime.onInstalled.addListener(() => {
  setTrackingEnabled(true);
});
