import { ComposeTrackingState, TrackingInfo, buildTrackingUrl } from '@postmail/shared';
import { generateTrackingToken } from './token-generator';
import { PixelInjector } from './pixel-injector';

/**
 * Manages the tracking lifecycle for a single Gmail compose window.
 *
 * Injects the tracking pixel immediately on creation (when compose is detected).
 * Recipients are tracked separately and sent to the API when available.
 */
export class ComposeTracker {
  private state: ComposeTrackingState = ComposeTrackingState.WAITING_FOR_RECIPIENT;
  private trackingToken: string;
  private trackingUrl: string;
  private recipients: string[] = [];
  private injector: PixelInjector;
  private trackingEnabled: boolean;
  private composeElement: HTMLElement;
  private registered = false;
  private cancelled = false;

  constructor(
    private composeId: string,
    element: HTMLElement,
    trackingEnabled: boolean,
  ) {
    this.trackingEnabled = trackingEnabled;
    this.composeElement = element;
    this.injector = new PixelInjector(element);

    // Generate token immediately
    this.trackingToken = generateTrackingToken();
    this.trackingUrl = buildTrackingUrl(this.trackingToken);
    console.log(`[PostMail][Tracker:${composeId}] Created, tracking=${trackingEnabled}, token=${this.trackingToken.substring(0, 8)}...`);

    // Inject pixel immediately if tracking is enabled
    if (trackingEnabled) {
      this.injectPixel();
    }
  }

  private injectPixel(): void {
    const success = this.injector.inject(this.trackingUrl);
    console.log(`[PostMail][Tracker:${this.composeId}] Immediate pixel injection: ${success ? 'SUCCESS' : 'FAILED'}`);

    if (success) {
      this.state = ComposeTrackingState.PIXEL_INJECTED;
    } else {
      // Body might not be ready yet — retry after a short delay
      console.log(`[PostMail][Tracker:${this.composeId}] Retrying pixel injection in 500ms...`);
      setTimeout(() => {
        if (this.cancelled || this.state === ComposeTrackingState.CLEANED_UP) return;
        const retrySuccess = this.injector.inject(this.trackingUrl);
        console.log(`[PostMail][Tracker:${this.composeId}] Retry pixel injection: ${retrySuccess ? 'SUCCESS' : 'FAILED'}`);
        if (retrySuccess) {
          this.state = ComposeTrackingState.PIXEL_INJECTED;
        }
      }, 500);
    }
  }

  handleRecipientChange(recipients: string[]): void {
    this.recipients = recipients;
    console.log(`[PostMail][Tracker:${this.composeId}] Recipients changed:`, recipients);

    if (this.cancelled || !this.trackingEnabled) return;

    // Register with API once we have recipients
    if (recipients.length > 0 && !this.registered) {
      this.registerWithApi();
    }
  }

  getInfo(): TrackingInfo {
    return {
      composeId: this.composeId,
      trackingToken: this.trackingToken,
      trackingUrl: this.trackingUrl,
      recipients: [...this.recipients],
      state: this.state,
      injected: this.injector.isInjected(),
    };
  }

  getSubject(): string {
    const subjectInput = this.composeElement.querySelector('input[name="subjectbox"]') as HTMLInputElement;
    const subject = subjectInput?.value || '';
    console.log(`[PostMail][Tracker:${this.composeId}] Read subject: "${subject}"`);
    return subject;
  }

  isPixelInjected(): boolean {
    return this.state === ComposeTrackingState.PIXEL_INJECTED || this.injector.isInjected();
  }

  isCancelled(): boolean {
    return this.cancelled;
  }

  /** Cancel tracking — remove pixel, mark as cancelled */
  cancelTracking(): void {
    console.log(`[PostMail][Tracker:${this.composeId}] Tracking CANCELLED`);
    this.cancelled = true;
    this.injector.remove();

    // Discard on the API if we registered
    if (this.registered) {
      try {
        chrome.runtime.sendMessage(
          { type: 'DISCARD_TRACKED_EMAIL', trackingToken: this.trackingToken },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error(`[PostMail][Tracker:${this.composeId}] Discard failed:`, chrome.runtime.lastError.message);
              return;
            }
            console.log(`[PostMail][Tracker:${this.composeId}] Discard response:`, response);
          },
        );
      } catch (err) {
        console.error(`[PostMail][Tracker:${this.composeId}] Discard sendMessage threw:`, err);
      }
    }
  }

  cleanup(): void {
    console.log(`[PostMail][Tracker:${this.composeId}] Cleanup`);
    this.injector.remove();
    this.state = ComposeTrackingState.CLEANED_UP;
  }

  private registerWithApi(): void {
    const subject = this.getSubject();
    console.log(`[PostMail][Tracker:${this.composeId}] Registering with API...`, {
      token: this.trackingToken.substring(0, 8) + '...',
      recipients: this.recipients,
      subject,
    });

    try {
      chrome.runtime.sendMessage(
        {
          type: 'REGISTER_TRACKED_EMAIL',
          trackingToken: this.trackingToken,
          recipients: this.recipients,
          subject,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error(`[PostMail][Tracker:${this.composeId}] Registration failed:`, chrome.runtime.lastError.message);
            return;
          }
          console.log(`[PostMail][Tracker:${this.composeId}] Registration response:`, response);
          this.registered = true;
        },
      );
    } catch (err) {
      console.error(`[PostMail][Tracker:${this.composeId}] Register sendMessage threw:`, err);
    }
  }
}
