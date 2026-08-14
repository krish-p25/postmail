import { ExtensionMessage, TrackingStateResponse } from '../shared/messaging';
import { getTrackingEnabled, setTrackingEnabled } from '../shared/storage';

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse: (response: TrackingStateResponse) => void) => {
    if (message.type === 'GET_TRACKING_STATE') {
      getTrackingEnabled().then((enabled) => {
        sendResponse({ trackingEnabled: enabled });
      });
      return true; // Keep message channel open for async response
    }

    if (message.type === 'SET_TRACKING_STATE') {
      setTrackingEnabled(message.enabled).then(() => {
        sendResponse({ trackingEnabled: message.enabled });
      });
      return true;
    }

    return false;
  },
);

// Initialize default state on install
chrome.runtime.onInstalled.addListener(() => {
  setTrackingEnabled(true);
  console.log('[PostMail] Extension installed, tracking enabled by default');
});

console.log('[PostMail] Service worker loaded');
