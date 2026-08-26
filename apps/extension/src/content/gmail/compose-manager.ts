import { TrackingInfo } from '@postmail/shared';
import { ComposeDetector } from './compose-detector';
import { RecipientReader } from './recipient-reader';
import { ComposeTracker } from '../tracking/compose-tracker';
import { TrackingToast } from './tracking-toast';

interface ComposeInstance {
  id: string;
  element: HTMLElement;
  tracker: ComposeTracker;
  recipientReader: RecipientReader;
  toast: TrackingToast;
}

/**
 * Orchestrates multiple Gmail compose window lifecycles.
 *
 * Flow:
 *   1. Compose detected → inject pixel immediately → show "Tracking" toast with "Don't track" button
 *   2. Recipients added → register/update tracking with API
 *   3. "Don't track" clicked → remove pixel, cancel tracking, dismiss toast
 *   4. Compose removed → verify sent status → show result toast
 */
export class ComposeManager {
  private composes = new Map<HTMLElement, ComposeInstance>();
  private detector: ComposeDetector;
  private nextId = 0;
  private trackingEnabled = true;

  constructor() {
    this.detector = new ComposeDetector({
      onComposeDetected: (el) => this.handleComposeDetected(el),
      onComposeRemoved: (el) => this.handleComposeRemoved(el),
    });
    console.log('[PostMail][Manager] Created');
  }

  start(): void {
    console.log('[PostMail][Manager] Starting compose detector...');
    this.detector.start();
  }

  stop(): void {
    this.detector.stop();
    for (const [, instance] of this.composes) {
      instance.tracker.cleanup();
      instance.recipientReader.stop();
    }
    this.composes.clear();
  }

  setTrackingEnabled(enabled: boolean): void {
    this.trackingEnabled = enabled;
    console.log(`[PostMail][Manager] Tracking ${enabled ? 'enabled' : 'disabled'}`);
  }

  getComposeCount(): number {
    return this.composes.size;
  }

  getAllTrackingInfo(): TrackingInfo[] {
    return Array.from(this.composes.values()).map((instance) => instance.tracker.getInfo());
  }

  private handleComposeDetected(element: HTMLElement): void {
    if (!this.trackingEnabled) {
      console.log('[PostMail][Manager] Tracking disabled, ignoring compose');
      return;
    }

    const id = `compose-${++this.nextId}`;
    console.log(`[PostMail][Manager] Compose DETECTED: ${id}`);

    const tracker = new ComposeTracker(id, element, this.trackingEnabled);
    const recipientReader = new RecipientReader(element);
    const toast = new TrackingToast();

    // Show "Tracking" toast immediately with "Don't track" button
    toast.show('tracking', { subject: '', recipient: '' }, () => {
      // "Don't track" callback
      console.log(`[PostMail][Manager] User cancelled tracking for ${id}`);
      tracker.cancelTracking();
      toast.update('cancelled', { subject: '', recipient: '' });
    });

    recipientReader.onChange((recipients) => {
      console.log(`[PostMail][Manager] ${id} recipients changed:`, recipients);
      tracker.handleRecipientChange(recipients);
    });
    recipientReader.start();

    this.composes.set(element, { id, element, tracker, recipientReader, toast });
  }

