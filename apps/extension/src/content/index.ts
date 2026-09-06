import { ComposeManager, ComposeManagerConfig } from './compose-manager';
import { TrackingToast } from './gmail/tracking-toast';
import { ExtensionMessage } from '../shared/messaging';

// Gmail imports
import { ComposeDetector as GmailComposeDetector } from './gmail/compose-detector';
import { RecipientReader as GmailRecipientReader } from './gmail/recipient-reader';
import { findComposeBody as gmailFindBody } from './gmail/selectors';

// Outlook imports
import { OutlookComposeDetector } from './outlook/compose-detector';
import { OutlookRecipientReader } from './outlook/recipient-reader';
import { findComposeBody as outlookFindBody, findComposeSubject as outlookFindSubject } from './outlook/selectors';

/**
 * PostMail content script entry point.
 *
 * Runs on Gmail and Outlook Web. Detects the mail provider from the hostname,
 * starts the ComposeManager with the appropriate provider config, and handles
 * auth preflight and tracking state messages from the background/popup.
 */

const OUTLOOK_HOSTS = ['outlook.office.com', 'outlook.live.com', 'outlook.office365.com'];

function getProvider(): 'gmail' | 'outlook' | null {
  const host = window.location.hostname;
  if (host === 'mail.google.com') return 'gmail';
  if (OUTLOOK_HOSTS.includes(host)) return 'outlook';
  return null;
}

function buildGmailConfig(): ComposeManagerConfig {
  return {
    createDetector: (callbacks) => new GmailComposeDetector(callbacks),
    createRecipientReader: (element) => new GmailRecipientReader(element),
    findBody: (composeElement) => gmailFindBody(composeElement),
    findSubject: (composeElement) => {
      const input = composeElement.querySelector('input[name="subjectbox"]') as HTMLInputElement;
      return input?.value || '';
    },
  };
}

function buildOutlookConfig(): ComposeManagerConfig {
  return {
    createDetector: (callbacks) => new OutlookComposeDetector(callbacks),
    createRecipientReader: (element) => new OutlookRecipientReader(element),
    findBody: (composeElement) => outlookFindBody(composeElement),
    findSubject: (composeElement) => outlookFindSubject(composeElement),
  };
}

function init(): void {
  const provider = getProvider();
  if (!provider) return;

  console.log(`[PostMail] Content script loaded on ${provider}`);

  const config = provider === 'gmail' ? buildGmailConfig() : buildOutlookConfig();
  const manager = new ComposeManager(config);

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

init();
