import { ComposeTrackingState, TrackingInfo, buildTrackingUrl } from '@postmail/shared';
import { generateTrackingToken } from './token-generator';
import { PixelInjector } from './pixel-injector';

/**
 * Manages the tracking lifecycle for a single Gmail compose window.
 *
 * State machine:
 *   WAITING_FOR_RECIPIENT → TRACKING_INITIALIZED → PIXEL_INJECTED
 *                         ← (recipients cleared)
 *   Any state → CLEANED_UP (via cleanup())
 */
export class ComposeTracker {
  private state: ComposeTrackingState = ComposeTrackingState.WAITING_FOR_RECIPIENT;
  private trackingToken = '';
  private trackingUrl = '';
  private recipients: string[] = [];
  private injector: PixelInjector;
  private trackingEnabled: boolean;

  constructor(
    private composeId: string,
    element: HTMLElement,
    trackingEnabled: boolean,
  ) {
    this.trackingEnabled = trackingEnabled;
    this.injector = new PixelInjector(element);
  }

  handleRecipientChange(recipients: string[]): void {
    this.recipients = recipients;

    if (recipients.length === 0) {
      this.injector.remove();
      this.trackingToken = '';
      this.trackingUrl = '';
      this.state = ComposeTrackingState.WAITING_FOR_RECIPIENT;
      return;
    }

    if (!this.trackingEnabled) return;

    this.trackingToken = generateTrackingToken();
    this.trackingUrl = buildTrackingUrl(this.trackingToken);
    this.state = ComposeTrackingState.TRACKING_INITIALIZED;

    const success = this.injector.inject(this.trackingUrl);
    if (success) {
      this.state = ComposeTrackingState.PIXEL_INJECTED;
    }

    this.logState();
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

  cleanup(): void {
    this.injector.remove();
    this.state = ComposeTrackingState.CLEANED_UP;
  }

  private logState(): void {
    const tokenPreview = this.trackingToken ? this.trackingToken.substring(0, 8) + '...' : 'none';
    console.log(`[PostMail] Compose ${this.composeId}:`, {
      state: this.state,
      token: tokenPreview,
      recipients: this.recipients,
      injected: this.injector.isInjected(),
    });
  }
}