  private handleComposeRemoved(element: HTMLElement): void {
    const instance = this.composes.get(element);
    if (!instance) {
      console.log('[PostMail][Manager] Compose removed but no instance found');
      return;
    }

    // Read info BEFORE cleanup (DOM is about to be gone)
    const info = instance.tracker.getInfo();
    const subject = instance.tracker.getSubject();

    // Fallback: if the observer didn't pick up recipients, read them now
    let recipient = info.recipients[0] || '';
    if (!recipient) {
      const fallbackRecipients = instance.recipientReader.readRecipients();
      console.log(`[PostMail][Manager] Fallback recipient read for ${instance.id}:`, fallbackRecipients);
      recipient = fallbackRecipients[0] || '';
      if (fallbackRecipients.length > 0) {
        instance.tracker.handleRecipientChange(fallbackRecipients);
      }
    }
    console.log(`[PostMail][Manager] Compose REMOVED: ${instance.id}`, {
      state: info.state,
      token: info.trackingToken ? info.trackingToken.substring(0, 8) + '...' : 'none',
      injected: info.injected,
      pixelInjected: instance.tracker.isPixelInjected(),
      cancelled: instance.tracker.isCancelled(),
      recipients: info.recipients,
      subject,
    });

    if (instance.tracker.isCancelled()) {
      console.log(`[PostMail][Manager] Tracking was cancelled for ${instance.id}, skipping verification`);
      instance.tracker.cleanup();
      instance.recipientReader.stop();
      this.composes.delete(element);
      return;
    }

    // Dismiss the "Tracking" toast and show verification flow
    const trackingToken = info.trackingToken;
    const allRecipients = info.recipients.length > 0 ? info.recipients : (recipient ? [recipient] : []);
    if (trackingToken) {
      console.log(`[PostMail][Manager] Starting verification for ${instance.id}`);

      // Update tracked email with final subject & recipients (may have changed since registration)
      this.updateTrackedEmail(trackingToken, allRecipients, subject);

      // Update existing toast to "verifying"
      instance.toast.update('verifying', { subject, recipient });

      this.verifySent(trackingToken, instance.toast, { subject, recipient });
    } else {
      console.log(`[PostMail][Manager] No token for ${instance.id}, skipping verification`);
    }

    instance.tracker.cleanup();
    instance.recipientReader.stop();
    this.composes.delete(element);
  }

  private updateTrackedEmail(trackingToken: string, recipients: string[], subject: string): void {
    const tokenPreview = trackingToken.substring(0, 8) + '...';
    console.log(`[PostMail][Manager] Updating tracked email ${tokenPreview}`, { recipients, subject });

    try {
      chrome.runtime.sendMessage(
        { type: 'UPDATE_TRACKED_EMAIL', trackingToken, recipients, subject },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error('[PostMail][Manager] Update failed:', chrome.runtime.lastError.message);
            return;
          }
          console.log(`[PostMail][Manager] Update response:`, response);
        },
      );
    } catch (err) {
      console.error('[PostMail][Manager] Update sendMessage threw:', err);
    }
  }

  private verifySent(
    trackingToken: string,
    toast: TrackingToast,
    data: { subject: string; recipient: string },
  ): void {
    const tokenPreview = trackingToken.substring(0, 8) + '...';
    console.log(`[PostMail][Manager] Verifying sent status for token ${tokenPreview}`);

    try {
      chrome.runtime.sendMessage(
        { type: 'VERIFY_EMAIL_SENT', trackingToken },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error('[PostMail][Manager] Verify failed:', chrome.runtime.lastError.message);
            toast.update('error', data);
            return;
          }

          console.log(`[PostMail][Manager] Verify response:`, response);

          if (response?.found) {
            console.log(`[PostMail][Manager] Email confirmed SENT for ${tokenPreview}`);
            toast.update('success', data);
            return;
          }

          // Retry once after 2s — Gmail may have latency indexing the message
          console.log(`[PostMail][Manager] Email not found yet, retrying in 2s for ${tokenPreview}`);
          setTimeout(() => {
            try {
              chrome.runtime.sendMessage(
                { type: 'VERIFY_EMAIL_SENT', trackingToken },
                (retryResponse) => {
                  if (chrome.runtime.lastError) {
                    console.error('[PostMail][Manager] Retry verify failed:', chrome.runtime.lastError.message);
                    toast.update('error', data);
                    return;
                  }

                  console.log(`[PostMail][Manager] Retry response:`, retryResponse);

                  if (retryResponse?.found) {
                    console.log(`[PostMail][Manager] Email confirmed SENT on retry for ${tokenPreview}`);
                    toast.update('success', data);
                  } else {
                    console.log(`[PostMail][Manager] Email not found after retry — marking as DRAFT for ${tokenPreview}`);
                    toast.update('draft', data);
                  }
                },
              );
            } catch (err) {
              console.error('[PostMail][Manager] Retry sendMessage threw (extension context invalidated?):', err);
              toast.update('error', data);
            }
          }, 2000);
        },
      );
    } catch (err) {
      console.error('[PostMail][Manager] sendMessage threw (extension context invalidated?):', err);
      toast.update('error', data);
    }
  }
}
