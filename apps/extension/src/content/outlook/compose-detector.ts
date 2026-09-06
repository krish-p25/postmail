import { findSubjectInputs, findComposeContainer, debugLogDomElements } from './selectors';
import { ComposeDetectorCallbacks } from '../compose-manager';

/**
 * Detects Outlook Web compose window appearance and removal.
 *
 * Uses MutationObserver on document.body to watch for subject inputs
 * (the hallmark of a compose window), then walks up to find the compose
 * container that also holds the message body.
 */
export class OutlookComposeDetector {
  private observer: MutationObserver | null = null;
  private trackedComposes = new Map<HTMLElement, HTMLElement>(); // container → subject input
  private callbacks: ComposeDetectorCallbacks;
  private debugDone = false;

  constructor(callbacks: ComposeDetectorCallbacks) {
    this.callbacks = callbacks;
  }

  start(): void {
    console.log('[PostMail][Outlook:Detector] Starting, scanning for existing compose windows...');
    this.scan();

    this.observer = new MutationObserver(() => this.scan());
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
    console.log('[PostMail][Outlook:Detector] MutationObserver started');
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.trackedComposes.clear();
  }

  private scan(): void {
    const subjectInputs = findSubjectInputs();

    if (!subjectInputs || subjectInputs.length === 0) {
      // No subject inputs found — run debug scan once to help identify selectors
      if (!this.debugDone) {
        // Delay debug scan slightly to let Outlook finish rendering
        setTimeout(() => {
          if (!this.debugDone) {
            this.debugDone = true;
            debugLogDomElements();
          }
        }, 3000);
      }

      // Check for removed composes
      for (const [container] of this.trackedComposes) {
        if (!document.body.contains(container)) {
          console.log('[PostMail][Outlook:Detector] Compose window removed');
          this.trackedComposes.delete(container);
          this.callbacks.onComposeRemoved(container);
        }
      }
      return;
    }

    const currentContainers = new Set<HTMLElement>();

    subjectInputs.forEach((input) => {
      const container = findComposeContainer(input as HTMLElement);
      if (!container) {
        console.log('[PostMail][Outlook:Detector] Subject input found but no compose container (no body textbox ancestor)');
        return;
      }

      currentContainers.add(container);

      if (!this.trackedComposes.has(container)) {
        console.log('[PostMail][Outlook:Detector] New compose window found');
        this.trackedComposes.set(container, input as HTMLElement);
        this.callbacks.onComposeDetected(container);
      }
    });

    for (const [container] of this.trackedComposes) {
      if (!currentContainers.has(container) || !document.body.contains(container)) {
        console.log('[PostMail][Outlook:Detector] Compose window removed');
        this.trackedComposes.delete(container);
        this.callbacks.onComposeRemoved(container);
      }
    }
  }
}
