import { TrackingInfo } from '@postmail/shared';
import { ComposeDetector } from './compose-detector';
import { RecipientReader } from './recipient-reader';
import { ComposeTracker } from '../tracking/compose-tracker';

interface ComposeInstance {
  id: string;
  element: HTMLElement;
  tracker: ComposeTracker;
  recipientReader: RecipientReader;
}

/**
 * Orchestrates multiple Gmail compose window lifecycles.
 *
 * Uses ComposeDetector to discover compose windows, then creates a
 * RecipientReader and ComposeTracker for each one. Handles cleanup
 * when compose windows are removed (sent or discarded).
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
    const id = `compose-${++this.nextId}`;

    const recipientReader = new RecipientReader(element);
    const tracker = new ComposeTracker(id, element, this.trackingEnabled);

    recipientReader.onChange((recipients) => {
      tracker.handleRecipientChange(recipients);
    });
    recipientReader.start();

    this.composes.set(element, { id, element, tracker, recipientReader });
    console.log(`[PostMail] Compose detected: ${id}`);
  }

  private handleComposeRemoved(element: HTMLElement): void {
    const instance = this.composes.get(element);
    if (!instance) return;

    console.log(`[PostMail] Compose removed: ${instance.id}`);
    instance.tracker.cleanup();
    instance.recipientReader.stop();
    this.composes.delete(element);
  }
}
