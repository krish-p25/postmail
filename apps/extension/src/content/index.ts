import { ComposeManager } from './gmail/compose-manager';
import { TrackingToast } from './gmail/tracking-toast';
import { ExtensionMessage } from '../shared/messaging';

/**
 * PostMail content script entry point.
 *
 * Runs on mail.google.com. Starts the ComposeManager which handles
 * all compose detection, recipient tracking, and pixel injection.
 *
 * On load, runs an auth preflight check against the API. If the JWT
 * is missing or invalid, shows a persistent "Setup required" toast
 * so the user knows before they compose anything.
 */

function init(): void {
  if (window.location.hostname !== 'mail.google.com') {
    return;
  }

  console.log('[PostMail] Content script loaded on Gmail');

  const manager = new ComposeManager();

  // Load initial tracking state
  try {
    chrome.runtime.sendMessage({ type: 'GET_TRACKING_STATE' }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('[PostMail] Could not get tracking state:', chrome.runtime.lastError.message);
      } else if (response) {
        manager.setTrackingEnabled(response.trackingEnabled);
      }
      manager.start();
      console.log('[PostMail] Compose manager started');
    });
  } catch (err) {
    console.warn('[PostMail] Extension context invalidated, starting with defaults');
    manager.start();
  }

  // Run auth preflight — show setup toast immediately if not authenticated
  runAuthPreflight();

  // Listen for tracking state changes from popup
  chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
    if (message.type === 'TRACKING_STATE_CHANGED') {
      manager.setTrackingEnabled(message.enabled);
      console.log(`[PostMail] Tracking ${message.enabled ? 'enabled' : 'disabled'}`);
    }
  });
}

function runAuthPreflight(): void {
  try {
    chrome.runtime.sendMessage({ type: 'CHECK_AUTH' }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('[PostMail] Auth preflight failed:', chrome.runtime.lastError.message);
        return;
      }

      console.log('[PostMail] Auth preflight result:', response);

      if (!response?.ok) {
        const reason = response?.reason || 'unknown';
        const detail = response?.detail || '';
        console.warn(`[PostMail] Auth preflight FAILED | reason=${reason} | ${detail}`);
        const toast = new TrackingToast();
        toast.show('setup', { subject: '', recipient: reason });
      }
    });
  } catch (err) {
    console.warn('[PostMail] Auth preflight sendMessage threw:', err);
  }
}

// Gmail loads content dynamically, so document_idle is fine
init();
