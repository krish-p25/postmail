import { SELECTORS, isComposeDialog } from './selectors';

export interface ComposeDetectorCallbacks {
  onComposeDetected: (element: HTMLElement) => void;
  onComposeRemoved: (element: HTMLElement) => void;
}

/**
 * Detects Gmail compose window appearance and removal.
 *
 * Uses MutationObserver on document.body to watch for dialog elements
 * that contain a subjectbox input (the hallmark of a compose window).
 */
export class ComposeDetector {
  private observer: MutationObserver | null = null;
  private trackedComposes = new Set<HTMLElement>();
  private callbacks: ComposeDetectorCallbacks;

  constructor(callbacks: ComposeDetectorCallbacks) {
    this.callbacks = callbacks;
  }

  start(): void {
    this.scan();

    this.observer = new MutationObserver(() => this.scan());
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.trackedComposes.clear();
  }

  private scan(): void {
    const dialogs = document.querySelectorAll(SELECTORS.COMPOSE_DIALOG);
    const currentComposes = new Set<HTMLElement>();

    dialogs.forEach((dialog) => {
      const el = dialog as HTMLElement;
      if (!isComposeDialog(el)) return;

      currentComposes.add(el);

      if (!this.trackedComposes.has(el)) {
        this.trackedComposes.add(el);
        this.callbacks.onComposeDetected(el);
      }
    });

    for (const tracked of this.trackedComposes) {
      if (!currentComposes.has(tracked) || !document.body.contains(tracked)) {
        this.trackedComposes.delete(tracked);
        this.callbacks.onComposeRemoved(tracked);
      }
    }
  }
}
