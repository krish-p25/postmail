import { TrackingInfo } from '@postmail/shared';
import { ComposeTracker } from './tracking/compose-tracker';
import { TrackingToast } from './gmail/tracking-toast';
import { BodyFinder } from './tracking/pixel-injector';
import { SubjectFinder } from './tracking/compose-tracker';

export interface ComposeDetectorCallbacks {
  onComposeDetected: (element: HTMLElement) => void;
  onComposeRemoved: (element: HTMLElement) => void;
}

export interface ComposeDetectorLike {
  start(): void;
  stop(): void;
}

export interface RecipientReaderLike {
  onChange(callback: (recipients: string[]) => void): void;
  start(): void;
  stop(): void;
  readRecipients(): string[];
}

export interface ComposeManagerConfig {
  createDetector: (callbacks: ComposeDetectorCallbacks) => ComposeDetectorLike;
  createRecipientReader: (element: HTMLElement) => RecipientReaderLike;
  findBody: BodyFinder;
  findSubject: SubjectFinder;
  getSenderEmail: () => string | null;
  provider: 'gmail' | 'outlook';
}

interface ComposeInstance {
  id: string;
  element: HTMLElement;
  tracker: ComposeTracker;
  recipientReader: RecipientReaderLike;
  toast: TrackingToast;
}

/**
 * Orchestrates multiple compose window lifecycles for any mail provider.
 *
 * Flow:
 *   1. Compose detected -> inject pixel immediately -> show "Tracking" toast
 *   2. Recipients added -> register/update tracking with API
 *   3. "Don't track" clicked -> remove pixel, cancel tracking, dismiss toast
 *   4. Compose removed -> verify sent status -> show result toast
 */
export class ComposeManager {
  private composes = new Map<HTMLElement, ComposeInstance>();
  private detector: ComposeDetectorLike;
  private config: ComposeManagerConfig;
  private nextId = 0;
  private trackingEnabled = true;

  constructor(config: ComposeManagerConfig) {
    this.config = config;
    this.detector = config.createDetector({
      onComposeDetected: (el) => this.handleComposeDetected(el),
      onComposeRemoved: (el) => this.handleComposeRemoved(el),
    });
  }

  start(): void {
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
  }

  getComposeCount(): number {
    return this.composes.size;
  }

  getAllTrackingInfo(): TrackingInfo[] {
    return Array.from(this.composes.values()).map((instance) => instance.tracker.getInfo());
  }

  private handleComposeDetected(element: HTMLElement): void {
    if (!this.trackingEnabled) return;

    const id = `compose-${++this.nextId}`;

    const tracker = new ComposeTracker(id, element, this.trackingEnabled, this.config.findBody, this.config.findSubject, this.config.getSenderEmail, this.config.provider);
    const recipientReader = this.config.createRecipientReader(element);
    const toast = new TrackingToast();

    // Show "Tracking" toast immediately with "Don't track" button
    toast.show('tracking', { subject: '', recipient: '' }, () => {
      tracker.cancelTracking();
      toast.update('cancelled', { subject: '', recipient: '' });
    });

    recipientReader.onChange((recipients) => {
      tracker.handleRecipientChange(recipients);
    });
    recipientReader.start();

    this.composes.set(element, { id, element, tracker, recipientReader, toast });
  }

  private handleComposeRemoved(element: HTMLElement): void {
    const instance = this.composes.get(element);
    if (!instance) return;

    // Read info BEFORE cleanup (DOM is about to be gone)
    const info = instance.tracker.getInfo();
    const subject = instance.tracker.getSubject();

    // Always read recipients on compose close for freshest data
    const freshRecipients = instance.recipientReader.readRecipients();
    const allRecipients = freshRecipients.length > 0
      ? freshRecipients
      : info.recipients.length > 0
        ? info.recipients
        : [];

    if (freshRecipients.length > 0 && freshRecipients.length !== info.recipients.length) {
      instance.tracker.handleRecipientChange(freshRecipients);
    }

    const recipient = allRecipients[0] || '';

    if (instance.tracker.isCancelled()) {
      instance.tracker.cleanup();
      instance.recipientReader.stop();
      this.composes.delete(element);
      return;
    }

    // Dismiss the "Tracking" toast and show verification flow
    const trackingToken = info.trackingToken;
    const finalRecipients = allRecipients.length > 0 ? allRecipients : (recipient ? [recipient] : []);
    if (trackingToken) {
      // Update tracked email with final subject & recipients (may have changed since registration)
      this.updateTrackedEmail(trackingToken, finalRecipients, subject);

      // Update existing toast to "verifying"
      instance.toast.update('verifying', { subject, recipient });

      this.verifySent(trackingToken, instance.toast, { subject, recipient });
    }

    instance.tracker.cleanup();
    instance.recipientReader.stop();
    this.composes.delete(element);
  }

  private updateTrackedEmail(trackingToken: string, recipients: string[], subject: string): void {
    const senderEmail = this.config.getSenderEmail();
    const provider = this.config.provider;

    try {
      chrome.runtime.sendMessage(
        { type: 'UPDATE_TRACKED_EMAIL', trackingToken, recipients, subject, senderEmail, provider },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error('[PostMail] Update failed:', chrome.runtime.lastError.message);
          }
          void response;
        },
      );
    } catch (err) {
      console.error('[PostMail] Update error:', err);
    }
  }

  private verifySent(
    trackingToken: string,
    toast: TrackingToast,
    data: { subject: string; recipient: string },
  ): void {
    // Delay the first check by 2s to give the mail provider time to index
    setTimeout(() => {
      this.doVerifyAttempt(trackingToken, toast, data, true);
    }, 2000);
  }

  private doVerifyAttempt(
    trackingToken: string,
    toast: TrackingToast,
    data: { subject: string; recipient: string },
    canRetry: boolean,
  ): void {
    const senderEmail = this.config.getSenderEmail();
    const provider = this.config.provider;

    try {
      chrome.runtime.sendMessage(
        { type: 'VERIFY_EMAIL_SENT', trackingToken, senderEmail, provider },
        (response) => {
          if (chrome.runtime.lastError) {
            toast.update('error', data);
            return;
          }

          if (response?.found) {
            toast.update('success', data);
            return;
          }

          if (canRetry) {
            setTimeout(() => {
              this.doVerifyAttempt(trackingToken, toast, data, false);
            }, 2000);
          } else {
            toast.update('draft', data);
          }
        },
      );
    } catch {
      toast.update('error', data);
    }
  }
}
