import { ComposeManager, ComposeManagerConfig } from './compose-manager';
import { ExtensionMessage } from '../shared/messaging';
import { showAuthBanner, removeAuthBanner } from './auth-banner';
import { getSenderEmail as gmailGetCurrentEmail } from './gmail/selectors';
import { getSenderEmail as outlookGetCurrentEmail } from './outlook/selectors';
import { InboxTracker } from './gmail/inbox-tracker';
import { OutlookInboxTracker } from './outlook/inbox-tracker';

// Gmail imports
import { ComposeDetector as GmailComposeDetector } from './gmail/compose-detector';
import { RecipientReader as GmailRecipientReader } from './gmail/recipient-reader';
import { findComposeBody as gmailFindBody, getSenderEmail as gmailGetSenderEmail, findReplySubject } from './gmail/selectors';

// Outlook imports
import { OutlookComposeDetector } from './outlook/compose-detector';
import { OutlookRecipientReader } from './outlook/recipient-reader';
import { findComposeBody as outlookFindBody, findComposeSubject as outlookFindSubject, findReplySubject as outlookFindReplySubject, getSenderEmail as outlookGetSenderEmail } from './outlook/selectors';

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
      // New compose dialogs have a subjectbox input
      const input = composeElement.querySelector('input[name="subjectbox"]') as HTMLInputElement;
      if (input) return input.value || '';
      // Inline reply/forward — read subject from thread heading
      return findReplySubject(composeElement);
    },
    getSenderEmail: gmailGetSenderEmail,
    provider: 'gmail',
  };
}

function buildOutlookConfig(): ComposeManagerConfig {
  return {
    createDetector: (callbacks) => new OutlookComposeDetector(callbacks),
    createRecipientReader: (element) => new OutlookRecipientReader(element),
    findBody: (composeElement) => outlookFindBody(composeElement),
    findSubject: (composeElement) => {
      // Full compose windows have a subject input
      const subject = outlookFindSubject(composeElement);
      if (subject) return subject;
      // Inline reply/forward — read subject from conversation heading
      return outlookFindReplySubject(composeElement);
    },
    getSenderEmail: outlookGetSenderEmail,
    provider: 'outlook',
  };
}

function init(): void {
  const provider = getProvider();
  if (!provider) return;

  const config = provider === 'gmail' ? buildGmailConfig() : buildOutlookConfig();
  const manager = new ComposeManager(config);

  // Load initial tracking state
  try {
    chrome.runtime.sendMessage({ type: 'GET_TRACKING_STATE' }, (response) => {
      if (chrome.runtime.lastError) return;
      if (response) manager.setTrackingEnabled(response.trackingEnabled);
      manager.start();
    });
  } catch {
    manager.start();
  }

  // Run auth preflight — show setup toast immediately if not authenticated
  runAuthPreflight();

  // Listen for tracking state changes from popup
  chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
    if (message.type === 'TRACKING_STATE_CHANGED') {
      manager.setTrackingEnabled(message.enabled);
    }
  });
}

function getCurrentEmail(provider: 'gmail' | 'outlook'): string | null {
  return provider === 'gmail' ? gmailGetCurrentEmail() : outlookGetCurrentEmail();
}

/** Retry email detection up to `attempts` times with a delay between each. */
function detectEmailWithRetry(
  provider: 'gmail' | 'outlook',
  attempts: number,
  delayMs: number,
): Promise<string | null> {
  return new Promise((resolve) => {
    let remaining = attempts;
    function tryDetect(): void {
      const email = getCurrentEmail(provider);
      if (email) { resolve(email); return; }
      remaining--;
      if (remaining <= 0) { resolve(null); return; }
      setTimeout(tryDetect, delayMs);
    }
    tryDetect();
  });
}

function runAuthPreflight(): void {
  const provider = getProvider();
  if (!provider) return;

  try {
    chrome.runtime.sendMessage({ type: 'CHECK_AUTH' }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('[PostMail] Auth preflight failed:', chrome.runtime.lastError.message);
        return;
      }

      if (response?.ok) {
        const linkedEmails: string[] = response.linkedEmails || [];
        // Retry email detection — SPA DOM may not be ready yet
        detectEmailWithRetry(provider, 6, 500).then((currentEmail) => {
          showAuthBanner('ok', linkedEmails, currentEmail);
        });
        // Start inbox tracking overlay
        if (provider === 'gmail') {
          const tracker = new InboxTracker();
          tracker.start();
        } else if (provider === 'outlook') {
          const tracker = new OutlookInboxTracker();
          tracker.start();
        }
      } else {
        const reason = response?.reason || 'no_token';
        showAuthBanner(reason);
      }
    });
  } catch (err) {
    console.warn('[PostMail] Auth preflight error:', err);
  }
}

init();
