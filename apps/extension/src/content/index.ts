import { ComposeManager } from './gmail/compose-manager';
import { ExtensionMessage } from '../shared/messaging';

/**
 * PostMail content script entry point.
 *
 * Runs on mail.google.com. Starts the ComposeManager which handles
 * all compose detection, recipient tracking, and pixel injection.
 */

function init(): void {
  if (window.location.hostname !== 'mail.google.com') {
    return;
  }

  console.log('[PostMail] Content script loaded on Gmail');

  const manager = new ComposeManager();

  // Load initial tracking state
  chrome.runtime.sendMessage({ type: 'GET_TRACKING_STATE' }, (response) => {
    if (response) {
      manager.setTrackingEnabled(response.trackingEnabled);
    }
    manager.start();
    console.log('[PostMail] Compose manager started');
  });

  // Listen for tracking state changes from popup
  chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
    if (message.type === 'TRACKING_STATE_CHANGED') {
      manager.setTrackingEnabled(message.enabled);
      console.log(`[PostMail] Tracking ${message.enabled ? 'enabled' : 'disabled'}`);
    }
  });
}

// Gmail loads content dynamically, so document_idle is fine
init();
